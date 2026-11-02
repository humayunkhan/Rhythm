import { useEffect, useMemo, useRef, useState } from "react";
import { NOTES, note, NOTE_BY_ID } from "../../shared/data/notes";
import { analyse, batchSheet, CONCENTRATIONS, normalise, PRODUCTS, concentration } from "../../shared/engine/formula";
import { balance, suggestAdditions, type BalanceGoals } from "../../shared/engine/generate";
import { scentColor } from "../../shared/engine/brand";
import { DEFAULT_ENV, scentAt, simulate, type Environment } from "../../shared/engine/simulate";
import type { FormulaItem } from "../../shared/types";
import { api, fmtDuration, noteColor, useSession, type Draft } from "../lib";
import { Bottle } from "./Bottle";
import { FacetRadar, facetsAt, NoteLifetimes, ProjectionWaves, Pyramid, ScentRiver, ScoreRing, SillageAura } from "./viz";

type Proposal = { source: "engine" | "ai"; summary: string; strengths: string[]; risks: string[]; items: FormulaItem[]; changes: string[]; afterScore: number };

const GOALS: { key: keyof BalanceGoals; label: string; low: string; high: string }[] = [
  { key: "longevity", label: "Longevity", low: "Fleeting", high: "All day" },
  { key: "sillage", label: "Sillage", low: "Intimate", high: "Room-filling" },
  { key: "freshness", label: "Freshness", low: "Warm", high: "Fresh" },
  { key: "sweetness", label: "Sweetness", low: "Dry", high: "Sweet" },
];

export function Studio({ draft, update }: { draft: Draft; update: (patch: Partial<Draft>) => void }) {
  const { user, config } = useSession();
  const [hour, setHour] = useState(0.25);
  const [playing, setPlaying] = useState(false);
  const [env, setEnv] = useState<Environment>(DEFAULT_ENV);
  const [goals, setGoals] = useState<BalanceGoals>({});
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [aiText, setAiText] = useState("");
  const [busy, setBusy] = useState(false);
  const [addQ, setAddQ] = useState("");
  const { items, concentration: conc, product, batchMl } = draft;

  const known = useMemo(() => items.filter((i) => NOTE_BY_ID.has(i.noteId)), [items]);
  const analysis = useMemo(() => analyse(known, conc, product), [known, conc, product]);
  const sim = useMemo(() => simulate(known, conc, env), [known, conc, env]);
  const present = useMemo(() => scentAt(sim, hour), [sim, hour]);
  const radar = useMemo(() => facetsAt(sim, hour), [sim, hour]);
  const norm = useMemo(() => normalise(known), [known]);
  const batch = useMemo(() => batchSheet(known, conc, batchMl), [known, conc, batchMl]);
  const suggestions = useMemo(() => suggestAdditions(known, 4), [known]);
  const intensity = Math.max(...sim.total, 0.01);
  const fill = Math.min(1, sim.total[sim.times.findIndex((t) => t >= hour)] / intensity || 0);

  const frame = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      let done = false;
      setHour((h) => {
        // Time eases so early changes get as much screen time as the long drydown.
        const s = Math.sqrt(h / 24) + dt / 12;
        if (s >= 1) { done = true; return 24; }
        return s * s * 24;
      });
      if (done) setPlaying(false);
      else frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playing]);

  const setItems = (next: FormulaItem[]) => { setProposal(null); update({ items: next }); };
  const setPct = (id: string, pct: number) => {
    // Moving one slider keeps the others in proportion, so percentages always read true.
    const others = norm.filter((i) => i.noteId !== id);
    const rest = others.reduce((s, i) => s + i.parts, 0) || 1;
    setItems(norm.map((i) => i.noteId === id ? { ...i, parts: pct } : { ...i, parts: (i.parts / rest) * (100 - pct) }));
  };
  const remove = (id: string) => setItems(known.filter((i) => i.noteId !== id));
  const add = (id: string) => {
    const n = note(id);
    if (!known.some((i) => i.noteId === id)) setItems([...normalise(known), { noteId: id, parts: (n.dose[0] + n.dose[1]) / 2 }]);
    setAddQ("");
  };

  const proposeBalance = () => {
    const res = balance(known, { concentration: conc, product, goals });
    setProposal({ source: "engine", summary: res.changes.length ? `Score moves from ${res.before.score} to ${res.after.score}.` : "The formula already sits within range for these goals.", strengths: [], risks: [], items: res.items, changes: res.changes, afterScore: res.after.score });
  };
  const askAi = async () => {
    setBusy(true);
    try {
      const r = await api("/ai/advise", { body: { items: normalise(known), concentration: conc, product, request: aiText || undefined } });
      setProposal({ source: r.source, summary: r.summary, strengths: r.strengths, risks: r.risks, items: r.items, changes: r.changes, afterScore: r.after.score });
    } catch (e) {
      setProposal({ source: "engine", summary: (e as Error).message, strengths: [], risks: [], items: [], changes: [], afterScore: analysis.score });
    } finally { setBusy(false); }
  };

  const addMatches = addQ.trim() ? NOTES.filter((n) => n.name.toLowerCase().includes(addQ.trim().toLowerCase()) && !known.some((i) => i.noteId === n.id)).slice(0, 6) : [];
  const issues = analysis.issues;
  const blocked = issues.some((i) => i.severity === "block");
  const finishedRows = new Map(analysis.ifra.map((r) => [r.noteId, r]));
  const c = concentration(conc);
  const color = scentColor(analysis.facets);

  if (!known.length) return <p className="muted">Add a note to begin.</p>;

  return (
    <div className="studio">
      <section className="panel studio-hero">
        <div className="hero-time">
          <div>
            <p className="eyebrow">{hour < 0.5 ? "The opening" : hour < 3 ? "The heart" : hour < 10 ? "The drydown" : "The last trace"}</p>
            <h2 className="time-big">{hour < 1 ? `${Math.round(hour * 60)} minutes` : `${hour.toFixed(hour < 10 ? 1 : 0)} hours`}<small> after spraying</small></h2>
            <div className="now-smell" aria-live="polite">
              {present.length ? present.slice(0, 5).map((p) => (
                <span key={p.noteId} className="now-pill" style={{ borderColor: noteColor(note(p.noteId)) }}>
                  <i style={{ background: noteColor(note(p.noteId)) }} />{note(p.noteId).name}<em>{Math.round(p.share * 100)}%</em>
                </span>
              )) : <span className="muted">The scent has faded from perception.</span>}
            </div>
          </div>
          <div className="scores">
            <ScoreRing value={analysis.score} label="Overall" />
            <ScoreRing value={analysis.harmony} label="Harmony" />
            <ScoreRing value={analysis.structure} label="Structure" />
          </div>
        </div>
        <ScentRiver sim={sim} hour={hour} onHour={(h) => { setPlaying(false); setHour(h); }} />
        <div className="river-controls">
          <button className="btn small" onClick={() => { if (hour >= 24) setHour(0); setPlaying(!playing); }}>{playing ? "Pause" : "Play the day"}</button>
          <label className="inline-field">Temperature
            <input type="range" min="5" max="40" value={env.temperature} onChange={(e) => setEnv({ ...env, temperature: +e.target.value })} aria-valuetext={`${env.temperature} degrees Celsius`} />
            <b>{env.temperature}°C</b>
          </label>
          <label className="inline-field">Skin
            <select value={env.skin} onChange={(e) => setEnv({ ...env, skin: e.target.value as Environment["skin"] })}>
              <option value="dry">Dry</option><option value="normal">Normal</option><option value="oily">Oily</option>
            </select>
          </label>
          <span className="muted lifespan">Perceptible for about <b>{sim.lifespan >= 24 ? "24 h+" : fmtDuration(sim.lifespan)}</b></span>
        </div>
      </section>

      <div className="studio-grid">
        <section className="panel"><h3>Sillage</h3><SillageAura sim={sim} hour={hour} /></section>
        <section className="panel"><h3>Projection</h3><ProjectionWaves sim={sim} hour={hour} />
          <div className="bottle-fade"><Bottle branding={{ name: draft.branding.name || "Your scent", bottle: draft.branding.bottle, glass: color, accent: draft.branding.accent, label: draft.branding.label }} fill={fill} width={92} /><p className="muted">The liquid level mirrors how much scent remains on skin at this hour.</p></div>
        </section>
        <section className="panel"><h3>Character at this hour</h3><FacetRadar facets={radar} /></section>
        <section className="panel"><h3>Which notes remain</h3><NoteLifetimes sim={sim} items={known} hour={hour} /></section>
      </div>
      <p className="muted model-note">These visuals are modelled from note metrics. Real results vary with materials, skin and climate, so test on blotters and skin.</p>

      <section className="panel">
        <div className="panel-head">
          <h3>Formula</h3>
          <div className="row-tools">
            <label className="inline-field">Type
              <select value={conc} onChange={(e) => update({ concentration: e.target.value as Draft["concentration"] })}>
                {CONCENTRATIONS.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.pct}%)</option>)}
              </select>
            </label>
            <label className="inline-field">Product
              <select value={product} onChange={(e) => update({ product: e.target.value as Draft["product"] })}>
                {PRODUCTS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            <label className="inline-field">Batch
              <input type="number" min="1" max="5000" value={batchMl} onChange={(e) => update({ batchMl: Math.max(1, Math.min(5000, +e.target.value || 1)) })} /> ml
            </label>
          </div>
        </div>
        <div className="table-wrap">
          <table className="formula">
            <thead><tr><th>Note</th><th>Layer</th><th className="w-slider">Share of concentrate</th><th className="num">%</th><th className="num">Grams</th><th className="num">Ratio</th><th className="num">In product</th><th>Indicative limit</th><th><span className="sr">Remove</span></th></tr></thead>
            <tbody>
              {norm.slice().sort((a, b) => b.parts - a.parts).map((i) => {
                const n = note(i.noteId);
                const r = finishedRows.get(i.noteId);
                const g = batch.rows.find((x) => x.noteId === i.noteId)?.grams ?? 0;
                const smallest = Math.min(...norm.map((x) => x.parts || 100));
                return (
                  <tr key={i.noteId} className={r?.ratio && r.ratio > 1 ? "over" : ""}>
                    <td><span className="note-cell"><i style={{ background: noteColor(n) }} />{n.name}</span></td>
                    <td className="cap">{n.position}</td>
                    <td><input type="range" min="0" max="60" step="0.1" value={Math.min(60, i.parts)} aria-label={`${n.name} percentage`} onChange={(e) => setPct(i.noteId, +e.target.value)} /></td>
                    <td className="num">{i.parts.toFixed(1)}</td>
                    <td className="num">{g.toFixed(2)}</td>
                    <td className="num">{(i.parts / smallest).toFixed(1)}</td>
                    <td className="num">{r?.finishedPct.toFixed(2)}%</td>
                    <td title={n.ifra.note}>{r?.limit != null ? <span className={`limit${(r.ratio ?? 0) > 1 ? " bad" : ""}`}><span className="limit-bar"><span style={{ width: `${Math.min(100, (r.ratio ?? 0) * 100)}%` }} /></span>{r.limit}%</span> : n.ifra.status === "specification" ? <span className="muted">Check spec</span> : <span className="muted">Verify</span>}</td>
                    <td><button className="icon-btn" aria-label={`Remove ${n.name}`} onClick={() => remove(i.noteId)}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="add-note">
          <label className="field"><span>Add a note</span><input type="search" value={addQ} placeholder="Search the catalogue" onChange={(e) => setAddQ(e.target.value)} /></label>
          <div className="chips">
            {(addMatches.length ? addMatches.map((n) => ({ noteId: n.id, reason: n.description })) : suggestions).map((s) => (
              <button key={s.noteId} className="chip" title={s.reason} onClick={() => add(s.noteId)}><i style={{ background: noteColor(note(s.noteId)) }} />+ {note(s.noteId).name}</button>
            ))}
          </div>
        </div>
        <details className="batch">
          <summary>Make-up sheet for {batchMl} ml {c.name}</summary>
          <div className="table-wrap"><table className="formula compact"><thead><tr><th>Material</th><th className="num">Grams</th><th className="num">ml</th></tr></thead>
            <tbody>{batch.rows.map((r) => <tr key={r.label}><td>{r.label}</td><td className="num">{r.grams.toFixed(3)}</td><td className="num">{r.ml.toFixed(2)}</td></tr>)}</tbody>
            <tfoot><tr><th>Total</th><th className="num">{batch.totalGrams.toFixed(2)}</th><th className="num">{batchMl.toFixed(2)}</th></tr></tfoot></table></div>
          <p className="muted">Weights use working density estimates. Weigh on a calibrated scale, and work with an accredited professional before any skin contact.</p>
        </details>
      </section>

      <div className="studio-grid two">
        <section className="panel"><h3>Pyramid</h3><Pyramid items={known} /></section>
        <section className="panel balance-panel">
          <h3>AI balance</h3>
          <ul className="issues">
            {issues.length ? issues.slice(0, 5).map((i) => <li key={i.code + (i.noteId ?? "")} className={i.severity}>{i.message}</li>) : <li className="good">No structural or limit issues detected.</li>}
          </ul>
          {GOALS.map((g) => (
            <label key={g.key} className="goal"><span>{g.label}</span><small>{g.low}</small>
              <input type="range" min="-1" max="1" step="0.1" value={goals[g.key] ?? 0} onChange={(e) => setGoals({ ...goals, [g.key]: +e.target.value })} />
              <small>{g.high}</small></label>
          ))}
          <div className="actions"><button className={`btn${blocked ? " primary" : ""}`} onClick={proposeBalance}>{blocked ? "Fix limits and balance" : "Auto-balance"}</button></div>
          <label className="field">
            <span>Ask the AI perfumer{!config.ai && " (engine mode)"}</span>
            <textarea rows={2} maxLength={500} value={aiText} placeholder="Make it smoother in the drydown, without losing the citrus" onChange={(e) => setAiText(e.target.value)} />
          </label>
          <button className="btn" disabled={busy || !user} onClick={askAi}>{busy ? "Thinking…" : "Review my formula"}</button>
          {!user && <p className="muted">Sign in to use the AI perfumer. Auto-balance works without an account.</p>}
          {proposal && (
            <div className="proposal" role="status">
              <p className="eyebrow">{proposal.source === "ai" ? "AI perfumer" : "Rhythm engine"}</p>
              <p>{proposal.summary}</p>
              {proposal.strengths.map((s) => <p key={s} className="good-text">{s}</p>)}
              {proposal.risks.map((s) => <p key={s} className="warn-text">{s}</p>)}
              {proposal.changes.length > 0 && <ul>{proposal.changes.slice(0, 10).map((s) => <li key={s}>{s}</li>)}</ul>}
              {proposal.items.length > 0 && proposal.changes.length > 0 && (
                <div className="actions">
                  <button className="btn primary small" onClick={() => setItems(proposal.items)}>Apply (score {proposal.afterScore})</button>
                  <button className="btn ghost small" onClick={() => setProposal(null)}>Dismiss</button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
