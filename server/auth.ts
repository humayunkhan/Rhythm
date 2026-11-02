import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { appleClientSecret, b64url, decodeJwtPayload, hashPassword, randomToken, safeEqual, sha256, verifyPassword } from "./crypto";
import { TERMS_VERSION, type AppEnv, type Env, type UserRow } from "./env";

const SESSION_COOKIE = "rhythm_session";
const SESSION_DAYS = 30;
const DAY = 86400000;

const isSecure = (c: Context) => new URL(c.req.url).protocol === "https:";
const clientIp = (c: Context) => c.req.header("cf-connecting-ip") ?? "local";

export function publicUser(u: UserRow) {
  return {
    id: u.id, email: u.email, name: u.name, role: u.role, emailVerified: !!u.email_verified,
    termsAccepted: u.terms_version === TERMS_VERSION, taste: JSON.parse(u.taste || "{}"), hasPassword: !!u.password_hash,
  };
}

export async function createSession(c: Context<AppEnv>, userId: string) {
  const token = randomToken();
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(await sha256(token), userId, now + SESSION_DAYS * DAY, now),
    c.env.DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(now, userId),
    c.env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
  ]);
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: isSecure(c), sameSite: "Lax", path: "/", maxAge: SESSION_DAYS * 86400 });
}

export async function loadUser(c: Context<AppEnv>): Promise<UserRow | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  return c.env.DB.prepare(
    "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0",
  ).bind(await sha256(token), Date.now()).first<UserRow>();
}

/** Sliding-window limit. Returns false once the key has used its allowance. */
export async function allow(env: Env, key: string, max: number, windowMs: number) {
  const now = Date.now();
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE key = ? AND at > ?").bind(key, now - windowMs).first<{ n: number }>();
  if ((row?.n ?? 0) >= max) return false;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO rate_limits (key, at) VALUES (?, ?)").bind(key, now),
    env.DB.prepare("DELETE FROM rate_limits WHERE at < ?").bind(now - DAY),
  ]);
  return true;
}

export const normaliseEmail = (e: string) => e.trim().toLowerCase();
const isAdminEmail = (env: Env, email: string) => !!env.ADMIN_EMAIL && normaliseEmail(env.ADMIN_EMAIL) === email;

async function sendMail(env: Env, to: string, subject: string, html: string) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to, subject, html }),
  });
  return res.ok;
}

export async function issueToken(env: Env, userId: string, purpose: string, ttlMs: number) {
  const token = randomToken();
  await env.DB.prepare("INSERT INTO tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256(token), userId, purpose, Date.now() + ttlMs).run();
  return token;
}

async function consumeToken(env: Env, token: string, purposes: string[]) {
  const hash = await sha256(token);
  const row = await env.DB.prepare("SELECT * FROM tokens WHERE token_hash = ? AND expires_at > ?").bind(hash, Date.now()).first<{ user_id: string; purpose: string }>();
  if (!row || !purposes.includes(row.purpose)) return null;
  await env.DB.prepare("DELETE FROM tokens WHERE token_hash = ?").bind(hash).run();
  return row;
}

const Credentials = z.object({ email: z.string().email().max(254), password: z.string().min(10).max(200) });

export const auth = new Hono<AppEnv>();

auth.post("/register", async (c) => {
  const body = z.object({
    email: z.string().email().max(254),
    password: z.string().min(10).max(200),
    name: z.string().trim().max(80).default(""),
    acceptTerms: z.literal(true),
    adminCode: z.string().max(200).optional(),
  }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Enter a valid email, a password of at least 10 characters, and accept the terms." }, 400);
  if (!(await allow(c.env, `register:${clientIp(c)}`, 10, 3600000))) return c.json({ error: "Too many attempts. Try again later." }, 429);
  const email = normaliseEmail(body.data.email);
  // Email is unverified at sign-up, so the admin address needs proof of ownership.
  const admin = isAdminEmail(c.env, email);
  if (admin && !(c.env.ADMIN_SETUP_CODE && body.data.adminCode && safeEqual(c.env.ADMIN_SETUP_CODE, body.data.adminCode))) {
    return c.json({ error: "This address is reserved. Enter the admin setup code, or sign in with a verified provider.", code: "admin_code_required" }, 403);
  }
  if (await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first()) return c.json({ error: "An account with this email already exists." }, 409);
  const id = crypto.randomUUID();
  const now = Date.now();
  await c.env.DB.prepare(
    "INSERT INTO users (id, email, name, password_hash, email_verified, role, terms_version, terms_accepted_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, email, body.data.name, await hashPassword(body.data.password, c.env.SESSION_PEPPER), admin ? 1 : 0, admin ? "admin" : "user", TERMS_VERSION, now, now).run();
  await createSession(c, id);
  if (!admin) {
    const token = await issueToken(c.env, id, "verify", 3 * DAY);
    const url = `${new URL(c.req.url).origin}/account?verify=${token}`;
    await sendMail(c.env, email, "Verify your Rhythm account", `<p>Confirm your email: <a href="${url}">${url}</a></p>`).catch(() => false);
  }
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
  return c.json({ user: publicUser(user!) }, 201);
});

auth.post("/login", async (c) => {
  const body = Credentials.safeParse(await c.req.json().catch(() => null));
  const generic = { error: "Incorrect email or password." };
  if (!body.success) return c.json(generic, 401);
  const email = normaliseEmail(body.data.email);
  if (!(await allow(c.env, `login:${email}:${clientIp(c)}`, 8, 900000))) return c.json({ error: "Too many attempts. Wait 15 minutes and try again." }, 429);
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();
  if (!user?.password_hash || !(await verifyPassword(body.data.password, user.password_hash, c.env.SESSION_PEPPER)) || user.disabled) return c.json(generic, 401);
  await createSession(c, user.id);
  return c.json({ user: publicUser(user) });
});

auth.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

auth.get("/me", (c) => {
  const user = c.get("user");
  c.header("Cache-Control", "private, no-store");
  return c.json({ user: user ? publicUser(user) : null });
});

auth.post("/forgot", async (c) => {
  const body = z.object({ email: z.string().email() }).safeParse(await c.req.json().catch(() => null));
  if (body.success && (await allow(c.env, `forgot:${clientIp(c)}`, 5, 3600000))) {
    const user = await c.env.DB.prepare("SELECT id, email FROM users WHERE email = ?").bind(normaliseEmail(body.data.email)).first<{ id: string; email: string }>();
    if (user && c.env.RESEND_API_KEY) {
      const token = await issueToken(c.env, user.id, "reset", 3600000);
      const url = `${new URL(c.req.url).origin}/login?reset=${token}`;
      await sendMail(c.env, user.email, "Reset your Rhythm password", `<p>Reset your password within an hour: <a href="${url}">${url}</a></p>`).catch(() => false);
    }
  }
  return c.json({ ok: true, delivery: !!c.env.RESEND_API_KEY });
});

auth.post("/reset", async (c) => {
  const body = z.object({ token: z.string().min(10), password: z.string().min(10).max(200) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Passwords need at least 10 characters." }, 400);
  const row = await consumeToken(c.env, body.data.token, ["reset", "admin-reset"]);
  if (!row) return c.json({ error: "This link is invalid or has expired." }, 400);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ?, email_verified = CASE WHEN ? = 'reset' THEN 1 ELSE email_verified END WHERE id = ?").bind(await hashPassword(body.data.password, c.env.SESSION_PEPPER), row.purpose, row.user_id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.user_id),
  ]);
  return c.json({ ok: true });
});

auth.post("/verify", async (c) => {
  const body = z.object({ token: z.string().min(10) }).safeParse(await c.req.json().catch(() => null));
  const row = body.success ? await consumeToken(c.env, body.data.token, ["verify"]) : null;
  if (!row) return c.json({ error: "This link is invalid or has expired." }, 400);
  await c.env.DB.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").bind(row.user_id).run();
  return c.json({ ok: true });
});

// --- OAuth: identity comes from an id_token received directly from the provider's token endpoint over TLS.

const OAUTH_COOKIE = "rhythm_oauth";

/** Links a provider identity. An unverified password on the same email is revoked, so a squatter cannot keep access. */
export async function completeOAuth(c: Context<AppEnv>, provider: string, subject: string, emailRaw: string, name: string) {
  const email = normaliseEmail(emailRaw);
  const db = c.env.DB;
  const linked = await db.prepare("SELECT u.* FROM oauth_accounts o JOIN users u ON u.id = o.user_id WHERE o.provider = ? AND o.subject = ?").bind(provider, subject).first<UserRow>();
  let user = linked ?? await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();
  if (user?.disabled) return null;
  if (!user) {
    const id = crypto.randomUUID();
    await db.prepare("INSERT INTO users (id, email, name, email_verified, role, created_at) VALUES (?, ?, ?, 1, ?, ?)").bind(id, email, name, isAdminEmail(c.env, email) ? "admin" : "user", Date.now()).run();
    user = await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
  } else if (!linked && !user.email_verified) {
    await db.batch([
      db.prepare("UPDATE users SET password_hash = NULL, email_verified = 1 WHERE id = ?").bind(user.id),
      db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    ]);
  }
  await db.prepare("INSERT OR IGNORE INTO oauth_accounts (provider, subject, user_id) VALUES (?, ?, ?)").bind(provider, subject, user!.id).run();
  if (isAdminEmail(c.env, user!.email) && user!.role !== "admin") await db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(user!.id).run();
  await createSession(c, user!.id);
  return user;
}

auth.get("/google/start", async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) return c.redirect("/login?error=provider");
  const state = randomToken(16);
  const nonce = randomToken(16);
  const verifier = randomToken(32);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  setCookie(c, OAUTH_COOKIE, JSON.stringify({ state, nonce, verifier }), { httpOnly: true, secure: isSecure(c), sameSite: "Lax", path: "/api/auth", maxAge: 600 });
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID, redirect_uri: `${new URL(c.req.url).origin}/api/auth/google/callback`, response_type: "code",
    scope: "openid email profile", state, nonce, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

auth.get("/google/callback", async (c) => {
  const saved = JSON.parse(getCookie(c, OAUTH_COOKIE) ?? "{}");
  deleteCookie(c, OAUTH_COOKIE, { path: "/api/auth" });
  const code = c.req.query("code");
  if (!code || !saved.state || c.req.query("state") !== saved.state) return c.redirect("/login?error=oauth");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: c.env.GOOGLE_CLIENT_ID!, client_secret: c.env.GOOGLE_CLIENT_SECRET ?? "", code_verifier: saved.verifier,
      grant_type: "authorization_code", redirect_uri: `${new URL(c.req.url).origin}/api/auth/google/callback`,
    }),
  });
  if (!res.ok) return c.redirect("/login?error=oauth");
  const claims = decodeJwtPayload(((await res.json()) as { id_token: string }).id_token);
  const issOk = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  if (!issOk || claims.aud !== c.env.GOOGLE_CLIENT_ID || claims.nonce !== saved.nonce || Number(claims.exp) * 1000 < Date.now() || claims.email_verified !== true || typeof claims.email !== "string") {
    return c.redirect("/login?error=oauth");
  }
  const user = await completeOAuth(c, "google", String(claims.sub), claims.email, String(claims.name ?? ""));
  return c.redirect(user ? "/create" : "/login?error=disabled");
});

auth.get("/apple/start", (c) => {
  if (!c.env.APPLE_CLIENT_ID) return c.redirect("/login?error=provider");
  const state = randomToken(16);
  const nonce = randomToken(16);
  // Apple posts the callback cross-site, which needs SameSite=None.
  setCookie(c, OAUTH_COOKIE, JSON.stringify({ state, nonce }), { httpOnly: true, secure: true, sameSite: "None", path: "/api/auth", maxAge: 600 });
  const params = new URLSearchParams({
    client_id: c.env.APPLE_CLIENT_ID, redirect_uri: `${new URL(c.req.url).origin}/api/auth/apple/callback`, response_type: "code",
    response_mode: "form_post", scope: "name email", state, nonce,
  });
  return c.redirect(`https://appleid.apple.com/auth/authorize?${params}`);
});

auth.post("/apple/callback", async (c) => {
  const saved = JSON.parse(getCookie(c, OAUTH_COOKIE) ?? "{}");
  deleteCookie(c, OAUTH_COOKIE, { path: "/api/auth", secure: true, sameSite: "None" });
  const form = await c.req.parseBody();
  const code = form.code;
  if (typeof code !== "string" || !saved.state || form.state !== saved.state) return c.redirect("/login?error=oauth");
  const env = c.env;
  const secret = await appleClientSecret(env.APPLE_TEAM_ID!, env.APPLE_CLIENT_ID!, env.APPLE_KEY_ID!, env.APPLE_PRIVATE_KEY!);
  const res = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env.APPLE_CLIENT_ID!, client_secret: secret, grant_type: "authorization_code", redirect_uri: `${new URL(c.req.url).origin}/api/auth/apple/callback` }),
  });
  if (!res.ok) return c.redirect("/login?error=oauth");
  const claims = decodeJwtPayload(((await res.json()) as { id_token: string }).id_token);
  const verified = claims.email_verified === true || claims.email_verified === "true";
  if (claims.iss !== "https://appleid.apple.com" || claims.aud !== env.APPLE_CLIENT_ID || claims.nonce !== saved.nonce || Number(claims.exp) * 1000 < Date.now() || !verified || typeof claims.email !== "string") {
    return c.redirect("/login?error=oauth");
  }
  let name = "";
  if (typeof form.user === "string") {
    try { const n = JSON.parse(form.user).name; name = [n?.firstName, n?.lastName].filter(Boolean).join(" "); } catch { /* Apple sends the name once; it is optional. */ }
  }
  const user = await completeOAuth(c, "apple", String(claims.sub), claims.email, name);
  return c.redirect(user ? "/create" : "/login?error=disabled");
});
