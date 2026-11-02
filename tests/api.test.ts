import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdviceSchema, aiCallerFor, callOpenAiCompatible } from "../server/ai";
import { aiRuntime, app } from "../server/app";
import type { Env } from "../server/env";
import { createD1 } from "./d1-stub";

let env: Env;
const ADMIN = "owner@rhythm.test";

class Client {
  cookie = "";
  async req(method: string, path: string, body?: unknown, ip = "1.1.1.1") {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { "content-type": "application/json", cookie: this.cookie, "cf-connecting-ip": ip },
      body: body === undefined ? undefined : JSON.stringify(body),
    }, env);
    const set = res.headers.get("set-cookie");
    if (set?.startsWith("rhythm_session=")) this.cookie = set.split(";")[0];
    const type = res.headers.get("content-type") ?? "";
    return { status: res.status, headers: res.headers, json: (type.includes("json") ? await res.json() : await res.text()) as any };
  }
  register(email: string, extra: object = {}) {
    return this.req("POST", "/auth/register", { email, password: "correct-horse-1", name: "T", acceptTerms: true, ...extra });
  }
}

const formula = { name: "Test", concentration: "edp", items: [{ noteId: "bergamot", parts: 20 }, { noteId: "rose", parts: 40 }, { noteId: "sandalwood", parts: 40 }], ideas: "for autumn =1+1" };

beforeEach(() => {
  env = { DB: createD1(), ADMIN_EMAIL: ADMIN, ADMIN_SETUP_CODE: "setup-code-123", AI_DAILY_LIMIT: "2" };
});

describe("auth", () => {
  it("registers, restores session, logs out and logs in", async () => {
    const c = new Client();
    expect((await c.register("a@b.co")).status).toBe(201);
    expect((await c.req("GET", "/auth/me")).json.user.email).toBe("a@b.co");
    await c.req("POST", "/auth/logout", {});
    expect((await c.req("GET", "/auth/me")).json.user).toBeNull();
    expect((await c.req("POST", "/auth/login", { email: "A@B.co", password: "wrong-password-1" })).status).toBe(401);
    expect((await c.req("POST", "/auth/login", { email: "A@B.co", password: "correct-horse-1" })).status).toBe(200);
  });
  it("requires terms acceptance and strong passwords", async () => {
    const c = new Client();
    expect((await c.register("a@b.co", { acceptTerms: false })).status).toBe(400);
    expect((await c.register("a@b.co", { password: "short" })).status).toBe(400);
    await c.register("a@b.co");
    expect((await new Client().register("a@b.co")).status).toBe(409);
  });
  it("cannot claim admin by registering its email without the setup code", async () => {
    expect((await new Client().register(ADMIN)).status).toBe(403);
    expect((await new Client().register(ADMIN, { adminCode: "wrong" })).status).toBe(403);
    const ok = await new Client().register(ADMIN, { adminCode: "setup-code-123" });
    expect(ok.json.user.role).toBe("admin");
  });
  it("rate limits login", async () => {
    const c = new Client();
    await c.register("a@b.co");
    for (let i = 0; i < 8; i++) await c.req("POST", "/auth/login", { email: "a@b.co", password: "wrong-password-1" });
    expect((await c.req("POST", "/auth/login", { email: "a@b.co", password: "correct-horse-1" })).status).toBe(429);
  });
  it("rejects non-JSON writes", async () => {
    const res = await app.request("/api/auth/logout", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" } }, env);
    expect(res.status).toBe(415);
  });
  it("OAuth removes a squatter's password and sessions on an unverified account", async () => {
    const { completeOAuth } = await import("../server/auth");
    const squatter = new Client();
    await squatter.register("victim@b.co");
    const fake: any = { env, req: { url: "https://x.test/", header: () => undefined }, header: () => {}, res: { headers: new Headers() } };
    await completeOAuth(fake, "google", "sub-1", "victim@b.co", "V");
    expect((await squatter.req("GET", "/auth/me")).json.user).toBeNull();
    expect((await squatter.req("POST", "/auth/login", { email: "victim@b.co", password: "correct-horse-1" })).status).toBe(401);
  });
  it("disabled users lose access immediately", async () => {
    const a = new Client();
    await a.register(ADMIN, { adminCode: "setup-code-123" });
    const u = new Client();
    const id = (await u.register("u@b.co")).json.user.id;
    await a.req("PATCH", `/admin/users/${id}`, { disabled: true });
    expect((await u.req("GET", "/formulas")).status).toBe(401);
    expect((await u.req("POST", "/auth/login", { email: "u@b.co", password: "correct-horse-1" })).status).toBe(401);
  });
  it("admin reset link works once", async () => {
    const a = new Client();
    await a.register(ADMIN, { adminCode: "setup-code-123" });
    const u = new Client();
    const id = (await u.register("u@b.co")).json.user.id;
    const token = new URL((await a.req("POST", `/admin/users/${id}/reset-link`, {})).json.url).searchParams.get("reset");
    expect((await u.req("POST", "/auth/reset", { token, password: "brand-new-pass-1" })).status).toBe(200);
    expect((await u.req("POST", "/auth/reset", { token, password: "brand-new-pass-2" })).status).toBe(400);
    expect((await u.req("GET", "/auth/me")).json.user).toBeNull();
    expect((await u.req("POST", "/auth/login", { email: "u@b.co", password: "brand-new-pass-1" })).status).toBe(200);
  });
});

describe("formulas", () => {
  it("isolates users and scores on the server", async () => {
    const a = new Client(), b = new Client();
    await a.register("a@b.co");
    await b.register("b@b.co");
    const { json } = await a.req("POST", "/formulas", formula);
    expect(json.score).toBeGreaterThan(0);
    expect((await a.req("GET", "/formulas")).json.formulas).toHaveLength(1);
    expect((await b.req("GET", "/formulas")).json.formulas).toHaveLength(0);
    expect((await b.req("GET", `/formulas/${json.id}`)).status).toBe(404);
    expect((await b.req("PUT", `/formulas/${json.id}`, formula)).status).toBe(404);
    expect((await b.req("DELETE", `/formulas/${json.id}`)).status).toBe(404);
    expect((await a.req("PUT", `/formulas/${json.id}`, { ...formula, name: "Renamed" })).status).toBe(200);
    expect((await a.req("GET", `/formulas/${json.id}`)).json.formula.name).toBe("Renamed");
    expect((await a.req("DELETE", `/formulas/${json.id}`)).status).toBe(200);
  });
  it("needs sign-in and valid data", async () => {
    expect((await new Client().req("POST", "/formulas", formula)).status).toBe(401);
    const a = new Client();
    await a.register("a@b.co");
    expect((await a.req("POST", "/formulas", { ...formula, items: [] })).status).toBe(400);
  });
  it("needs current terms before saving", async () => {
    const a = new Client();
    await a.register("a@b.co");
    await (env.DB.prepare("UPDATE users SET terms_version = 'old'").run());
    const res = await a.req("POST", "/formulas", formula);
    expect(res.json.code).toBe("terms_required");
    await a.req("POST", "/me/accept-terms", {});
    expect((await a.req("POST", "/formulas", formula)).status).toBe(201);
  });
});

describe("admin", () => {
  it("is hidden from normal users", async () => {
    const u = new Client();
    await u.register("u@b.co");
    for (const p of ["/admin/stats", "/admin/users", "/admin/formulas", "/admin/export.csv"]) expect((await u.req("GET", p)).status).toBe(404);
    expect((await new Client().req("GET", "/admin/stats")).status).toBe(404);
  });
  it("sees all users and formulas, exports safe CSV and audits", async () => {
    const a = new Client();
    await a.register(ADMIN, { adminCode: "setup-code-123" });
    const u = new Client();
    await u.register("u@b.co");
    const { json } = await u.req("POST", "/formulas", { ...formula, name: "=HYPERLINK(1)" });
    expect((await a.req("GET", "/admin/stats")).json.formulas).toBe(1);
    expect((await a.req("GET", "/admin/users?q=u@b")).json.users).toHaveLength(1);
    expect((await a.req("GET", "/admin/formulas?q=autumn")).json.formulas[0].userEmail).toBe("u@b.co");
    expect((await a.req("GET", `/admin/formulas/${json.id}`)).json.formula.data.ideas).toContain("autumn");
    const csv = (await a.req("GET", "/admin/export.csv")).json as string;
    expect(csv).toContain(`"'=HYPERLINK(1)"`);
    expect((await a.req("GET", "/admin/stats")).json.audit[0].action).toBe("export.csv");
  });
  it("imports validated catalogue data", async () => {
    const a = new Client();
    await a.register(ADMIN, { adminCode: "setup-code-123" });
    expect((await a.req("POST", "/admin/catalog/import", { notes: [{ id: "BAD ID" }] })).status).toBe(400);
    const accord = { id: "new-accord", name: "New", family: "floral", description: "d", character: [], parts: { rose: 1 }, foundIn: [], products: [] };
    expect((await a.req("POST", "/admin/catalog/import", { accords: [accord] })).json.accords).toBe(1);
    expect((await new Client().req("GET", "/catalog/overrides")).json.accords[0].id).toBe("new-accord");
  });
});

describe("AI layer", () => {
  const body = { items: formula.items, concentration: "edp" };
  it("uses the offline engine with no key", async () => {
    const a = new Client();
    await a.register("a@b.co");
    const spy = vi.spyOn(aiRuntime, "call");
    expect((await a.req("POST", "/ai/advise", body)).json.source).toBe("engine");
    expect((await a.req("POST", "/ai/brand", { items: formula.items })).json.concepts).toHaveLength(3);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("re-applies IFRA caps to AI proposals, ignores unknown notes, enforces quota and survives failure", async () => {
    env.ANTHROPIC_API_KEY = "test";
    const a = new Client();
    await a.register("a@b.co");
    const spy = vi.spyOn(aiRuntime, "call").mockResolvedValueOnce({
      summary: "s", strengths: [], risks: [],
      adjustments: [{ noteId: "oakmoss", parts: 50, why: "depth" }, { noteId: "made-up", parts: 10, why: "x" }],
    } as never);
    const res = await a.req("POST", "/ai/advise", body);
    expect(res.json.source).toBe("ai");
    expect(res.json.items.some((i: any) => i.noteId === "made-up")).toBe(false);
    expect(res.json.after.issues.filter((i: any) => i.code === "ifra")).toEqual([]);
    spy.mockRejectedValueOnce(new Error("boom"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await a.req("POST", "/ai/advise", body)).json.source).toBe("engine");
    spy.mockClear();
    expect((await a.req("POST", "/ai/advise", body)).json.source).toBe("engine");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    quiet.mockRestore();
  });
  it("calls an OpenAI-compatible server with thinking off and validates its JSON", async () => {
    const reply = { summary: "s", strengths: [], risks: [], adjustments: [] };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: `<think>x</think>\`\`\`json\n${JSON.stringify(reply)}\n\`\`\`` } }] })));
    const llm = { ...env, LLM_BASE_URL: "https://llm.test/v1/", LLM_API_KEY: "k", LLM_MODEL: "m", LLM_THINKING: "off" };
    expect(aiCallerFor(llm)).toBe(callOpenAiCompatible);
    expect(await callOpenAiCompatible(llm, "sys", "user", AdviceSchema)).toEqual(reply);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://llm.test/v1/chat/completions");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "m", chat_template_kwargs: { enable_thinking: false }, response_format: { type: "json_schema" } });
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "{\"summary\":1}" } }] })));
    await expect(callOpenAiCompatible(llm, "sys", "user", AdviceSchema)).rejects.toThrow("No usable AI response");
    fetchSpy.mockRestore();
  });
  it("lets users bring their own key, keeps it secret and uses it instead of the platform's", async () => {
    env.SESSION_PEPPER = "pepper";
    env.LLM_BASE_URL = "https://platform.test/v1";
    const a = new Client();
    await a.register("a@b.co");
    const bad = { provider: "openai", baseUrl: "https://10.0.0.5/v1", model: "m", apiKey: "sk-user-secret-1234" };
    expect((await a.req("PUT", "/me/ai", bad)).json.error).toMatch(/public/);
    expect((await a.req("PUT", "/me/ai", { ...bad, baseUrl: "http://llm.example.com/v1" })).json.error).toMatch(/https/);
    expect((await a.req("PUT", "/me/ai", { ...bad, baseUrl: "https://llm.example.com/v1", apiKey: undefined })).status).toBe(400);
    const put = await a.req("PUT", "/me/ai", { ...bad, baseUrl: "https://llm.example.com/v1/", thinkingOff: true });
    expect(put.json.settings).toMatchObject({ provider: "openai", baseUrl: "https://llm.example.com/v1", keyHint: "…1234", thinkingOff: true });
    expect(JSON.stringify((await a.req("GET", "/me/ai")).json)).not.toContain("secret");
    const stored = await env.DB.prepare("SELECT key_enc FROM user_ai_settings").first<{ key_enc: string }>();
    expect(stored!.key_enc).not.toContain("secret");
    expect((await a.req("GET", "/auth/me")).json.user.ownAi).toBe(true);

    const spy = vi.spyOn(aiRuntime, "call").mockResolvedValueOnce({ summary: "s", strengths: [], risks: [], adjustments: [] } as never);
    expect((await a.req("POST", "/ai/advise", body)).json.source).toBe("ai");
    const used = spy.mock.calls[0][0];
    expect(used).toMatchObject({ LLM_BASE_URL: "https://llm.example.com/v1", LLM_API_KEY: "sk-user-secret-1234", LLM_MODEL: "m", LLM_THINKING: "off" });
    // Own-key failures are explained, and never retried on the platform key.
    spy.mockRejectedValueOnce(Object.assign(new Error("x"), { status: 401 }));
    const failed = await a.req("POST", "/ai/advise", body);
    expect(failed.json).toMatchObject({ source: "engine", notice: "Your AI provider rejected the API key." });
    expect(spy).toHaveBeenCalledTimes(2);
    // The own-key allowance is separate from the platform's (AI_DAILY_LIMIT is 2 here).
    spy.mockResolvedValue({ concepts: [] } as never);
    for (let i = 0; i < 2; i++) expect((await a.req("POST", "/ai/brand", { items: formula.items })).json.source).toBe("ai");
    spy.mockRestore();

    // Keeps the saved key when the form leaves it blank, and switching provider moves to Claude.
    await a.req("PUT", "/me/ai", { provider: "anthropic", model: "" });
    const fresh = vi.spyOn(aiRuntime, "call").mockResolvedValueOnce({ concepts: [] } as never);
    await a.req("POST", "/ai/brand", { items: formula.items });
    expect(fresh.mock.calls[0][0]).toMatchObject({ LLM_BASE_URL: undefined, ANTHROPIC_API_KEY: "sk-user-secret-1234", ANTHROPIC_MODEL: "claude-opus-5-5" });
    fresh.mockRestore();

    // A changed secret makes the key unreadable, which is reported rather than leaking to the platform key.
    env.SESSION_PEPPER = "rotated";
    const rotated = vi.spyOn(aiRuntime, "call");
    expect((await a.req("POST", "/ai/advise", body)).json.notice).toMatch(/Enter it again/);
    expect(rotated).not.toHaveBeenCalled();
    rotated.mockRestore();

    expect((await a.req("DELETE", "/me/ai")).status).toBe(200);
    expect((await a.req("GET", "/me/ai")).json.settings).toBeNull();
    expect((await new Client().req("GET", "/me/ai")).status).toBe(401);
  });
  it("needs sign-in", async () => {
    expect((await new Client().req("POST", "/ai/advise", body)).status).toBe(401);
  });
});

describe("account deletion", () => {
  it("removes personal data and access", async () => {
    const a = new Client();
    await a.register("a@b.co");
    await a.req("POST", "/formulas", formula);
    expect((await a.req("POST", "/me/delete", {})).status).toBe(200);
    expect((await a.req("GET", "/auth/me")).json.user).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM users WHERE email = 'a@b.co'").first()).toBeNull();
    expect((await a.register("a@b.co")).status).toBe(201);
  });
});
