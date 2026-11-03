const enc = new TextEncoder();

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b as ArrayBuffer)].map((x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => Uint8Array.from(s.match(/.{2}/g) ?? [], (h) => parseInt(h, 16));

export const randomToken = (bytes = 32) => hex(crypto.getRandomValues(new Uint8Array(bytes)));
export const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 100000 is the most PBKDF2 iterations the Workers runtime permits.
const ITERATIONS = 100000;

async function derive(password: string, salt: Uint8Array, iterations: number, pepper: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password + pepper), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256));
}

export async function hashPassword(password: string, pepper = "") {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${hex(salt)}$${await derive(password, salt, ITERATIONS, pepper)}`;
}

export async function verifyPassword(password: string, stored: string, pepper = "") {
  const [, iter, salt, hash] = stored.split("$");
  if (!iter || !salt || !hash) return false;
  return safeEqual(await derive(password, unhex(salt), Number(iter), pepper), hash);
}

// AES-GCM for secrets stored at rest. The associated data binds each ciphertext to one context, such as a user id.
const secretKey = async (secret: string) =>
  crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", enc.encode(`rhythm-secret-box:${secret}`)), "AES-GCM", false, ["encrypt", "decrypt"]);

export async function seal(plain: string, secret: string, context: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(context) }, await secretKey(secret), enc.encode(plain));
  return `v1$${hex(iv)}$${hex(data)}`;
}

export async function unseal(sealed: string, secret: string, context: string) {
  const [, iv, data] = sealed.split("$");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unhex(iv ?? ""), additionalData: enc.encode(context) }, await secretKey(secret), unhex(data ?? ""));
  return new TextDecoder().decode(plain);
}

export const b64url =(data: string | Uint8Array | ArrayBuffer) => {
  const bytes = typeof data === "string" ? enc.encode(data) : new Uint8Array(data as ArrayBuffer);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1] ?? "";
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
}

/** ES256 client secret for Sign in with Apple. */
export async function appleClientSecret(teamId: string, clientId: string, keyId: string, pem: string) {
  const der = Uint8Array.from(atob(pem.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64url(JSON.stringify({ alg: "ES256", kid: keyId }))}.${b64url(JSON.stringify({ iss: teamId, iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: clientId }))}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(body));
  return `${body}.${b64url(sig)}`;
}
