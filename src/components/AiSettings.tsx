import { useEffect, useState } from "react";
import { api, useSession } from "../lib";

type Provider = "openai" | "anthropic";
type Saved = { provider: Provider; baseUrl: string; model: string; keyHint: string; thinkingOff: boolean; updatedAt: number };

const PRESETS: { label: string; provider: Provider; baseUrl: string; model: string }[] = [
  { label: "Claude (Anthropic)", provider: "anthropic", baseUrl: "", model: "claude-opus-5-5" },
  { label: "OpenAI", provider: "openai", baseUrl: "https://api.openai.com/v1", model: "" },
  { label: "OpenRouter", provider: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "" },
  { label: "Other OpenAI-compatible server", provider: "openai", baseUrl: "", model: "" },
];

/** Lets a user run the AI perfumer and brand ideas on their own provider and key. */
export function AiSettings() {
  const { config, user, setUser } = useSession();
  const [saved, setSaved] = useState<Saved | null | undefined>(undefined);
  const [form, setForm] = useState({ provider: "anthropic" as Provider, baseUrl: "", model: "claude-opus-5-5", apiKey: "", thinkingOff: false });
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api("/me/ai").then((r) => {
      setSaved(r.settings);
      if (r.settings) setForm({ ...r.settings, apiKey: "" });
    }).catch(() => setSaved(null));
  }, []);

  if (config.userAi === false) return null;
  const set = (patch: Partial<typeof form>) => { setForm((f) => ({ ...f, ...patch })); setMsg(null); };
  const preset = PRESETS.find((p) => p.provider === form.provider && (p.provider === "anthropic" || p.baseUrl === form.baseUrl)) ?? PRESETS[3];
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(""); }
  };
  const save = () => run("save", async () => {
    const r = await api("/me/ai", { method: "PUT", body: form });
    setSaved(r.settings);
    setForm((f) => ({ ...f, apiKey: "" }));
    if (user) setUser({ ...user, ownAi: true });
    const t = await api("/me/ai/test", { body: {} });
    setMsg(t.ok ? { ok: true, text: `Saved. Your provider answered in ${(t.ms / 1000).toFixed(1)} seconds.` } : { ok: false, text: `Saved, but the test failed: ${t.error}` });
  });
  const test = () => run("test", async () => {
    const t = await api("/me/ai/test", { body: {} });
    setMsg(t.ok ? { ok: true, text: `Connected. Your provider answered in ${(t.ms / 1000).toFixed(1)} seconds.` } : { ok: false, text: t.error });
  });
  const remove = () => run("remove", async () => {
    if (!confirm("Remove your AI key? Rhythm will go back to its own AI.")) return;
    await api("/me/ai", { method: "DELETE" });
    setSaved(null);
    setForm({ provider: "anthropic", baseUrl: "", model: "claude-opus-5-5", apiKey: "", thinkingOff: false });
    if (user) setUser({ ...user, ownAi: false });
    setMsg({ ok: true, text: "Your key is removed." });
  });

  return (
    <section className="panel ai-settings" aria-labelledby="ai-settings-title">
      <h2 id="ai-settings-title">Your AI provider</h2>
      <p className="muted">Use your own API key for the AI perfumer and brand ideas. Your requests are billed by your provider, and you get a higher daily allowance. Without one, Rhythm uses {config.ai ? "its own AI" : "its built-in engine"}.</p>
      {saved === undefined ? <p className="muted" role="status">Loading…</p> : (
        <form onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label className="field"><span>Provider</span>
            <select value={preset.label} onChange={(e) => { const p = PRESETS.find((x) => x.label === e.target.value)!; set({ provider: p.provider, baseUrl: p.baseUrl, model: p.model }); }}>
              {PRESETS.map((p) => <option key={p.label}>{p.label}</option>)}
            </select>
          </label>
          {form.provider === "openai" && (
            <label className="field"><span>Server address</span>
              <input type="url" required inputMode="url" placeholder="https://api.example.com/v1" value={form.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} />
            </label>
          )}
          <label className="field"><span>Model</span>
            <input required={form.provider === "openai"} placeholder={form.provider === "anthropic" ? "claude-opus-5-5" : "The model name your provider uses"} value={form.model} onChange={(e) => set({ model: e.target.value })} />
          </label>
          <label className="field"><span>API key{saved && <small className="muted"> · saved key ends {saved.keyHint.replace("…", "")}</small>}</span>
            <input type="password" autoComplete="off" required={!saved} placeholder={saved ? "Leave blank to keep your saved key" : "Paste your key"} value={form.apiKey} onChange={(e) => set({ apiKey: e.target.value })} />
          </label>
          {form.provider === "openai" && (
            <label className="check">
              <input type="checkbox" checked={form.thinkingOff} onChange={(e) => set({ thinkingOff: e.target.checked })} />
              <span>Turn off model thinking. Use this for Qwen on vLLM if replies time out; other servers may reject it.</span>
            </label>
          )}
          <p className="muted small">Your key is encrypted and never shown again, including to Rhythm's administrators. Formulas and requests you send to the AI go to this provider under its terms.</p>
          {msg && <p className={msg.ok ? "good-text" : "warn-text"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
          <div className="actions">
            <button className="btn primary small" disabled={!!busy}>{busy === "save" ? "Saving and testing…" : "Save"}</button>
            {saved && <button type="button" className="btn small" disabled={!!busy} onClick={test}>{busy === "test" ? "Testing…" : "Test connection"}</button>}
            {saved && <button type="button" className="btn ghost small" disabled={!!busy} onClick={remove}>Remove key</button>}
          </div>
        </form>
      )}
    </section>
  );
}
