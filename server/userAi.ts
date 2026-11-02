import { Hono, type Context } from "hono";
import { z } from "zod";
import { aiCallerFor } from "./ai";
import { seal, unseal } from "./crypto";
import type { AppEnv, Env } from "./env";

/** Users can bring their own AI provider. Keys are encrypted at rest and never sent back to any client. */
export const userAi = new Hono<AppEnv>();

type Row = { provider: "openai" | "anthropic"; base_url: string; model: string; key_enc: string; key_hint: string; thinking_off: number; updated_at: number };

const secretOf = (env: Env) => env.AI_KEY_SECRET || env.SESSION_PEPPER;
export const userAiAvailable = (env: Env) => !!secretOf(env);

const PRIVATE_HOST = /^(localhost|.*\.(localhost|local|internal|lan|home|corp)|0\.0\.0\.0|\[.*\]|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+)$/i;

/** The server fetches this address, so only public HTTPS hosts are accepted. */
export function checkBaseUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { return "Enter a full address, such as https://api.openai.com/v1"; }
  if (url.protocol !== "https:") return "The address must start with https://";
  if (url.username || url.password) return "Remove the user name and password from the address";
  if (PRIVATE_HOST.test(url.hostname) || !url.hostname.includes(".")) return "Rhythm's server can only reach public addresses";
  return null;
}

const Body = z.object({
  provider: z.enum(["openai", "anthropic"]),
  baseUrl: z.string().trim().max(300).default(""),
  model: z.string().trim().max(120).default(""),
  apiKey: z.string().trim().max(500).optional(),
  thinkingOff: z.boolean().default(false),
});

const view = (r: Row | null) => r && ({ provider: r.provider, baseUrl: r.base_url, model: r.model, keyHint: r.key_hint, thinkingOff: !!r.thinking_off, updatedAt: r.updated_at });
const load = (c: Context<AppEnv>) => c.env.DB.prepare("SELECT * FROM user_ai_settings WHERE user_id = ?").bind(c.get("user")!.id).first<Row>();

/** An Env pointing the AI callers at the user's provider, or null when they have none. Throws if the key can't be read. */
export async function userAiEnv(c: Context<AppEnv>): Promise<Env | null> {
  const u = c.get("user");
  if (!u?.own_ai || !secretOf(c.env)) return null;
  const r = await load(c);
  if (!r) return null;
  const key = await unseal(r.key_enc, secretOf(c.env)!, u.id);
  return r.provider === "anthropic"
    ? { ...c.env, LLM_BASE_URL: undefined, ANTHROPIC_API_KEY: key, ANTHROPIC_MODEL: r.model || "claude-opus-5-5" }
    : { ...c.env, LLM_BASE_URL: r.base_url, LLM_API_KEY: key, LLM_MODEL: r.model, LLM_THINKING: r.thinking_off ? "off" : undefined };
}

userAi.get("/", async (c) => c.json({ available: userAiAvailable(c.env), settings: view(await load(c)) }));

userAi.put("/", async (c) => {
  if (!userAiAvailable(c.env)) return c.json({ error: "Personal AI keys aren't enabled on this server." }, 503);
  const body = Body.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Check the AI settings and try again." }, 400);
  const d = body.data;
  if (d.provider === "openai") {
    const bad = checkBaseUrl(d.baseUrl);
    if (bad) return c.json({ error: bad }, 400);
    if (!d.model) return c.json({ error: "Enter the model name your provider uses." }, 400);
  }
  const u = c.get("user")!;
  const existing = await load(c);
  if (!d.apiKey && !existing) return c.json({ error: "Enter your API key." }, 400);
  const keyEnc = d.apiKey ? await seal(d.apiKey, secretOf(c.env)!, u.id) : existing!.key_enc;
  const keyHint = d.apiKey ? `…${d.apiKey.slice(-4)}` : existing!.key_hint;
  const row: Row = {
    provider: d.provider, base_url: d.provider === "openai" ? d.baseUrl.replace(/\/+$/, "") : "", model: d.model,
    key_enc: keyEnc, key_hint: keyHint, thinking_off: d.provider === "openai" && d.thinkingOff ? 1 : 0, updated_at: Date.now(),
  };
  await c.env.DB.prepare(
    `INSERT INTO user_ai_settings (user_id, provider, base_url, model, key_enc, key_hint, thinking_off, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET provider = excluded.provider, base_url = excluded.base_url, model = excluded.model,
     key_enc = excluded.key_enc, key_hint = excluded.key_hint, thinking_off = excluded.thinking_off, updated_at = excluded.updated_at`,
  ).bind(u.id, row.provider, row.base_url, row.model, row.key_enc, row.key_hint, row.thinking_off, row.updated_at).run();
  return c.json({ settings: view(row) });
});

userAi.delete("/", async (c) => {
  await c.env.DB.prepare("DELETE FROM user_ai_settings WHERE user_id = ?").bind(c.get("user")!.id).run();
  return c.json({ ok: true });
});

const Ping = z.object({ ok: z.boolean() });

userAi.post("/test", async (c) => {
  try {
    const env = await userAiEnv(c);
    if (!env) return c.json({ error: "Save your AI settings first." }, 400);
    const t = Date.now();
    await aiCallerFor(env)!(env, "Reply with JSON only.", "Return {\"ok\": true}.", Ping);
    return c.json({ ok: true, ms: Date.now() - t });
  } catch (err) {
    console.error("AI test failed", (err as Error).name, (err as Error).message);
    return c.json({ ok: false, error: describeAiError(err) });
  }
});

/** A user-safe reason for a failed call to the user's own provider. */
export function describeAiError(err: unknown) {
  const e = err as { name?: string; status?: number; message?: string };
  if (e.name === "TimeoutError") return "Your AI provider took too long to answer.";
  if (e.name === "OperationError") return "Your saved key can no longer be read. Enter it again.";
  if (e.status === 401 || e.status === 403) return "Your AI provider rejected the API key.";
  if (e.status === 404) return "Your AI provider doesn't recognise that model.";
  if (e.status === 429) return "Your AI provider says you are over your limit.";
  if (e.message?.startsWith("The AI server returned") || e.message === "No usable AI response") return `${e.message}.`;
  return "Rhythm couldn't reach your AI provider.";
}
