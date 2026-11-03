import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { note, NOTE_BY_ID } from "../../shared/data/notes";
import { analyse, batchSheet, CONCENTRATIONS, normalise, PRODUCTS, concentration } from "../../shared/engine/formula";
import { balance, improvements, optimise, suggestAdditions, weakestPairings, type BalanceGoals, type Improvement } from "../../shared/engine/generate";
import { fmtDilution, solvent, type SolventId } from "../../shared/engine/dilution";
import { scentColor } from "../../shared/engine/brand";
import { DEFAULT_ENV, scentAt, simulate, TIMES, type Environment } from "../../shared/engine/simulate";
import type { FormulaItem } from "../../shared/types";
import { api, ApiError, fmtDuration, noteColor, useDilutions, usePersistentToggle, useSession, type Draft } from "../lib";
import { Bench, Shelf } from "./Bench";
import { Bottle } from "./Bottle";
import { FacetRadar, facetsAt, NoteLifetimes, ProjectionWaves, Pyramid, ScentRiver, ScoreRing, SillageAura, timeH, timeX, TimeScrubber } from "./viz";
import { NoteIcon } from "./NoteIcon";

/** `base` is the formula the review was written for, so edits made since can be spotted. */
type Proposal = { source: "engine" | "ai"; notice?: string; ownAi?: boolean; ms?: number; summary: string; strengths: string[]; risks: string[]; items: FormulaItem[]; changes: string[]; afterScore: number; base: string; error?: boolean };

const formulaKey = (items: FormulaItem[]) => items.map((i) => `${i.noteId}:${i.parts.toFixed(2)}`).join(",");

/** What a review is doing, judged by how long it has run; the server answers in one piece, so time is all the client knows. */
function reviewStage(s: number, ai: boolean) {
  if (!ai) return "The Rhythm engine is searching for edits that raise the score…";
  if (s < 3) return "Sending your formula and request to the AI perfumer…";
  if (s < 15) return "The AI perfumer is reading your notes and writing a critique…";
  if (s < 30) return "Still writing. A detailed request can take the AI up to half a minute.";
  return "This is taking longer than usual. If the AI hasn't answered within 45 seconds, the Rhythm engine answers instead.";
}

const GOALS: { key: keyof BalanceGoals; label: string; icon: string; less: string; more: string }[] = [
  { key: "longevity", label: "Lasting power", icon: "⏳", less: "Shorter", more: "Longer" },
  { key: "sillage", label: "Scent trail", icon: "🌬️", less: "Closer", more: "Bigger" },
  { key: "freshness", label: "Freshness", icon: "🍃", less: "Warmer", more: "Fresher" },
  { key: "sweetness", label: "Sweetness", icon: "🍯", less: "Drier", more: "Sweeter" },
];

const PROMPTS = [
  { icon: "⏳", text: "Make it last longer without getting heavy" },
  { icon: "🌙", text: "Smoother, creamier drydown" },
  { icon: "✨", text: "Make it more distinctive and modern" },
  { icon: "🧭", text: "Fix anything a perfumer would flag" },
];

const KIND_ICON: Record<Improvement["kind"], string> = { structure: "🔺", remove: "✂️", dose: "⚖️", add: "➕", swap: "🔄", limits: "🛡️" };

/** A panel that folds away to its header, remembering its state between visits. */
function Section({ id, title, eyebrow, icon, summary, actions, className = "", defaultOpen = true, children }: {
  id: string; title: string; eyebrow?: string; icon?: string; summary?: ReactNode; actions?: ReactNode; className?: string; defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = usePersistentToggle(`studio.${id}`, defaultOpen);
  return (
    <section className={`panel fold${open ? " open" : " closed"} ${className}`} id={`studio-${id}`}>
      <header className="fold-head">
        <button type="button" className="fold-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="chev" aria-hidden="true">▸</span>
          {icon && <span className="fold-icon" aria-hidden="true">{icon}</span>}
          <span>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h3>{title}</h3></span>
        </button>
        {!open && summary && <span className="fold-summary muted">{summary}</span>}
        {open && actions && <div className="fold-actions">{actions}</div>}
      </header>
      {open && <div className="fold-body">{children}</div>}
    </section>
  );
}

/** Before-and-after doses for every note a proposal touches. */
function DiffRows({ from, to }: { from: FormulaItem[]; to: FormulaItem[] }) {
  const a = new Map(from.map((i) => [i.noteId, i.parts]));
  const b = new Map(to.map((i) => [i.noteId, i.parts]));
  const ids = [...new Set([...a.keys(), ...b.keys()])].filter((id) => NOTE_BY_ID.has(id) && Math.abs((a.get(id) ?? 0) - (b.get(id) ?? 0)) >= 0.3);
  const max = Math.max(...ids.flatMap((id) => [a.get(id) ?? 0, b.get(id) ?? 0]), 1);
  if (!ids.length) return null;
  return (
    <div className="diff-rows">
      {ids.sort((x, y) => Math.abs((b.get(y) ?? 0) - (a.get(y) ?? 0)) - Math.abs((b.get(x) ?? 0) - (a.get(x) ?? 0))).map((id) => {
        const was = a.get(id) ?? 0, now = b.get(id) ?? 0;
        const n = note(id);
        return (
          <div key={id} className={`diff-row${!was ? " added" : !now ? " removed" : now > was ? " up" : " down"}`} style={{ "--c": noteColor(n) } as React.CSSProperties}>
            <span className="diff-name"><NoteIcon n={n} />{n.name}</span>
            <span className="diff-bars"><i className="was" style={{ width: `${(was / max) * 100}%` }} /><i className="now" style={{ width: `${(now / max) * 100}%` }} /></span>
            <span className="diff-val">{!was ? "new " : ""}{was ? `${was.toFixed(1)} → ` : ""}{now ? `${now.toFixed(1)}%` : "removed"}</span>
          </div>
        );
      })}
    </div>
  );
}

function ScoreDelta({ before, after }: { before: number; after: number }) {
  const d = after - before;
  return <span className={`score-delta${d > 0 ? " up" : d < 0 ? " down" : ""}`}>{before} → <b>{after}</b>{d !== 0 && <em>{d > 0 ? `+${d}` : d}</em>}</span>;
}

/** What the user smells at the selected hour. */
function NowSmelling({ present }: { present: { noteId: string; share: number }[] }) {
  return (
    <div className="now-smell" aria-live="polite">
      {present.length ? present.slice(0, 5).map((p) => (
        <span key={p.noteId} className="now-pill" style={{ borderColor: noteColor(note(p.noteId)) }}>
          <NoteIcon n={note(p.noteId)} />{note(p.noteId).name}<em>{Math.round(p.share * 100)}%</em>
        </span>
      )) : <span className="muted">The scent has faded from perception.</span>}
    </div>
  );
}

/** How the formula is compounded from the user's stocks, and what that does to its strength. */
function DilutionSummary({ dose, typeName }: { dose: NonNullable<ReturnType<typeof analyse>["dose"]>; typeName: string }) {
  const short = dose.effectivePct < dose.targetPct - 0.05;
  const solvents = (Object.entries(dose.solventPct) as [SolventId, number][]).filter(([, v]) => v >= 0.05).sort((a, b) => b[1] - a[1]);
  return (
    <div className={`dil-summary${short ? " short" : ""}`}>
      <span><small className="muted">Aromatics in the bottle</small><b>{dose.effectivePct.toFixed(1)}%</b>{short && <small className="warn-text"> of {dose.targetPct}% needed</small>}</span>
      <span><small className="muted">Your stocks fill</small><b>{dose.stockPct.toFixed(0)}%</b><small className="muted"> of the bottle</small></span>
      <span><small className="muted">Solvent from stocks</small><b>{solvents.length ? solvents.map(([id, v]) => `${solvent(id).short} ${v.toFixed(1)}%`).join(" · ") : "none"}</b></span>
      <Link className="btn small ghost" to="/dilutions">Edit my dilutions</Link>
      {short && <p className="warn-text small-note">Your stocks are too weak to make a full-strength {typeName}, so strength, projection, sillage, longevity and the score are prorated to {dose.effectivePct.toFixed(1)}% aromatics.</p>}
    </div>
  );
}

export function Studio({ draft, update }: { draft: Draft; update: (patch: Partial<Draft>) => void }) {
  const { user, config } = useSession();
  const [hour, setHour] = useState(0.25);
  const [playing, setPlaying] = useState(false);
  const [env, setEnv] = useState<Environment>(DEFAULT_ENV);
  const [goals, setGoals] = useState<BalanceGoals>({});
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [aiText, setAiText] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const review = useRef<AbortController | null>(null);
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"bench" | "sheet">("bench");
  const [riverMode, setRiverMode] = useState<"strength" | "blend">("strength");
  const [undo, setUndo] = useState<{ items: FormulaItem[]; label: string }[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const { items, concentration: conc, product, batchMl } = draft;
  const dil = useDilutions();
  const keep = draft.require;

  const known = useMemo(() => items.filter((i) => NOTE_BY_ID.has(i.noteId)), [items]);
  // Everything below is compounded from the user's own stock dilutions.
  const analysis = useMemo(() => analyse(known, conc, product, dil), [known, conc, product, dil]);
  const sim = useMemo(() => simulate(known, conc, env, TIMES, analysis.dose), [known, conc, env, analysis.dose]);
  const present = useMemo(() => scentAt(sim, hour), [sim, hour]);
  const radar = useMemo(() => facetsAt(sim, hour), [sim, hour]);
  const norm = useMemo(() => normalise(known), [known]);
  const batch = useMemo(() => batchSheet(known, conc, batchMl, dil), [known, conc, batchMl, dil]);
  const suggestions = useMemo(() => suggestAdditions(known, 4), [known]);
  const ways = useMemo(() => improvements(known, conc, product, 6, { keep, dilutions: dil }), [known, conc, product, keep, dil]);
  const weak = useMemo(() => weakestPairings(known, 2), [known]);
  const doses = useMemo(() => Object.fromEntries(norm.map((i) => [i.noteId, i.parts])), [norm]);
  const goalsSet = Object.values(goals).some((v) => v);
  const tuned = useMemo(() => {
    if (!goalsSet) return null;
    const res = balance(known, { concentration: conc, product, goals, dilutions: dil });
    return { ...res, sim: simulate(res.items, conc, env, TIMES, res.after.dose) };
  }, [goalsSet, known, conc, product, goals, env, dil]);
  const intensity = Math.max(...sim.total, 0.01);
  const fill = Math.min(1, sim.total[sim.times.findIndex((t) => t >= hour)] / intensity || 0);

  const frame = useRef(0);
  const hourRef = useRef(hour);
  hourRef.current = hour;
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    // Position is tracked here rather than read back from a state updater, which React may run later,
    // so playback always stops at the end of the day instead of looping forever.
    let x = timeX(hourRef.current);
    const tick = (now: number) => {
      // Playback moves at a steady pace along the timeline, so each phase gets equal screen time.
      x += Math.min(0.1, (now - last) / 1000) / 14;
      last = now;
      if (x >= 1) { setHour(24); setPlaying(false); return; }
      setHour(timeH(x));
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playing]);
  // The Timeline shrinks to a compact bar that stays in view once the page scrolls past its top.
  const heroTop = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = heroTop.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 80), { rootMargin: "-80px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [known.length > 0]);
  const [showNow, setShowNow] = usePersistentToggle("studio.mini.now", false);
  const [showRiver, setShowRiver] = usePersistentToggle("studio.mini.river", false);
  const [showControls, setShowControls] = usePersistentToggle("studio.mini.controls", false);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    setElapsed(0);
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);
  // Leaving the Studio abandons a review in flight.
  useEffect(() => () => review.current?.abort(), []);

  const setItems = (next: FormulaItem[]) => update({ items: next });
  /** A whole-formula change the user can take back. */
  const commit = (next: FormulaItem[], label: string) => {
    setUndo((u) => [{ items: norm, label }, ...u].slice(0, 15));
    setProposal(null);
    setItems(next);
    setToast(label);
  };
  const undoLast = () => {
    const [last, ...rest] = undo;
    if (!last) return;
    setUndo(rest);
    setItems(last.items);
    setToast(null);
  };
  /**
   * Sets some notes to exact percentages. Unlocked notes absorb the difference in proportion,
   * locked ones never move, so the concentrate always adds up to 100%.
   */
  const setMany = (fixed: Record<string, number>) => {
    const lockedSum = norm.filter((i) => locked.has(i.noteId) && !(i.noteId in fixed)).reduce((s, i) => s + i.parts, 0);
    const free = norm.filter((i) => !locked.has(i.noteId) && !(i.noteId in fixed));
    if (!free.length) return;
    const room = Math.max(0, 100 - lockedSum);
    const want = Object.values(fixed).reduce((s, v) => s + v, 0);
    const k = want > room - 0.5 ? (room - 0.5) / want : 1;
    const target = Object.fromEntries(Object.entries(fixed).map(([id, v]) => [id, Math.max(0, v * k)]));
    const left = room - Object.values(target).reduce((s, v) => s + v, 0);
    const freeSum = free.reduce((s, i) => s + i.parts, 0);
    setItems(norm.map((i) => i.noteId in target ? { ...i, parts: target[i.noteId] }
      : locked.has(i.noteId) ? i
      : { ...i, parts: freeSum > 0 ? (i.parts / freeSum) * left : left / free.length }));
  };
  const setPct = (id: string, pct: number) => setMany({ [id]: pct });
  const scaleGroup = (ids: string[], factor: number) => setMany(Object.fromEntries(ids.filter((id) => !locked.has(id)).map((id) => [id, (norm.find((i) => i.noteId === id)?.parts ?? 0) * factor])));
  const toggleLock = (id: string) => setLocked((l) => { const n = new Set(l); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const remove = (id: string) => { setLocked((l) => { const n = new Set(l); n.delete(id); return n; }); commit(known.filter((i) => i.noteId !== id), `Removed ${note(id).name}`); };
  const add = (id: string) => {
    const n = note(id);
    if (!known.some((i) => i.noteId === id)) commit([...normalise(known), { noteId: id, parts: (n.dose[0] + n.dose[1]) / 2 }], `Added ${n.name}`);
  };
  /** Drops a whole accord in at 20% of the concentrate, merging any notes already present. */
  const addAccord = (parts: Record<string, number>) => {
    const entries = Object.entries(parts).filter(([id]) => NOTE_BY_ID.has(id));
    const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
    const merged = new Map(norm.map((i) => [i.noteId, i.parts * 0.8]));
    for (const [id, v] of entries) merged.set(id, (merged.get(id) ?? 0) + (v / total) * 20);
    commit([...merged].map(([noteId, p]) => ({ noteId, parts: p })), "Added an accord");
  };

  const askAi = async (request = aiText) => {
    const ctrl = new AbortController();
    review.current = ctrl;
    const base = formulaKey(norm);
    setBusy(true);
    setProposal(null);
    try {
      const r = await api("/ai/advise", { body: { items: norm, concentration: conc, product, request: request || undefined, keep }, signal: ctrl.signal });
      setProposal({ source: r.source, notice: r.notice, ownAi: r.ownAi, ms: r.ms, summary: r.summary, strengths: r.strengths, risks: r.risks, items: r.items, changes: r.changes, afterScore: r.after.score, base });
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "aborted")) setProposal({ source: "engine", summary: (e as Error).message, strengths: [], risks: [], items: [], changes: [], afterScore: analysis.score, base, error: true });
    } finally {
      if (review.current === ctrl) { review.current = null; setBusy(false); }
    }
  };
  const cancelReview = () => { review.current?.abort(); review.current = null; setBusy(false); setToast("Review cancelled"); };
  const stale = !!proposal && !proposal.error && proposal.base !== formulaKey(norm);
  const runOptimise = () => {
    const o = optimise(known, conc, product, 5, { keep, dilutions: dil });
    if (o.applied.length) commit(o.items, `Optimised: ${o.applied.join(", ")} (score ${o.before} → ${o.after})`);
  };

  const issues = analysis.issues;
  const finishedRows = new Map(analysis.ifra.map((r) => [r.noteId, r]));
  const c = concentration(conc);
  const color = scentColor(analysis.facets);
  const aiLive = config.ai || !!user?.ownAi;
  const life = (h: number) => (h >= 24 ? "24 h+" : fmtDuration(h));
  const freshShare = (f: typeof analysis.facets) => { const t = Object.values(f).reduce((a, b) => a + b, 0) || 1; return (f.fresh + f.citrus + f.green + f.aquatic) / t; };
  const sweetShare = (f: typeof analysis.facets) => { const t = Object.values(f).reduce((a, b) => a + b, 0) || 1; return f.sweet / t; };

  if (!known.length) return <p className="muted">Add a note to begin.</p>;

  return (
    <div className="studio">
      {toast && (
        <div className="studio-toast" role="status">
          <span>✓ {toast}</span>
          {undo.length > 0 && <button className="btn small" onClick={undoLast}>Undo</button>}
          <button className="icon-btn" aria-label="Dismiss" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      <div ref={heroTop} className="hero-sentinel" aria-hidden="true" />
      <Section id="day" title="The day on skin" eyebrow="Timeline" icon="🕰️" className={`studio-hero${stuck ? " mini" : ""}`} summary={<>Score {analysis.score} · perceptible for {life(sim.lifespan)}</>}
        actions={<>
          {stuck && <span className="mini-time"><b>{hour < 1 ? `${Math.round(hour * 60)} min` : `${hour.toFixed(hour < 10 ? 1 : 0)} h`}</b> after spraying</span>}
          {stuck && <span className="mini-scores" title="Overall · Harmony · Structure"><b>{analysis.score}</b><small>overall</small><b>{analysis.harmony}</b><small>harmony</small><b>{analysis.structure}</b><small>structure</small></span>}
          {stuck && <button className="btn small primary" onClick={() => { if (hour >= 24) setHour(0); setPlaying(!playing); }} aria-label={playing ? "Pause" : "Play the day"}>{playing ? "❚❚" : "▶"}</button>}
          {undo.length > 0 && <button className="btn small ghost" onClick={undoLast} title={`Undo: ${undo[0].label}`}>↶ Undo</button>}
        </>}>
        {!stuck && (
          <div className="hero-time">
            <div>
              <p className="eyebrow">{hour < 0.5 ? "The opening" : hour < 3 ? "The heart" : hour < 10 ? "The drydown" : "The last trace"}</p>
              <h2 className="time-big">{hour < 1 ? `${Math.round(hour * 60)} minutes` : `${hour.toFixed(hour < 10 ? 1 : 0)} hours`}<small> after spraying</small></h2>
              <NowSmelling present={present} />
            </div>
            <a className="scores" href="#studio-coach" title="See how to raise your score">
              <ScoreRing value={analysis.score} label="Overall" />
              <ScoreRing value={analysis.harmony} label="Harmony" />
              <ScoreRing value={analysis.structure} label="Structure" />
            </a>
          </div>
        )}
        {stuck && (
          <div className="mini-toggles" role="group" aria-label="Show in the compact timeline">
            <button type="button" className={`chip small${showNow ? " on" : ""}`} aria-expanded={showNow} onClick={() => setShowNow(!showNow)}>{showNow ? "▾" : "▸"} Notes you smell now</button>
            <button type="button" className={`chip small${showRiver ? " on" : ""}`} aria-expanded={showRiver} onClick={() => setShowRiver(!showRiver)}>{showRiver ? "▾" : "▸"} Scent stream</button>
            <button type="button" className={`chip small${showControls ? " on" : ""}`} aria-expanded={showControls} onClick={() => setShowControls(!showControls)}>{showControls ? "▾" : "▸"} Conditions</button>
          </div>
        )}
        {stuck && showNow && <NowSmelling present={present} />}
        {(!stuck || showRiver) && (
          <ScentRiver sim={sim} hour={hour} mode={riverMode} doses={doses} onHour={(h) => { setPlaying(false); setHour(h); }}
            actions={{ onDose: (id, f) => setPct(id, (doses[id] ?? 0) * f), onRemove: remove }} />
        )}
        <TimeScrubber hour={hour} onHour={(h) => { setPlaying(false); setHour(h); }} />
        {(!stuck || showControls) && (
          <div className="river-controls">
            {!stuck && <button className="btn small primary play-btn" onClick={() => { if (hour >= 24) setHour(0); setPlaying(!playing); }}>{playing ? "❚❚ Pause" : "▶ Play the day"}</button>}
            <div className="seg" role="group" aria-label="Stream view">
              <button aria-pressed={riverMode === "strength"} className={riverMode === "strength" ? "on" : ""} onClick={() => setRiverMode("strength")} title="Band height shows how strong the scent is">Strength</button>
              <button aria-pressed={riverMode === "blend"} className={riverMode === "blend" ? "on" : ""} onClick={() => setRiverMode("blend")} title="Bands fill the height to show each note's share of what you smell">Blend</button>
            </div>
            <label className="inline-field">Temperature
              <input type="range" min="5" max="40" value={env.temperature} onChange={(e) => setEnv({ ...env, temperature: +e.target.value })} aria-valuetext={`${env.temperature} degrees Celsius`} />
              <b>{env.temperature}°C</b>
            </label>
            <label className="inline-field">Skin
              <select value={env.skin} onChange={(e) => setEnv({ ...env, skin: e.target.value as Environment["skin"] })}>
                <option value="dry">Dry</option><option value="normal">Normal</option><option value="oily">Oily</option>
              </select>
            </label>
            <span className="muted lifespan">Perceptible for about <b>{life(sim.lifespan)}</b>{analysis.dose && analysis.dose.effectivePct < analysis.dose.targetPct - 0.05 && <> at {analysis.dose.effectivePct.toFixed(1)}% aromatics</>}</span>
          </div>
        )}
      </Section>

      <div className="studio-grid advisor-row">
        <Section id="perfumer" title="Ask the AI perfumer" eyebrow={aiLive ? "AI review" : "Engine review"} icon="🧑‍🔬" className="perfumer" summary="A critique of your formula with exact changes to preview">
          <ol className="perfumer-steps">
            <li><b>1</b>Reads your notes, doses and scores</li>
            <li><b>2</b>Writes a perfumer's critique</li>
            <li><b>3</b>Proposes exact dose changes. Nothing changes until you apply them</li>
          </ol>
          <div className="prompt-chips" role="group" aria-label="Quick requests">
            {PROMPTS.map((p) => <button key={p.text} type="button" className={`chip${aiText === p.text ? " on" : ""}`} disabled={busy} onClick={() => { setAiText(p.text); askAi(p.text); }}><span aria-hidden="true">{p.icon}</span>{p.text}</button>)}
          </div>
          <div className="perfumer-ask">
            <textarea rows={2} maxLength={500} value={aiText} aria-label="Your request to the perfumer" placeholder="Or write your own: make it smoother in the drydown without losing the citrus…" onChange={(e) => setAiText(e.target.value)} />
            <button className="btn primary" disabled={busy} onClick={() => askAi()}>{busy ? <><span className="spinner" aria-hidden="true" />Reviewing…</> : aiText.trim() ? "Ask the perfumer" : "Review my formula"}</button>
          </div>
          {!aiLive && <p className="muted small-note">No AI model is connected, so the Rhythm engine answers. <Link to="/account">Add your own AI key</Link> for a written critique.</p>}
          {busy && (
            <div className="perfumer-progress" role="status" aria-live="polite">
              <div className="perfumer-thinking"><i /><i /><i /><span>{reviewStage(elapsed, aiLive)}</span></div>
              {/* No real percentage exists, so the bar eases towards full: about half at 20 s. */}
              <div className="progress-track" aria-hidden="true"><b style={{ width: `${Math.min(95, (elapsed / (elapsed + 20)) * 100 + 4)}%` }} /></div>
              <div className="progress-foot">
                <span className="muted">{elapsed}s elapsed{aiLive ? " · usually 10 to 30 s" : ""}</span>
                <button type="button" className="btn small ghost" onClick={cancelReview}>Cancel</button>
              </div>
            </div>
          )}
          {proposal && (
            <div className={`proposal${proposal.error ? " failed" : ""}`} role="status">
              <div className="proposal-head">
                <span className="eyebrow">{proposal.source === "ai" ? "AI perfumer" : "Rhythm engine"}</span>
                {!proposal.error && <ScoreDelta before={analysis.score} after={proposal.items.length && proposal.changes.length ? proposal.afterScore : analysis.score} />}
              </div>
              {proposal.notice && <p className="warn-text">{proposal.notice}{proposal.ownAi && <> <Link to="/account">Check your AI settings</Link>.</>}</p>}
              {proposal.source === "ai" && proposal.ms != null && <p className="muted small-note">Answered by the AI in {(proposal.ms / 1000).toFixed(1)} s.</p>}
              <p className="proposal-summary">{proposal.summary}</p>
              {proposal.strengths.map((s) => <p key={s} className="good-text">✓ {s}</p>)}
              {proposal.risks.map((s) => <p key={s} className="warn-text">! {s}</p>)}
              {stale && (
                <div className="notice warn">
                  You've changed the formula since this review, so its proposed doses no longer match. <button className="link-btn" disabled={busy} onClick={() => askAi()}>Review again</button>
                </div>
              )}
              {!stale && proposal.items.length > 0 && proposal.changes.length > 0 && (
                <>
                  <p className="eyebrow">Proposed changes</p>
                  <DiffRows from={norm} to={proposal.items} />
                  {proposal.afterScore < analysis.score && <p className="muted small-note">These changes follow your request and trade a little of the score for it. The score coach shows edits that raise it.</p>}
                  {proposal.source === "ai" && <ul className="proposal-why">{proposal.changes.slice(0, 6).map((s) => <li key={s}>{s}</li>)}</ul>}
                  <div className="actions">
                    <button className="btn primary small" onClick={() => commit(proposal.items, `Applied the ${proposal.source === "ai" ? "perfumer's" : "engine's"} changes`)}>Apply changes</button>
                    <button className="btn ghost small" onClick={() => setProposal(null)}>Discard</button>
                  </div>
                </>
              )}
            </div>
          )}
        </Section>

        <Section id="coach" title="Improve your score" eyebrow="Score coach" icon="📈" className="coach" summary={<>Score {analysis.score} · {ways.length ? `${ways.length} ways to raise it` : analysis.score >= 100 ? "at its best" : "needs a creative change"}</>}>
          <div className="score-break">
            <div><span>Harmony <small>how well the notes pair</small></span><i><b style={{ width: `${analysis.harmony}%` }} /></i><em>{analysis.harmony}</em></div>
            <div><span>Structure <small>top, heart and base balance</small></span><i><b style={{ width: `${analysis.structure}%` }} /></i><em>{analysis.structure}</em></div>
            <p className="muted small-note">Overall is the average of the two{issues.some((i) => i.severity === "block") ? ", minus 25 while a note is over its limit" : ""}{analysis.dose && analysis.dose.effectivePct < analysis.dose.targetPct - 0.05 ? ", minus a little while your dilutions can't reach the type's strength" : ""}.</p>
          </div>
          {issues.length > 0 && <ul className="issues">{issues.slice(0, 4).map((i) => <li key={i.code + (i.noteId ?? "")} className={i.severity}>{i.message}</li>)}</ul>}
          {ways.length ? (
            <>
              <ul className="ways">
                {ways.map((w) => (
                  <li key={w.id}>
                    <span className="way-icon" aria-hidden="true">{KIND_ICON[w.kind]}</span>
                    <span className="way-text"><b>{w.title}</b><small>{w.detail}</small></span>
                    <span className="way-gain">+{w.after - w.before}</span>
                    <button className="btn small" onClick={() => commit(w.items, `${w.title} (score ${w.before} → ${w.after})`)}>Apply</button>
                  </li>
                ))}
              </ul>
              <button className="btn primary small" onClick={runOptimise}>✨ Apply the best combination</button>
            </>
          ) : analysis.score >= 100 ? <p className="good-text">This formula sits at the top of the scale. Tune its character below, or ask the perfumer for a creative direction.</p> : (
            <div className="coach-stuck">
              <p><b>No single edit raises the score from {analysis.score} right now.</b> {analysis.harmony < analysis.structure
                ? <>Harmony ({analysis.harmony}) is what holds it back: some notes don't pair well with the rest{weak.length > 0 && <>, especially {weak.map((w) => note(w.noteId).name).join(" and ")}{weak[0].clash && <> (it clashes with {note(weak[0].clash).name})</>}</>}.</>
                : <>Structure ({analysis.structure}) is what holds it back: the top, heart and base layers are out of balance.</>}</p>
              <ul>
                {analysis.harmony < analysis.structure ? <>
                  <li>Replace the weakest note with one from the shelf that pairs with your key notes, then check the coach again.</li>
                  <li>Two or three notes that share a family (for example citrus with aromatic herbs, or woods with amber) raise harmony faster than many unrelated ones.</li>
                  {keep.some((id) => weak.some((w) => w.noteId === id)) && <li>A note you marked as required is among the weakest pairings, so the coach won't remove it.</li>}
                </> : <li>Move a few percent between layers so top is 12-35%, heart 25-55% and base 20-55% of the concentrate.</li>}
                <li>Ask the AI perfumer above to “raise the harmony” for a creative swap the coach can't find.</li>
              </ul>
            </div>
          )}
        </Section>
      </div>

      <Section id="bench" title="Formula" eyebrow="The lab bench" icon="⚗️" className="lab" summary={<>{known.length} notes · {c.name}</>}
        actions={
          <>
            <div className="seg" role="tablist" aria-label="Formula view">
              <button role="tab" aria-selected={view === "bench"} className={view === "bench" ? "on" : ""} onClick={() => setView("bench")}>Bench</button>
              <button role="tab" aria-selected={view === "sheet"} className={view === "sheet" ? "on" : ""} onClick={() => setView("sheet")}>Lab sheet</button>
            </div>
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
          </>
        }>
        {analysis.dose && <DilutionSummary dose={analysis.dose} typeName={c.name} />}
        <p className="muted small-note">Notes are grouped into the classic accords they form. Doses are % of pure material; each is weighed from your stock dilution. Drag, type or use − + to dose; 🔒 holds a note steady while you adjust the rest.</p>
        {view === "bench" ? (
          <Bench items={norm} analysis={analysis} locked={locked} required={keep} onToggleLock={toggleLock} onSet={setPct} onRemove={remove} onScaleGroup={scaleGroup} />
        ) : (
          <div className="table-wrap">
            <table className="formula">
              <thead><tr><th>Note</th><th>Layer</th><th className="num">% pure</th><th>Your stock</th><th className="num">Stock g</th><th className="num">Ratio</th><th className="num">In product</th><th>Indicative limit</th><th><span className="sr">Remove</span></th></tr></thead>
              <tbody>
                {norm.slice().sort((a, b) => b.parts - a.parts).map((i) => {
                  const n = note(i.noteId);
                  const r = finishedRows.get(i.noteId);
                  const g = batch.rows.find((x) => x.noteId === i.noteId)?.grams ?? 0;
                  const stock = analysis.dose?.rows.find((x) => x.noteId === i.noteId)?.dilution;
                  const smallest = Math.min(...norm.map((x) => x.parts || 100));
                  return (
                    <tr key={i.noteId} className={r?.ratio && r.ratio > 1 ? "over" : ""}>
                      <td><span className="note-cell"><NoteIcon n={n} />{n.name}</span></td>
                      <td className="cap">{n.position}</td>
                      <td className="num">{i.parts.toFixed(1)}</td>
                      <td><Link to="/dilutions" className="stock-link" title="Change in My dilutions">{stock ? fmtDilution(stock) : "neat"}</Link></td>
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
        )}
        <Shelf present={known.map((i) => i.noteId)} suggestions={suggestions} onAddNote={add} onAddAccord={addAccord} />
        <details className="batch">
          <summary>Make-up sheet for {batchMl} ml {c.name}</summary>
          <p className="muted small-note">Weigh each note as your stock dilution; the stocks' solvent counts towards the bottle, so less carrier is added.</p>
          <div className="table-wrap"><table className="formula compact"><thead><tr><th>Material</th><th className="num">Grams</th><th className="num">ml</th></tr></thead>
            <tbody>{batch.rows.map((r) => <tr key={r.label}><td>{r.label}</td><td className="num">{r.grams.toFixed(3)}</td><td className="num">{r.ml.toFixed(2)}</td></tr>)}</tbody>
            <tfoot><tr><th>Total</th><th className="num">{batch.totalGrams.toFixed(2)}</th><th className="num">{batchMl.toFixed(2)}</th></tr></tfoot></table></div>
          <p className="muted">Weights use working density estimates. Weigh on a calibrated scale, and work with an accredited professional before any skin contact.</p>
        </details>
      </Section>

      <Section id="tune" title="Tune the character" eyebrow="Balance" icon="🎚️" className="tune" summary="Ask for more or less of a quality; Rhythm re-doses your notes to match">
        <p className="muted small-note">Pick what you want more or less of. Rhythm re-doses the notes you already have (it never adds or removes one) and shows the result below before anything changes.</p>
        <div className="tune-grid">
          {GOALS.map((g) => {
            const v = goals[g.key] ?? 0;
            const set = (x: number) => setGoals({ ...goals, [g.key]: x });
            return (
              <div key={g.key} className="tune-row">
                <span className="tune-label"><span aria-hidden="true">{g.icon}</span>{g.label}</span>
                <div className="seg tune-seg" role="radiogroup" aria-label={g.label}>
                  <button role="radio" aria-checked={v < 0} className={v < 0 ? "on" : ""} onClick={() => set(v < 0 ? 0 : -0.8)}>− {g.less}</button>
                  <button role="radio" aria-checked={v === 0} className={v === 0 ? "on" : ""} onClick={() => set(0)}>Keep</button>
                  <button role="radio" aria-checked={v > 0} className={v > 0 ? "on" : ""} onClick={() => set(v > 0 ? 0 : 0.8)}>+ {g.more}</button>
                </div>
              </div>
            );
          })}
        </div>
        {tuned ? (
          <div className="tune-result">
            <div className="tune-metrics">
              <span>⏳ Longevity <b>{analysis.longevity} → {tuned.after.longevity}</b>{Math.abs(tuned.sim.lifespan - sim.lifespan) > 0.2 && <small className="muted"> ({life(sim.lifespan)} → {life(tuned.sim.lifespan)})</small>}</span>
              <span>🌬️ Trail <b>{analysis.sillage} → {tuned.after.sillage}</b></span>
              <span>🍃 Fresh <b>{Math.round(freshShare(analysis.facets) * 100)}% → {Math.round(freshShare(tuned.after.facets) * 100)}%</b></span>
              <span>🍯 Sweet <b>{Math.round(sweetShare(analysis.facets) * 100)}% → {Math.round(sweetShare(tuned.after.facets) * 100)}%</b></span>
              <span>📈 Score <ScoreDelta before={analysis.score} after={tuned.after.score} /></span>
            </div>
            {tuned.changes.length ? <DiffRows from={norm} to={tuned.items} /> : <p className="muted">Your notes can't move further in that direction. Try adding a note that carries it, from the shelf or the score coach.</p>}
            <div className="actions">
              <button className="btn primary small" disabled={!tuned.changes.length} onClick={() => { commit(tuned.items, "Re-balanced the character"); setGoals({}); }}>Apply these changes</button>
              <button className="btn ghost small" onClick={() => setGoals({})}>Reset</button>
            </div>
          </div>
        ) : <p className="muted tune-idle">Choose a direction above to see a preview.</p>}
      </Section>

      <Section id="performance" title="How it performs" eyebrow="At the selected hour" icon="🌫️" summary="Sillage, projection, character and which notes remain">
        <div className="studio-grid">
          <div className="sub-panel"><h4>Sillage</h4><SillageAura sim={sim} hour={hour} /></div>
          <div className="sub-panel"><h4>Projection</h4><ProjectionWaves sim={sim} hour={hour} />
            <div className="bottle-fade"><Bottle branding={{ name: draft.branding.name || "Your scent", bottle: draft.branding.bottle, glass: color, accent: draft.branding.accent, label: draft.branding.label }} fill={fill} width={92} /><p className="muted">The liquid level mirrors how much scent remains on skin at this hour.</p></div>
          </div>
          <div className="sub-panel"><h4>Character at this hour</h4><FacetRadar facets={radar} /></div>
          <div className="sub-panel"><h4>Which notes remain</h4><NoteLifetimes sim={sim} items={known} hour={hour} /></div>
        </div>
        <p className="muted model-note">These visuals are modelled from note metrics. Real results vary with materials, skin and climate, so test on blotters and skin.</p>
      </Section>

      <Section id="pyramid" title="Pyramid" eyebrow="Structure" icon="🔺" summary={<>Top {analysis.pyramid.top.toFixed(0)}% · heart {analysis.pyramid.heart.toFixed(0)}% · base {analysis.pyramid.base.toFixed(0)}%</>}>
        <Pyramid items={known} />
      </Section>
    </div>
  );
}
