import { useEffect, useRef, useState } from "react";
import { BOTTLES, CAPS, FINISHES, inkFor, LABEL_STYLES, PACKAGING, PALETTES, SWATCHES } from "../../shared/engine/brand";
import { CONCENTRATIONS } from "../../shared/engine/formula";
import { api, ApiError, type Branding, type BrandSnapshot, type Draft } from "../lib";
import { Bottle, Box } from "./Bottle";

type B = Branding;
const TABS = ["Concepts", "Name", "Bottle", "Colour", "Packaging", "Type"] as const;
type Tab = (typeof TABS)[number];
const TAB_FIELDS: Partial<Record<Tab, (keyof B)[]>> = {
  Name: ["name", "tagline", "story"],
  Bottle: ["bottle", "cap", "finish", "labelStyle"],
  Colour: ["glass", "accent", "label"],
  Packaging: ["packaging"],
};
const TAB_ICON: Record<Tab, string> = { Concepts: "💡", Name: "✍️", Bottle: "🧴", Colour: "🎨", Packaging: "🎁", Type: "💧" };
const REFINES = ["More poetic", "Shorter", "Bolder", "Playful", "Minimal", "Mysterious"];

const sameDesign = (a: B, b: B) => (Object.keys(TAB_FIELDS) as Tab[]).every((t) => TAB_FIELDS[t]!.every((f) => (a[f] ?? "") === (b[f] ?? "")));
const customised = (b: B, base?: B) => (base ? (Object.keys(TAB_FIELDS) as Tab[]).filter((t) => TAB_FIELDS[t]!.some((f) => (b[f] ?? "") !== (base[f] ?? ""))) : []);

function Swatches({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="swatch-row">
      <span>{label}</span>
      <div role="radiogroup" aria-label={label}>
        {options.map((c) => <button key={c} type="button" role="radio" aria-checked={value.toLowerCase() === c} aria-label={c} className={`swatch${value.toLowerCase() === c ? " on" : ""}`} style={{ background: c }} onClick={() => onChange(c)} />)}
        <label className="swatch custom" title="Custom colour"><input type="color" value={value} aria-label={`Custom ${label.toLowerCase()} colour`} onChange={(e) => onChange(e.target.value)} />+</label>
      </div>
    </div>
  );
}

export function IdentityEditor({ draft, update, ideas, busy, onSuggest, scentGlass, typeName }: {
  draft: Draft; update: (p: Partial<Draft>) => void; ideas: B[]; busy: boolean; onSuggest: (request?: string) => void; scentGlass: string; typeName: string;
}) {
  const [tab, setTab] = useState<Tab>("Concepts");
  const [brief, setBrief] = useState("");
  const [pending, setPending] = useState<B | null>(null);
  const [toast, setToast] = useState<{ text: string; restore: BrandSnapshot } | null>(null);
  const [writing, setWriting] = useState<string | null>(null);
  const [writeNote, setWriteNote] = useState<string | null>(null);
  const [refine, setRefine] = useState("");
  const b = draft.branding;
  const base = draft.conceptBase;
  const changedTabs = customised(b, base);
  const set = (patch: Partial<B>) => update({ branding: { ...b, ...patch } });
  const current: BrandSnapshot = { design: b, base };
  /** Puts the current design at the front of history, minus anything matching `drop`. */
  const remember = (drop?: B) => [current, ...draft.brandHistory.filter((h) => !sameDesign(h.design, b))].filter((h) => !drop || !sameDesign(h.design, drop)).slice(0, 8);

  /** Switching design keeps the old one in history, so it is always one click away. */
  const applyConcept = (x: B, label: string) => {
    update({ branding: { ...b, ...x }, conceptBase: { ...b, ...x }, brandHistory: remember() });
    setToast({ text: label, restore: current });
    setPending(null);
  };
  const pickConcept = (x: B) => {
    if (sameDesign(b, { ...b, ...x })) return;
    // Only a design the user has changed by hand needs a warning before it is replaced.
    if (changedTabs.length || !base) setPending(x);
    else applyConcept(x, `Switched to ${x.name}`);
  };
  const restore = (h: BrandSnapshot, label = `Restored ${h.design.name || "an earlier design"}`) => {
    update({ branding: h.design, conceptBase: h.base, brandHistory: remember(h.design) });
    setToast(label ? { text: label, restore: current } : null);
  };
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 8000); return () => clearTimeout(t); }, [toast]);

  const writer = useRef<AbortController | null>(null);
  const write = async (fields: ("name" | "tagline" | "story")[], request?: string, key = fields.join()) => {
    writer.current?.abort();
    const ctrl = new AbortController();
    writer.current = ctrl;
    setWriting(key);
    setWriteNote(null);
    try {
      const r = await api("/ai/name", { body: { items: draft.items, mood: draft.mood, current: { name: b.name, tagline: b.tagline, story: b.story, direction: b.direction }, fields, request, nonce: Date.now() % 100000 }, signal: ctrl.signal });
      // The draft may have moved on while the request ran; only the written fields change.
      update({ branding: { ...draftRef.current.branding, ...Object.fromEntries(fields.map((f) => [f, r[f]])) } });
      if (r.notice) setWriteNote(r.notice);
      else if (r.source === "engine") setWriteNote("Written by the Rhythm engine, because no AI model is connected. Add your own AI key in your account for richer copy.");
      else setWriteNote(`Written by the AI in ${((r.ms ?? 0) / 1000).toFixed(1)} s.`);
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "aborted")) setWriteNote((e as Error).message);
    } finally {
      if (writer.current === ctrl) { writer.current = null; setWriting(null); }
    }
  };
  const stopWriting = () => { writer.current?.abort(); writer.current = null; setWriting(null); setWriteNote("Stopped. Your text was left as it was."); };
  // Leaving the identity step abandons a request in flight, so it never holds a connection open.
  useEffect(() => () => writer.current?.abort(), []);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // A fresh identity arrives with its name filled in, so the tagline and story are written for it.
  useEffect(() => {
    if (!draft.items.length || b.tagline || b.story) return;
    write(["tagline", "story"], undefined, "auto");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fineTune = tab !== "Concepts";

  return (
    <div className="identity">
      <div className="identity-preview" aria-live="polite">
        <div className="stage" style={{ "--glow": b.glass } as React.CSSProperties}>
          <Bottle branding={b} width={190} />
          <Box branding={b} typeLabel={typeName} width={140} />
        </div>
        <p className="preview-name">{b.name || "Your fragrance"}</p>
        <p className="muted preview-tag">{b.tagline}</p>
        {draft.brandHistory.length > 0 && (
          <div className="design-history">
            <p className="eyebrow">Earlier designs</p>
            <div className="history-row">
              {draft.brandHistory.map((h, i) => (
                <button key={i} type="button" className="history-item" title={`Go back to ${h.design.name || "this design"}`} onClick={() => restore(h)}>
                  <span className="history-art" style={{ "--glow": h.design.glass } as React.CSSProperties}><Bottle branding={h.design} width={34} /></span>
                  <small>{h.design.name || "Untitled"}</small>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="identity-form">
        <div className="tabs identity-tabs" role="tablist">
          {TABS.map((t, i) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`${tab === t ? "on" : ""}${i === 0 ? " foundation" : ""}${changedTabs.includes(t) ? " edited" : ""}`} onClick={() => setTab(t)}>
              <span aria-hidden="true">{TAB_ICON[t]}</span>{t}{changedTabs.includes(t) && <i className="edited-dot" title="Customised" />}
            </button>
          )).flatMap((el, i) => (i === 1 ? [<span key="sep" className="tab-sep" aria-hidden="true">then fine-tune →</span>, el] : [el]))}
        </div>

        {toast && (
          <div className="identity-toast" role="status">
            <span>✓ {toast.text}</span>
            <button className="btn small" onClick={() => restore(toast.restore, "")}>Undo</button>
          </div>
        )}

        {fineTune && (
          <div className="based-on">
            <span className="based-art" style={{ "--glow": (base ?? b).glass } as React.CSSProperties}><Bottle branding={base ?? b} width={30} /></span>
            <span>
              <small className="muted">{base ? "Built on the concept" : "Starting design"}</small>
              <b>{base?.name ?? b.name}{base?.direction && <em> · {base.direction}</em>}</b>
              <small>{changedTabs.length ? <>You changed: {changedTabs.join(", ")}</> : "No changes yet. Everything here starts from this concept."}</small>
            </span>
            <span className="based-actions">
              {base && changedTabs.length > 0 && <button className="btn small ghost" onClick={() => applyConcept(base, `Reset to ${base.name}`)}>Reset to concept</button>}
              <button className="btn small ghost" onClick={() => setTab("Concepts")}>Change concept</button>
            </span>
          </div>
        )}

        {tab === "Concepts" && (
          <div>
            <p className="muted small-note">Start here. Each concept is a complete design (name, story, bottle, colours and packaging), and the other tabs fine-tune the one you pick. Earlier designs stay in history beside the preview.</p>
            <div className="concept-bar">
              <input value={brief} maxLength={200} placeholder="Steer the designer: minimal Japanese, art deco gold, playful…" aria-label="Design direction for new concepts" onChange={(e) => setBrief(e.target.value)} />
              <button className="btn small primary" disabled={busy} onClick={() => onSuggest(brief.trim() || undefined)}>{busy ? "Designing…" : "Design new concepts"}</button>
            </div>
            {pending && (
              <div className="concept-confirm" role="alertdialog" aria-label="Replace your design?">
                <div className="confirm-art" style={{ "--glow": pending.glass } as React.CSSProperties}><Bottle branding={b} width={44} /><span aria-hidden="true">→</span><Bottle branding={{ ...b, ...pending }} width={44} /></div>
                <div>
                  <b>Switch to {pending.name}?</b>
                  <p>{changedTabs.length ? `This replaces your changes to ${changedTabs.join(", ").toLowerCase()}.` : "This replaces your current name, bottle, colours and packaging."} Your current design is kept under Earlier designs, so you can go back at any time.</p>
                  <div className="actions">
                    <button className="btn primary small" onClick={() => applyConcept(pending, `Switched to ${pending.name}`)}>Switch design</button>
                    <button className="btn ghost small" onClick={() => setPending(null)}>Keep mine</button>
                  </div>
                </div>
              </div>
            )}
            <div className="concept-grid">
              {ideas.map((x) => {
                const on = !!base && sameDesign(base, { ...base, ...x });
                return (
                  <button key={x.name + x.tagline + x.bottle} className={`concept${on ? " on" : ""}`} aria-pressed={on} onClick={() => pickConcept(x)}>
                    {on && <span className="concept-badge">{changedTabs.length ? "Your base · customised" : "Your base"}</span>}
                    <div className="concept-art" style={{ "--glow": x.glass } as React.CSSProperties}><Bottle branding={x} width={80} /><Box branding={x} typeLabel={typeName} width={58} /></div>
                    {x.direction && <span className="eyebrow">{x.direction}</span>}
                    <b>{x.name}</b><span className="muted">{x.tagline}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tab === "Name" && (
          <div className="name-tab">
            <div className="ai-refine">
              <span className="ai-refine-label">✨ Fine-tune with AI</span>
              <div className="chips small">{REFINES.map((r) => <button key={r} type="button" className="chip" disabled={!!writing} onClick={() => write(["name", "tagline", "story"], r, "all")}>{r}</button>)}</div>
              <div className="concept-bar">
                <input value={refine} maxLength={300} placeholder="Or describe it: French-sounding, about a night swim…" aria-label="How the AI should rewrite the name, tagline and story" onChange={(e) => setRefine(e.target.value)} />
                <button className="btn small primary" disabled={!!writing} onClick={() => write(["name", "tagline", "story"], refine.trim() || undefined, "all")}>{writing === "all" ? "Writing…" : "Rewrite all"}</button>
                {writing && <button className="btn small ghost" onClick={stopWriting}>Stop</button>}
              </div>
            </div>
            {(["name", "tagline", "story"] as const).map((f) => {
              const label = f === "name" ? "Name" : f === "tagline" ? "Tagline" : "Story";
              const busyHere = writing === f || writing === "all" || (writing === "auto" && f !== "name");
              return (
                <label key={f} className={`field ai-field${busyHere ? " writing" : ""}`}>
                  <span>{label}<button type="button" className="link-btn ai-one" disabled={!!writing} onClick={(e) => { e.preventDefault(); write([f], refine.trim() || undefined, f); }}>{busyHere ? "Writing…" : `✨ New ${label.toLowerCase()}`}</button></span>
                  {f === "story"
                    ? <textarea rows={4} maxLength={400} value={b.story} onChange={(e) => set({ story: e.target.value })} />
                    : <input maxLength={f === "name" ? 60 : 100} value={b[f]} onChange={(e) => set({ [f]: e.target.value })} />}
                </label>
              );
            })}
            {writeNote && <p className="muted small-note">{writeNote}</p>}
          </div>
        )}

        {tab === "Bottle" && (
          <div>
            <fieldset className="choice"><legend>Shape</legend>
              <div className="shape-grid">{BOTTLES.map((o) => <button key={o.id} title={o.blurb} className={`option center${b.bottle === o.id ? " on" : ""}`} aria-pressed={b.bottle === o.id} onClick={() => set({ bottle: o.id })}><Bottle branding={{ ...b, bottle: o.id }} width={46} /><small>{o.name}</small></button>)}</div>
            </fieldset>
            <fieldset className="choice"><legend>Cap</legend>
              <div className="shape-grid">{CAPS.map((o) => <button key={o.id} className={`option center${b.cap === o.id ? " on" : ""}`} aria-pressed={b.cap === o.id} onClick={() => set({ cap: o.id })}><Bottle branding={{ ...b, cap: o.id }} width={40} /><small>{o.name}</small></button>)}</div>
            </fieldset>
            <fieldset className="choice"><legend>Glass finish</legend>
              <div className="shape-grid">{FINISHES.map((o) => <button key={o.id} className={`option center${b.finish === o.id ? " on" : ""}`} aria-pressed={b.finish === o.id} onClick={() => set({ finish: o.id })}><Bottle branding={{ ...b, finish: o.id }} width={40} /><small>{o.name}</small></button>)}</div>
            </fieldset>
            <fieldset className="choice"><legend>Label</legend>
              <div className="shape-grid">{LABEL_STYLES.map((o) => <button key={o.id} className={`option center${b.labelStyle === o.id ? " on" : ""}`} aria-pressed={b.labelStyle === o.id} onClick={() => set({ labelStyle: o.id })}><Bottle branding={{ ...b, labelStyle: o.id }} width={40} /><small>{o.name}</small></button>)}</div>
            </fieldset>
          </div>
        )}

        {tab === "Colour" && (
          <div>
            <fieldset className="choice"><legend>Colour stories</legend>
              <div className="palette-grid">
                <button className="palette" onClick={() => set({ glass: scentGlass, label: inkFor(b.accent) })}>
                  <span className="palette-dots"><i style={{ background: scentGlass }} /><i style={{ background: b.accent }} /><i style={{ background: inkFor(b.accent) }} /></span>Match the scent
                </button>
                {PALETTES.map((p) => {
                  const on = b.glass === p.glass && b.accent === p.accent && b.label === p.label;
                  return (
                    <button key={p.id} className={`palette${on ? " on" : ""}`} aria-pressed={on} onClick={() => set({ glass: p.glass, accent: p.accent, label: p.label })}>
                      <span className="palette-dots"><i style={{ background: p.glass }} /><i style={{ background: p.accent }} /><i style={{ background: p.label }} /></span>{p.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <Swatches label="Liquid" value={b.glass} options={[scentGlass, ...SWATCHES.glass]} onChange={(glass) => set({ glass })} />
            <Swatches label="Accent" value={b.accent} options={SWATCHES.accent} onChange={(accent) => set({ accent })} />
            <Swatches label="Lettering" value={b.label} options={SWATCHES.label} onChange={(label) => set({ label })} />
          </div>
        )}

        {tab === "Packaging" && (
          <div className="pack-grid">
            {PACKAGING.map((o) => (
              <button key={o.id} className={`option center pack${b.packaging === o.id ? " on" : ""}`} aria-pressed={b.packaging === o.id} onClick={() => set({ packaging: o.id })}>
                <Box branding={{ ...b, packaging: o.id }} typeLabel={typeName} width={86} /><b>{o.name}</b><small>{o.blurb}</small>
              </button>
            ))}
          </div>
        )}

        {tab === "Type" && (
          <div className="option-grid">{CONCENTRATIONS.map((c) => <button key={c.id} className={`option${draft.concentration === c.id ? " on" : ""}`} aria-pressed={draft.concentration === c.id} onClick={() => update({ concentration: c.id })}><b>{c.name}</b><small>{c.pct}% · {c.blurb}</small></button>)}</div>
        )}
      </div>
    </div>
  );
}
