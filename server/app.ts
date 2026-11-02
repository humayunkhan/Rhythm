import { Hono, type Context, type Next } from "hono";
import { z } from "zod";
import { analyse, normalise } from "../shared/engine/formula";
import { balance, dominantFacets } from "../shared/engine/generate";
import { suggestBranding } from "../shared/engine/brand";
import { NOTE_BY_ID } from "../shared/data/notes";
import { FAMILIES, FACETS } from "../shared/types";
import { adviseRequest, adviseSystem, AdviceSchema, brandRequest, BrandSchema, brandSystem, aiCallerFor, type AiCaller } from "./ai";
import { auth, issueToken, loadUser, publicUser } from "./auth";
import { TERMS_VERSION, type AppEnv, type Env, type UserRow } from "./env";
import { describeAiError, userAi, userAiAvailable, userAiEnv } from "./userAi";

export const app = new Hono<AppEnv>().basePath("/api");

/** Tests replace this to avoid calling a real AI server. */
export const aiRuntime: { call: AiCaller } = { call: (env, ...rest) => aiCallerFor(env)!(env, ...rest) };

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Something went wrong. Please try again." }, 500);
});

// Cross-site forms cannot send JSON without a CORS preflight, which this API never approves.
app.use("*", async (c, next) => {
  const method = c.req.method;
  if (method !== "GET" && method !== "HEAD" && !c.req.path.endsWith("/auth/apple/callback")) {
    if (!(c.req.header("content-type") ?? "").includes("application/json")) return c.json({ error: "JSON required" }, 415);
  }
  c.set("user", await loadUser(c));
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  if (!c.res.headers.get("Cache-Control")) c.header("Cache-Control", "no-store");
});

const requireUser = async (c: Context<AppEnv>, next: Next) => {
  if (!c.get("user")) return c.json({ error: "Please sign in." }, 401);
  await next();
};
const requireAdmin = async (c: Context<AppEnv>, next: Next) => {
  if (c.get("user")?.role !== "admin") return c.json({ error: "Not found" }, 404);
  await next();
};

app.get("/health", (c) => c.json({ ok: true }));

app.get("/config", (c) => {
  c.header("Cache-Control", "public, max-age=60, s-maxage=300");
  return c.json({
    google: !!c.env.GOOGLE_CLIENT_ID,
    apple: !!c.env.APPLE_CLIENT_ID,
    mail: !!c.env.RESEND_API_KEY,
    ai: !!aiCallerFor(c.env),
    userAi: userAiAvailable(c.env),
    termsVersion: TERMS_VERSION,
  });
});

app.route("/auth", auth);

// --- Catalogue overrides: admin-imported data merged over the bundled catalogue.

app.get("/catalog/overrides", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT kind, data FROM catalog_overrides").all<{ kind: string; data: string }>();
  c.header("Cache-Control", "public, max-age=60, s-maxage=300");
  return c.json({
    notes: results.filter((r) => r.kind === "note").map((r) => JSON.parse(r.data)),
    accords: results.filter((r) => r.kind === "accord").map((r) => JSON.parse(r.data)),
  });
});

// --- Account

app.patch("/me", requireUser, async (c) => {
  const body = z.object({ name: z.string().trim().max(80).optional(), taste: z.record(z.string().max(60), z.number().min(-1).max(1)).optional() }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Invalid profile" }, 400);
  const u = c.get("user")!;
  const name = body.data.name ?? u.name;
  const taste = body.data.taste ? JSON.stringify(body.data.taste) : u.taste;
  if (taste.length > 20000) return c.json({ error: "Taste profile is too large" }, 400);
  await c.env.DB.prepare("UPDATE users SET name = ?, taste = ? WHERE id = ?").bind(name, taste, u.id).run();
  return c.json({ user: publicUser({ ...u, name, taste }) });
});

app.post("/me/accept-terms", requireUser, async (c) => {
  const u = c.get("user")!;
  await c.env.DB.prepare("UPDATE users SET terms_version = ?, terms_accepted_at = ? WHERE id = ?").bind(TERMS_VERSION, Date.now(), u.id).run();
  return c.json({ user: publicUser({ ...u, terms_version: TERMS_VERSION }) });
});

app.use("/me/ai/*", requireUser);
app.use("/me/ai", requireUser);
app.route("/me/ai", userAi);

// Removes personal data. Saved formulas remain with Rhythm under the terms, detached from any identity.
app.post("/me/delete", requireUser, async (c) => {
  const u = c.get("user")!;
  if (u.role === "admin") return c.json({ error: "Transfer the admin role before deleting this account." }, 400);
  const db = c.env.DB;
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id),
    db.prepare("DELETE FROM tokens WHERE user_id = ?").bind(u.id),
    db.prepare("DELETE FROM oauth_accounts WHERE user_id = ?").bind(u.id),
    db.prepare("DELETE FROM user_ai_settings WHERE user_id = ?").bind(u.id),
    db.prepare("UPDATE users SET email = ?, name = '', password_hash = NULL, taste = '{}', disabled = 1 WHERE id = ?").bind(`deleted-${u.id}@invalid`, u.id),
  ]);
  return c.json({ ok: true });
});

// --- Formulas

const FormulaBody = z.object({
  name: z.string().trim().min(1).max(100),
  concentration: z.enum(["parfum", "edp", "edt", "edc", "mist", "oil", "solid"]),
  product: z.enum(["fine", "lip", "body", "rinse", "candle"]).default("fine"),
  items: z.array(z.object({ noteId: z.string().max(60), parts: z.number().min(0).max(1000) })).min(1).max(40),
  ideas: z.string().max(5000).default(""),
  brief: z.record(z.string(), z.unknown()).optional(),
  branding: z.record(z.string(), z.unknown()).optional(),
  batchMl: z.number().min(1).max(5000).optional(),
});

const withSummary = (data: z.infer<typeof FormulaBody>) => {
  const a = analyse(data.items, data.concentration, data.product);
  return { score: a.score, noteCount: data.items.length, json: JSON.stringify(data) };
};

const requireTerms = async (c: Context<AppEnv>, next: Next) => {
  if (c.get("user")?.terms_version !== TERMS_VERSION) return c.json({ error: "Please accept the current terms before saving.", code: "terms_required" }, 403);
  await next();
};

const formulaRow = (r: Record<string, unknown>) => ({
  id: r.id, name: r.name, concentration: r.concentration, score: r.score, noteCount: r.note_count, ideas: r.ideas,
  createdAt: r.created_at, updatedAt: r.updated_at, userEmail: r.email, userId: r.user_id,
  ...(r.data ? { data: JSON.parse(r.data as string) } : {}),
});

app.get("/formulas", requireUser, async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, concentration, score, note_count, ideas, created_at, updated_at, data FROM formulas WHERE user_id = ? ORDER BY updated_at DESC LIMIT 200",
  ).bind(c.get("user")!.id).all<Record<string, unknown>>();
  return c.json({ formulas: results.map(formulaRow) });
});

app.post("/formulas", requireUser, requireTerms, async (c) => {
  const body = FormulaBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "This formula could not be saved. Check its name and notes." }, 400);
  const s = withSummary(body.data);
  if (s.json.length > 100000) return c.json({ error: "Formula is too large" }, 413);
  const id = crypto.randomUUID();
  const now = Date.now();
  await c.env.DB.prepare(
    "INSERT INTO formulas (id, user_id, name, concentration, score, note_count, ideas, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, c.get("user")!.id, body.data.name, body.data.concentration, s.score, s.noteCount, body.data.ideas, s.json, now, now).run();
  return c.json({ id, score: s.score }, 201);
});

app.get("/formulas/:id", requireUser, async (c) => {
  const r = await c.env.DB.prepare("SELECT * FROM formulas WHERE id = ? AND user_id = ?").bind(c.req.param("id"), c.get("user")!.id).first<Record<string, unknown>>();
  return r ? c.json({ formula: formulaRow(r) }) : c.json({ error: "Not found" }, 404);
});

app.put("/formulas/:id", requireUser, requireTerms, async (c) => {
  const body = FormulaBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "This formula could not be saved. Check its name and notes." }, 400);
  const s = withSummary(body.data);
  if (s.json.length > 100000) return c.json({ error: "Formula is too large" }, 413);
  const res = await c.env.DB.prepare(
    "UPDATE formulas SET name = ?, concentration = ?, score = ?, note_count = ?, ideas = ?, data = ?, updated_at = ? WHERE id = ? AND user_id = ?",
  ).bind(body.data.name, body.data.concentration, s.score, s.noteCount, body.data.ideas, s.json, Date.now(), c.req.param("id"), c.get("user")!.id).run();
  return res.meta.changes ? c.json({ id: c.req.param("id"), score: s.score }) : c.json({ error: "Not found" }, 404);
});

app.delete("/formulas/:id", requireUser, async (c) => {
  const res = await c.env.DB.prepare("DELETE FROM formulas WHERE id = ? AND user_id = ?").bind(c.req.param("id"), c.get("user")!.id).run();
  return res.meta.changes ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404);
});

// --- AI layer. Everything has an offline answer, so the app keeps working without a key or quota.

async function takeAiQuota(c: Context<AppEnv>, user: UserRow, own: boolean) {
  // A personal key costs Rhythm nothing, but the server still makes the call, so it keeps a looser cap.
  const limit = Number((own ? c.env.AI_OWN_KEY_DAILY_LIMIT : c.env.AI_DAILY_LIMIT) ?? (own ? 300 : 30));
  const day = new Date().toISOString().slice(0, 10) + (own ? ":own" : "");
  const row = await c.env.DB.prepare(
    "INSERT INTO ai_usage (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT (user_id, day) DO UPDATE SET count = count + 1 RETURNING count",
  ).bind(user.id, day).first<{ count: number }>();
  return (row?.count ?? 0) <= limit;
}

/**
 * Runs an AI call with the user's own provider when they saved one, otherwise the platform's.
 * A failure with a personal key is reported back, since only the user can fix it; it never falls back to the platform key.
 */
async function runAi<T>(c: Context<AppEnv>, call: (env: Env) => Promise<T>): Promise<{ value: T } | { notice?: string }> {
  let own: Env | null;
  try { own = await userAiEnv(c); } catch (err) { return { notice: describeAiError(err) }; }
  const env = own ?? c.env;
  if (!aiCallerFor(env)) return {};
  if (!(await takeAiQuota(c, c.get("user")!, !!own))) return { notice: own ? "You've used today's AI requests. The Rhythm engine answered instead." : undefined };
  try {
    return { value: await call(env) };
  } catch (err) {
    console.error("AI call failed", own ? (err as Error).name : err);
    return { notice: own ? describeAiError(err) : undefined };
  }
}

const AdviseBody = z.object({
  items: z.array(z.object({ noteId: z.string().max(60), parts: z.number().min(0).max(1000) })).min(1).max(40),
  concentration: z.enum(["parfum", "edp", "edt", "edc", "mist", "oil", "solid"]),
  product: z.enum(["fine", "lip", "body", "rinse", "candle"]).default("fine"),
  request: z.string().max(500).optional(),
});

app.post("/ai/advise", requireUser, async (c) => {
  const body = AdviseBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Invalid formula" }, 400);
  const { items, concentration, product, request } = body.data;
  const analysis = analyse(items, concentration, product);
  const out = await runAi(c, (env) => aiRuntime.call(env, adviseSystem, adviseRequest({ items: normalise(items), concentration, analysis, request }), AdviceSchema));
  if (!("value" in out)) {
    const res = balance(items, { concentration, product });
    return c.json({
      source: "engine",
      notice: out.notice,
      summary: `Harmony ${res.after.harmony}, structure ${res.after.structure}. ${res.changes.length ? "The balancer has a proposed refinement." : "The structure already sits in range."}`,
      strengths: [`Leads with ${dominantFacets(res.after.facets).join(", ")} facets.`],
      risks: res.after.issues.map((i) => i.message).slice(0, 4),
      items: res.items,
      changes: res.changes,
      after: res.after,
    });
  }
  const advice = out.value;
  const merged = new Map(normalise(items).map((i) => [i.noteId, i.parts]));
  const why: string[] = [];
  for (const a of advice.adjustments) {
    if (!NOTE_BY_ID.has(a.noteId)) continue;
    if (a.parts <= 0) merged.delete(a.noteId);
    else merged.set(a.noteId, Math.min(100, a.parts));
    why.push(`${NOTE_BY_ID.get(a.noteId)!.name}: ${a.why}`);
  }
  // AI output is a proposal: hard limits are always re-applied by the engine.
  const res = balance([...merged].map(([noteId, parts]) => ({ noteId, parts })), { concentration, product });
  return c.json({ source: "ai", summary: advice.summary, strengths: advice.strengths, risks: advice.risks, items: res.items, changes: why, after: res.after });
});

app.post("/ai/brand", requireUser, async (c) => {
  const body = z.object({
    items: z.array(z.object({ noteId: z.string().max(60), parts: z.number().min(0).max(1000) })).min(1).max(40),
    mood: z.enum(["gentle", "refreshing", "romantic", "sensual", "mysterious", "uplifting", "cozy", "elegant"]).default("elegant"),
    request: z.string().max(500).optional(),
    nonce: z.number().int().min(0).max(1000000).default(0),
  }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Invalid request" }, 400);
  const { items, mood, request, nonce } = body.data;
  const a = analyse(items);
  const known = items.filter((i) => NOTE_BY_ID.has(i.noteId));
  const local = suggestBranding(a.facets, mood, known.map((i) => i.noteId).join(), nonce);
  const out = await runAi(c, (env) => aiRuntime.call(env, brandSystem, brandRequest({ notes: known.map((i) => NOTE_BY_ID.get(i.noteId)!.name), mood, facets: dominantFacets(a.facets), request }), BrandSchema));
  if (!("value" in out)) return c.json({ source: "engine", notice: out.notice, concepts: local });
  const concepts = out.value.concepts.slice(0, 3).map((x, i) => ({ ...local[i % local.length], ...x }));
  return c.json({ source: "ai", concepts });
});

// --- Admin

const admin = new Hono<AppEnv>();
admin.use("*", requireAdmin);

const audit = (c: Context<AppEnv>, action: string, target: string) =>
  c.env.DB.prepare("INSERT INTO audit_log (actor_id, action, target, at) VALUES (?, ?, ?, ?)").bind(c.get("user")!.id, action, target, Date.now()).run();

const count = async (c: Context<AppEnv>, sql: string, ...args: unknown[]) =>
  (await c.env.DB.prepare(sql).bind(...args).first<{ n: number }>())?.n ?? 0;

admin.get("/stats", async (c) => {
  const weekAgo = Date.now() - 7 * 86400000;
  const [users, activeUsers, formulas, newFormulas, avg] = await Promise.all([
    count(c, "SELECT COUNT(*) AS n FROM users WHERE email NOT LIKE 'deleted-%'"),
    count(c, "SELECT COUNT(*) AS n FROM users WHERE last_login_at > ?", weekAgo),
    count(c, "SELECT COUNT(*) AS n FROM formulas"),
    count(c, "SELECT COUNT(*) AS n FROM formulas WHERE created_at > ?", weekAgo),
    count(c, "SELECT COALESCE(ROUND(AVG(score)), 0) AS n FROM formulas"),
  ]);
  const { results: audit } = await c.env.DB.prepare(
    "SELECT a.action, a.target, a.at, u.email FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.at DESC LIMIT 20",
  ).all();
  return c.json({ users, activeUsers, formulas, newFormulas, averageScore: avg, audit });
});

const escapeLike = (q: string) => q.replace(/[\\%_]/g, (m) => `\\${m}`);

admin.get("/users", async (c) => {
  const q = c.req.query("q") ?? "";
  const page = Math.max(0, Number(c.req.query("page") ?? 0) || 0);
  const like = `%${escapeLike(q.toLowerCase())}%`;
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.disabled, u.email_verified, u.created_at, u.last_login_at, COUNT(f.id) AS formulas
     FROM users u LEFT JOIN formulas f ON f.user_id = u.id
     WHERE lower(u.email) LIKE ? ESCAPE '\\' OR lower(u.name) LIKE ? ESCAPE '\\'
     GROUP BY u.id ORDER BY u.created_at DESC LIMIT 50 OFFSET ?`,
  ).bind(like, like, page * 50).all();
  return c.json({ users: results });
});

admin.patch("/users/:id", async (c) => {
  const body = z.object({ role: z.enum(["user", "admin"]).optional(), disabled: z.boolean().optional() }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Invalid change" }, 400);
  const id = c.req.param("id");
  if (id === c.get("user")!.id) return c.json({ error: "You cannot change your own access." }, 400);
  const target = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
  if (!target) return c.json({ error: "Not found" }, 404);
  const role = body.data.role ?? target.role;
  const disabled = body.data.disabled ?? !!target.disabled;
  const stmts = [c.env.DB.prepare("UPDATE users SET role = ?, disabled = ? WHERE id = ?").bind(role, disabled ? 1 : 0, id)];
  if (disabled) stmts.push(c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id));
  await c.env.DB.batch(stmts);
  await audit(c, `user.update role=${role} disabled=${disabled}`, target.email);
  return c.json({ ok: true });
});

admin.post("/users/:id/reset-link", async (c) => {
  const target = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(c.req.param("id")).first<UserRow>();
  if (!target) return c.json({ error: "Not found" }, 404);
  if (target.role === "admin") return c.json({ error: "Reset links cannot be created for admins." }, 400);
  const token = await issueToken(c.env, target.id, "admin-reset", 3600000);
  await audit(c, "user.reset-link", target.email);
  return c.json({ url: `${new URL(c.req.url).origin}/login?reset=${token}` });
});

admin.get("/formulas", async (c) => {
  const q = c.req.query("q") ?? "";
  const userId = c.req.query("user");
  const page = Math.max(0, Number(c.req.query("page") ?? 0) || 0);
  const like = `%${escapeLike(q.toLowerCase())}%`;
  const { results } = await c.env.DB.prepare(
    `SELECT f.id, f.name, f.concentration, f.score, f.note_count, f.ideas, f.created_at, f.updated_at, f.user_id, u.email
     FROM formulas f JOIN users u ON u.id = f.user_id
     WHERE (lower(f.name) LIKE ? ESCAPE '\\' OR lower(u.email) LIKE ? ESCAPE '\\' OR lower(f.ideas) LIKE ? ESCAPE '\\') AND (? IS NULL OR f.user_id = ?)
     ORDER BY f.updated_at DESC LIMIT 50 OFFSET ?`,
  ).bind(like, like, like, userId ?? null, userId ?? null, page * 50).all<Record<string, unknown>>();
  return c.json({ formulas: results.map(formulaRow) });
});

admin.get("/formulas/:id", async (c) => {
  const r = await c.env.DB.prepare("SELECT f.*, u.email FROM formulas f JOIN users u ON u.id = f.user_id WHERE f.id = ?").bind(c.req.param("id")).first<Record<string, unknown>>();
  return r ? c.json({ formula: formulaRow(r) }) : c.json({ error: "Not found" }, 404);
});

admin.delete("/formulas/:id", async (c) => {
  const id = c.req.param("id");
  const res = await c.env.DB.prepare("DELETE FROM formulas WHERE id = ?").bind(id).run();
  if (!res.meta.changes) return c.json({ error: "Not found" }, 404);
  await audit(c, "formula.delete", id);
  return c.json({ ok: true });
});

const csvCell = (v: unknown) => {
  let s = String(v ?? "");
  // A leading formula character would execute when opened in a spreadsheet.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

admin.get("/export.csv", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT f.id, f.name, u.email, f.concentration, f.score, f.note_count, f.ideas, f.created_at, f.data FROM formulas f JOIN users u ON u.id = f.user_id ORDER BY f.created_at DESC",
  ).all<Record<string, unknown>>();
  const header = ["id", "name", "email", "concentration", "score", "notes", "ideas", "created", "formula"];
  const rows = results.map((r) => {
    const data = JSON.parse(r.data as string) as { items: { noteId: string; parts: number }[] };
    const formula = normalise(data.items).map((i) => `${i.noteId}:${i.parts.toFixed(2)}`).join(" ");
    return [r.id, r.name, r.email, r.concentration, r.score, r.note_count, r.ideas, new Date(r.created_at as number).toISOString(), formula].map(csvCell).join(",");
  });
  await audit(c, "export.csv", `${results.length} formulas`);
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", 'attachment; filename="rhythm-formulas.csv"');
  return c.body([header.join(","), ...rows].join("\n"));
});

const facetSchema = z.object(Object.fromEntries(FACETS.map((f) => [f, z.number().min(0).max(1.5)]))) as z.ZodType<Record<string, number>>;
const slugId = z.string().regex(/^[a-z0-9-]{1,60}$/);
const ImportNote = z.object({
  id: slugId,
  name: z.string().min(1).max(80),
  family: z.enum(FAMILIES),
  position: z.enum(["top", "heart", "base"]),
  sillage: z.number().min(1).max(10),
  projection: z.number().min(1).max(10),
  longevity: z.number().min(1).max(10),
  strength: z.number().min(1).max(10),
  dose: z.tuple([z.number().min(0), z.number().max(100)]),
  ifra: z.object({ cat4: z.number().min(0).max(100).nullable(), status: z.enum(["restricted", "specification", "not-modelled"]), note: z.string().max(300).optional() }),
  facets: facetSchema,
  pairs: z.array(z.string().max(60)).max(20),
  description: z.string().max(1000),
});
const ImportAccord = z.object({
  id: slugId,
  name: z.string().min(1).max(80),
  family: z.enum(FAMILIES),
  description: z.string().max(1000),
  character: z.array(z.string().max(40)).max(10),
  parts: z.record(z.string().max(60), z.number().min(0)),
  foundIn: z.array(z.string().max(100)).max(50),
  products: z.array(z.string().max(100)).max(50),
});

// Use only with data you have the rights to. See the README's data section.
admin.post("/catalog/import", async (c) => {
  const body = z.object({ notes: z.array(ImportNote).max(2000).default([]), accords: z.array(ImportAccord).max(2000).default([]) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Import rejected", details: body.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
  const now = Date.now();
  const stmt = c.env.DB.prepare("INSERT OR REPLACE INTO catalog_overrides (kind, id, data, updated_at) VALUES (?, ?, ?, ?)");
  const stmts = [
    ...body.data.notes.map((n) => stmt.bind("note", n.id, JSON.stringify(n), now)),
    ...body.data.accords.map((a) => stmt.bind("accord", a.id, JSON.stringify(a), now)),
  ];
  if (stmts.length) await c.env.DB.batch(stmts);
  await audit(c, "catalog.import", `${body.data.notes.length} notes, ${body.data.accords.length} accords`);
  return c.json({ notes: body.data.notes.length, accords: body.data.accords.length });
});

app.route("/admin", admin);
