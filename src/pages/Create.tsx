import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { note } from "../../shared/data/notes";
import { facetColor, scentColor, suggestBranding } from "../../shared/engine/brand";
import { analyse, concentration } from "../../shared/engine/formula";
import { generate, learnFromFeedback, mergeSteer, MOOD_FACETS, STEERS, STRENGTH_PLAN, type Candidate } from "../../shared/engine/generate";
import { FACETS, type Facet } from "../../shared/types";
import { Bottle } from "../components/Bottle";
import { DreamCard } from "../components/Dream";
import { IdentityEditor } from "../components/Identity";
import { AdventureDial, AvoidPicker, RequirePicker } from "../components/Preferences";
import { Studio } from "../components/Studio";
import { FragranceWheel } from "../components/Wheel";
import { MOOD_META } from "../icons";
import { api, ApiError, draftLabel, FINISH_STEP, hasWork, isUnfinished, loadDraft, loadShelved, newDraft, saveDraft, saveShelved, useDilutions, useSession, type Draft, type DreamStep } from "../lib";
import { NoteIcon } from "../components/NoteIcon";

const STEPS = ["Notes", "Character", "Refine", "Dream", "Studio", "Identity", "Finish"];

const STRENGTHS: { id: Draft["strength"]; title: string; blurb: string; mood: Draft["mood"]; rings: number; reach: number; lasts: number }[] = [
  { id: "mild", title: "Mild and gentle", blurb: "A soft presence, for you and those close to you.", mood: "gentle", rings: 2, reach: 30, lasts: 40 },
  { id: "moderate", title: "Moderate and refreshing", blurb: "Clear and easy, noticed without trying.", mood: "refreshing", rings: 3, reach: 60, lasts: 65 },
  { id: "bold", title: "Strong and bold", blurb: "Rich, lasting, and impossible to miss.", mood: "mysterious", rings: 5, reach: 95, lasts: 92 },
];
const MOODS: Draft["mood"][] = ["gentle", "refreshing", "romantic", "sensual", "mysterious", "uplifting", "cozy", "elegant"];

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: T[]; onChange: (v: T) => void }) {
  return (
    <fieldset className="choice">
      <legend>{label}</legend>
      <div className="chips">
        {options.map((o) => <button type="button" key={o} className={`chip plain${value === o ? " on" : ""}`} aria-pressed={value === o} onClick={() => onChange(o)}>{o === "any" ? "No preference" : o[0].toUpperCase() + o.slice(1)}</button>)}
      </div>
    </fieldset>
  );
}

/** Concentric scent waves: more, faster and brighter rings for stronger concentrations. */
function StrengthAura({ rings, on }: { rings: number; on: boolean }) {
  return (
    <svg viewBox="0 0 200 120" className={`strength-aura${on ? " on" : ""}`} aria-hidden="true">
      <defs>
        <radialGradient id={`sa${rings}`}><stop offset="0" stopColor="var(--gold)" stopOpacity={0.25 + rings * 0.1} /><stop offset="1" stopColor="var(--gold)" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="100" cy="60" rx={30 + rings * 13} ry={18 + rings * 8} fill={`url(#sa${rings})`} />
      {Array.from({ length: rings }, (_, i) => (
        <ellipse key={i} cx="100" cy="60" rx="34" ry="20" fill="none" stroke="var(--gold)" strokeWidth={1.6 + rings * 0.3} className="sa-ring" style={{ animationDelay: `${(i * 2.4) / rings}s`, animationDuration: `${3.6 - rings * 0.35}s` }} />
      ))}
      <path d="M92 74 v-20 a8 8 0 0 1 16 0 v20 a4 4 0 0 1 -4 4 h-8 a4 4 0 0 1 -4 -4z" className="sa-bottle" />
      <rect x="96" y="40" width="8" height="7" rx="1.5" className="sa-cap" />
    </svg>
  );
}

/** A mood card's fingerprint: the facets the mood leans towards. */
function MoodFacets({ mood }: { mood: Draft["mood"] }) {
  const lean = (Object.entries(MOOD_FACETS[mood]) as [Facet, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return <span className="mood-facets">{lean.map(([f, v]) => <i key={f} title={f} style={{ background: facetColor(f), width: `${v * 34}px` }} />)}</span>;
}

/** The average character of a generation, used to show what a steer actually changed. */
function profileOf(cs: Candidate[]): Record<Facet, number> {
  const out = Object.fromEntries(FACETS.map((f) => [f, 0])) as Record<Facet, number>;
  for (const c of cs) {
    const total = FACETS.reduce((s, f) => s + c.analysis.facets[f], 0) || 1;
    for (const f of FACETS) out[f] += c.analysis.facets[f] / total / cs.length;
  }
  return out;
}

const STEP_ICON: Record<DreamStep["kind"], string> = { steer: "🧭", like: "♥", dislike: "✕", again: "✨", clear: "↺", undo: "↶" };

/** Steering, taste and "dream again" are all folded from the log, so any change can be taken out again. */
function foldDream(log: DreamStep[], tasteBase: Record<string, number>) {
  let steer: Record<string, number> = {};
  let taste = tasteBase;
  for (const s of log) {
    if (s.kind === "steer" && s.steer) steer = mergeSteer(steer, s.steer) as Record<string, number>;
    else if (s.kind === "clear") steer = {};
    else if ((s.kind === "like" || s.kind === "dislike") && s.items) taste = learnFromFeedback(taste, s.items, s.kind === "like" ? 1 : -1);
  }
  const last = log[log.length - 1];
  return { steer, taste, recent: last?.kind === "again" ? last.recent ?? [] : [] };
}

type SaveState = { status: "idle" | "saving" | "saved" | "error" | "terms"; at?: number; message?: string };

const bodyOf = (d: Draft) => ({
  name: d.branding.name.trim() || "Untitled", concentration: d.concentration, product: d.product, items: d.items, ideas: d.ideas, batchMl: d.batchMl, branding: d.branding,
  brief: { seeds: d.seeds, strength: d.strength, mood: d.mood, season: d.season, occasion: d.occasion, expression: d.expression },
});

function SaveStatus({ state, onRetry, onAccept }: { state: SaveState; onRetry: () => void; onAccept: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 15000); return () => clearInterval(t); }, []);
  const ago = state.at ? Math.round((Date.now() - state.at) / 60000) : 0;
  const title = "Rhythm saves your work automatically. Saved formulas are owned by Rhythm and its owners; see the terms.";
  if (state.status === "terms") return <span className="save-status warn">The terms have changed. <button className="link-btn" onClick={onAccept}>Accept to keep saving</button></span>;
  if (state.status === "error") return <span className="save-status warn" title={state.message}>Not saved. <button className="link-btn" onClick={onRetry}>Retry</button></span>;
  if (state.status === "saving") return <span className="save-status" title={title}><i className="dot pulse" />Saving…</span>;
  if (state.status === "saved") return <span className="save-status good" title={title}><i className="dot" />Saved {ago < 1 ? "just now" : `${ago} min ago`}</span>;
  return <span className="save-status muted" title={title}>Autosave on</span>;
}

export default function Create() {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const { user, ready, setUser } = useSession();
  const [params, setParams] = useSearchParams();
  const [save, setSave] = useState<SaveState>({ status: draft.id ? "saved" : "idle" });
  const [brandIdeas, setBrandIdeas] = useState<Draft["branding"][]>([]);
  const [brandBusy, setBrandBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const dil = useDilutions();
  const [prevGen, setPrevGen] = useState<{ candidates: Candidate[]; reason: string } | null>(null);
  const [shelved, setShelved] = useState<Draft | null>(loadShelved);
  // What the last "Create" set aside, so the new wizard can say where it went.
  const [setAside, setSetAside] = useState<{ name: string; saved: boolean; unfinished: boolean } | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const location = useLocation();

  const update = useCallback((patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })), []);
  useEffect(() => saveDraft(draft), [draft]);

  // --- Autosave: every change to a formula is written to the account shortly after it happens.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const lastSaved = useRef(draft.id ? JSON.stringify(bodyOf(draft)) + draft.id : "");
  const generationRef = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const persist = useCallback(() => {
    queue.current = queue.current.then(async () => {
      const d = draftRef.current;
      if (!user || d.review || !d.items.length) return;
      const body = bodyOf(d);
      const key = JSON.stringify(body);
      if (key + (d.id ?? "") === lastSaved.current) return;
      const gen = generationRef.current;
      setSave({ status: "saving" });
      try {
        const r = d.id ? await api(`/formulas/${d.id}`, { method: "PUT", body }) : await api("/formulas", { body });
        if (gen !== generationRef.current) return;
        lastSaved.current = key + r.id;
        if (!d.id) {
          draftRef.current = { ...draftRef.current, id: r.id };
          setDraft((x) => ({ ...x, id: r.id }));
        }
        setSave({ status: "saved", at: Date.now() });
      } catch (e) {
        if (gen !== generationRef.current) return;
        setSave(e instanceof ApiError && e.code === "terms_required" ? { status: "terms" } : { status: "error", message: (e as Error).message });
      }
    });
    return queue.current;
  }, [user]);
  const saveKey = draft.items.length ? JSON.stringify(bodyOf(draft)) : "";
  useEffect(() => {
    if (!saveKey) return;
    const t = setTimeout(persist, 900);
    return () => clearTimeout(t);
  }, [saveKey, persist]);
  // Leaving the wizard flushes any pending change.
  useEffect(() => () => { persist(); }, [persist]);

  useEffect(() => {
    const id = params.get("formula");
    const adminId = params.get("admin");
    if (!id && !adminId) return;
    api(adminId ? `/admin/formulas/${adminId}` : `/formulas/${id}`).then(({ formula }) => {
      const d = formula.data;
      generationRef.current++;
      const next: Draft = { ...newDraft(), ...(d.brief ?? {}), id: adminId ? undefined : formula.id, review: !!adminId, step: 4, items: d.items, concentration: d.concentration, product: d.product ?? "fine", batchMl: d.batchMl ?? 50, ideas: d.ideas ?? "", branding: { ...newDraft().branding, ...(d.branding ?? {}), name: d.branding?.name ?? formula.name } };
      // An admin review copy never overwrites the author's saved record.
      lastSaved.current = next.id ? JSON.stringify(bodyOf(next)) + next.id : "";
      setDraft(next);
      setSave({ status: next.id ? "saved" : "idle" });
      setParams({}, { replace: true });
    }).catch(() => setParams({}, { replace: true }));
  }, [params, setParams]);

  const brief = useMemo(() => ({
    seeds: draft.seeds, strength: draft.strength, mood: draft.mood, season: draft.season, occasion: draft.occasion, expression: draft.expression,
    avoid: draft.avoid, require: draft.require, taste: draft.taste, steer: draft.steer, adventure: draft.adventure, recent: draft.recent,
  }), [draft.seeds, draft.strength, draft.mood, draft.season, draft.occasion, draft.expression, draft.avoid, draft.require, draft.taste, draft.steer, draft.adventure, draft.recent]);

  const candidates = useMemo(() => {
    if (draft.step !== 3 || draft.seeds.length < 2) return [];
    return generate(brief, 4, draft.dreamSeed + draft.generation * 7919 + 13);
  }, [draft.step, brief, draft.generation, draft.dreamSeed, draft.seeds.length]);

  const go = (step: number) => { update({ step }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const canNext = draft.step === 0 ? draft.seeds.length >= 2 : draft.step === 4 ? draft.items.length > 0 : draft.step === 5 ? !!draft.branding.name.trim() : true;
  const toggleSeed = (id: string) => update({ seeds: draft.seeds.includes(id) ? draft.seeds.filter((s) => s !== id) : [...draft.seeds, id] });

  const remember = (taste: Record<string, number>) => { api("/me", { method: "PATCH", body: { taste } }).catch(() => {}); };
  // --- Dream generations. Every change is a step in the log; undoing or going back refolds the log.
  const log = draft.dreamLog;
  const tasteBase = draft.tasteBase ?? draft.taste;
  const liked = log.filter((s) => s.kind === "like").map((s) => s.candidateId);
  const applyLog = (next: DreamStep[], generation: number, reason: string) => {
    const st = foldDream(next.filter((s) => s.kind !== ("undo")), tasteBase);
    setPrevGen({ candidates, reason });
    update({ dreamLog: next, tasteBase, steer: st.steer, taste: st.taste, recent: st.recent, generation });
    if (JSON.stringify(st.taste) !== JSON.stringify(draft.taste)) remember(st.taste);
  };
  const newGen = () => Math.max(draft.generation, ...log.map((s) => s.gen)) + 1;
  const pushStep = (step: Omit<DreamStep, "id" | "gen">) => {
    const gen = newGen();
    applyLog([...log, { ...step, id: `${gen}-${Date.now().toString(36)}`, gen }], gen, step.label);
  };
  const feedback = (c: Candidate, dir: 1 | -1) => pushStep({ kind: dir === 1 ? "like" : "dislike", label: `${dir === 1 ? "More" : "Less"} like ${c.name}`, candidateId: c.id, items: c.items });
  const usedNow = () => [...new Set(candidates.flatMap((c) => c.items.map((i) => i.noteId)))];
  const steerTo = (s: (typeof STEERS)[number]) => pushStep({ kind: "steer", label: s.label, steer: s.steer as Record<string, number> });
  const dreamAgain = () => pushStep({ kind: "again", label: "Dream again", recent: usedNow() });
  /** Takes one change out of the history; everything after it stays. */
  const undoStep = (step: DreamStep) => {
    const gen = newGen();
    applyLog([...log.filter((x) => x.id !== step.id), { id: `${gen}-${Date.now().toString(36)}`, gen, kind: "undo", label: `Undid “${step.label}”` }], gen, `Undid “${step.label}”`);
  };
  /** Returns to the generation a step produced (or the first one), dropping the changes made after it. */
  const goBackTo = (step: DreamStep | null) => {
    const idx = step ? log.findIndex((x) => x.id === step.id) : -1;
    applyLog(log.slice(0, idx + 1), step ? step.gen : 0, step ? `Back to generation ${step.gen + 1}` : "Back to your brief");
  };
  /** Clears every generation and starts again from the brief with a new seed, so the first dream is new too. */
  const freshDream = () => {
    setPrevGen(null);
    setConfirmReset(false);
    update({ dreamLog: [], tasteBase: undefined, steer: {}, taste: tasteBase, recent: [], generation: 0, dreamSeed: Math.floor(Math.random() * 1e6) });
    if (JSON.stringify(tasteBase) !== JSON.stringify(draft.taste)) remember(tasteBase);
  };
  const choose = (c: Candidate) => {
    const glass = scentColor(c.analysis.facets);
    generationRef.current++;
    lastSaved.current = "";
    setSave({ status: "idle" });
    // A new composition is the user's own, even if they were reviewing someone else's formula before.
    update({ items: c.items, concentration: c.concentration, step: 4, id: undefined, review: undefined, conceptBase: undefined, brandHistory: [], branding: { ...draft.branding, name: c.name, tagline: "", story: "", glass } });
    setBrandIdeas([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const facets = useMemo(() => analyse(draft.items.length ? draft.items : [{ noteId: "bergamot", parts: 1 }]).facets, [draft.items]);
  const suggestBrand = async (request?: string) => {
    setBrandBusy(true);
    const nonce = Date.now() % 100000;
    try {
      setBrandIdeas((await api("/ai/brand", { body: { items: draft.items, mood: draft.mood, nonce, request } })).concepts);
    } catch {
      setBrandIdeas(suggestBranding(facets, draft.mood, draft.items.map((i) => i.noteId).join(), nonce));
    } finally { setBrandBusy(false); }
  };
  useEffect(() => {
    if (draft.step === 5 && !brandIdeas.length && draft.items.length) setBrandIdeas(suggestBranding(facets, draft.mood, draft.items.map((i) => i.noteId).join()));
  }, [draft.step, brandIdeas.length, draft.items, facets, draft.mood]);

  const acceptTerms = async () => {
    const r = await api("/me/accept-terms", { body: {} });
    setUser(r.user);
    setSave({ status: "idle" });
    persist();
  };
  const load = (next: Draft) => {
    generationRef.current++;
    lastSaved.current = next.id ? JSON.stringify(bodyOf(next)) + next.id : "";
    setDraft(next);
    setBrandIdeas([]);
    setPrevGen(null);
    setSave({ status: next.id ? "saved" : "idle" });
    setConfirmNew(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const shelve = (d: Draft | null) => { setShelved(d); saveShelved(d); };
  /** Starts a new fragrance. The current one is saved exactly as it is, and an unfinished one can be resumed. */
  const startNew = async () => {
    await persist();
    const cur = draftRef.current;
    if (hasWork(cur)) {
      setSetAside({ name: draftLabel(cur), saved: !!cur.id, unfinished: isUnfinished(cur) });
      if (isUnfinished(cur) || !cur.id) shelve(cur);
    }
    load(newDraft());
  };
  /** Swaps back to the draft set aside; the current one takes its place if it has work in it. */
  const resume = async () => {
    const back = shelved ?? loadShelved();
    if (!back) return;
    await persist();
    const cur = draftRef.current;
    shelve(isUnfinished(cur) || (hasWork(cur) && !cur.id) ? cur : null);
    setSetAside(null);
    load(back);
  };
  // "Create" links mean a new fragrance; a refresh or the back button must not start one again.
  useEffect(() => {
    const intent = (location.state as { create?: "new" | "resume" } | null)?.create;
    if (!intent || !user) return;
    const HANDLED = "rhythm.create.handled";
    try { if (sessionStorage.getItem(HANDLED) === location.key) return; sessionStorage.setItem(HANDLED, location.key); } catch { /* Storage blocked: act on every visit. */ }
    if (intent === "resume") resume(); else startNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, user]);

  // What the last steer or reaction changed, measured across the whole generation.
  const shift = useMemo(() => {
    if (!prevGen || !prevGen.candidates.length || !candidates.length) return null;
    const a = profileOf(prevGen.candidates), b = profileOf(candidates);
    const deltas = FACETS.map((f) => ({ f, d: Math.round((b[f] - a[f]) * 100) })).filter((x) => Math.abs(x.d) >= 1).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 5);
    const before = new Set(prevGen.candidates.flatMap((c) => c.items.map((i) => i.noteId)));
    const fresh = [...new Set(candidates.flatMap((c) => c.items.map((i) => i.noteId)))].filter((id) => !before.has(id));
    const dropped = [...before].filter((id) => !candidates.some((c) => c.items.some((i) => i.noteId === id)));
    return { deltas, fresh, dropped, before };
  }, [prevGen, candidates]);
  // The newest step records what it did to the generation, so the history can show it later.
  useEffect(() => {
    const last = log[log.length - 1];
    if (!shift || !last || last.shift || last.gen !== draft.generation) return;
    update({ dreamLog: [...log.slice(0, -1), { ...last, shift: { deltas: shift.deltas, fresh: shift.fresh.slice(0, 10), dropped: shift.dropped.length } }] });
  }, [shift]); // eslint-disable-line react-hooks/exhaustive-deps
  const steerBars = (Object.entries(draft.steer) as [Facet, number][]).filter(([, v]) => Math.abs(v) > 0.05).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const steerCount = (s: (typeof STEERS)[number]) => {
    const [f, v] = (Object.entries(s.steer) as [Facet, number][]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    const now = draft.steer[f] ?? 0;
    return Math.sign(now) === Math.sign(v) ? Math.round(Math.abs(now) / Math.abs(v)) : 0;
  };

  const b = draft.branding;
  const scentGlass = useMemo(() => scentColor(facets), [facets]);
  const typeName = concentration(draft.concentration).name;
  const blocked = useMemo(() => draft.items.length > 0 && analyse(draft.items, draft.concentration, draft.product).issues.some((i) => i.severity === "block"), [draft.items, draft.concentration, draft.product]);

  // Creating is a signed-in journey; the draft stays in this browser while the user signs in.
  if (!ready) return <div className="page-loading" role="status">Loading…</div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent("/create" + location.search)}`} replace />;

  return (
    <div className="wizard">
      <div className="wizard-top">
        <nav className="stepper" aria-label="Creation steps">
          {STEPS.map((s, i) => {
            const reachable = i <= 3 ? (i === 0 || draft.seeds.length >= 2) : draft.items.length > 0;
            return <button key={s} className={`${i === draft.step ? "current" : ""}${i < draft.step ? " done" : ""}`} aria-current={i === draft.step ? "step" : undefined} disabled={!reachable} onClick={() => go(i)}><span>{i + 1}</span>{s}</button>;
          })}
        </nav>
        {hasWork(draft) && <button className="btn ghost small" onClick={() => setConfirmNew(true)}>New fragrance</button>}
        {draft.items.length > 0 && (draft.review ? <span className="save-status muted">Review copy, not saved</span> : <SaveStatus state={save} onRetry={persist} onAccept={acceptTerms} />)}
      </div>

      {confirmNew && (
        <div className="notice ownership create-confirm" role="alertdialog" aria-labelledby="confirm-new-title">
          <p id="confirm-new-title"><strong>Start a new fragrance?</strong></p>
          <p>“{draftLabel(draft)}” will be kept exactly as it is now, without further changes{draft.review ? "" : draft.items.length ? ", in My formulas" : ", in this browser"}.
            {isUnfinished(draft) && " You can resume it from here at any time."} A new creation then begins at step 1.</p>
          <div className="actions"><button className="btn primary small" onClick={startNew}>Save and start new</button><button className="btn ghost small" onClick={() => setConfirmNew(false)}>Keep working</button></div>
        </div>
      )}

      {!confirmNew && (setAside || (shelved && draft.step === 0)) && (
        <div className="notice resume-bar" aria-live="polite">
          <div>
            {setAside && <p><strong>New fragrance started.</strong> “{setAside.name}” was kept exactly as it was{setAside.saved ? <>, in <Link to="/account">My formulas</Link></> : ", in this browser"}.</p>}
            {shelved && <p>Unfinished: <b>{draftLabel(shelved)}</b> <span className="muted">· stopped at {STEPS[Math.min(shelved.step, FINISH_STEP)]}</span></p>}
          </div>
          <div className="actions">
            {shelved && <button className="btn small" onClick={resume}>Resume {draftLabel(shelved)}</button>}
            {setAside && <button className="link-btn" onClick={() => setSetAside(null)}>Dismiss</button>}
          </div>
        </div>
      )}

      {draft.step === 0 && (
        <section className="step">
          <h1>Which notes do you love?</h1>
          <p className="lede">Choose two or more from the fragrance wheel. They will anchor everything Rhythm composes.</p>
          <FragranceWheel selected={draft.seeds} onToggle={toggleSeed} />
          {draft.seeds.length > 0 && <div className="chips picked">{draft.seeds.map((id) => <button key={id} className="chip on" aria-label={`Remove ${note(id).name}`} onClick={() => toggleSeed(id)}><NoteIcon n={note(id)} />{note(id).name} ×</button>)}</div>}
        </section>
      )}

      {draft.step === 1 && (
        <section className="step">
          <h1>How should it feel?</h1>
          <p className="lede">Choose how loud it should be, then the mood it should carry.</p>
          <div className="strength-grid">
            {STRENGTHS.map((s) => {
              const on = draft.strength === s.id;
              return (
                <button key={s.id} className={`strength s-${s.id}${on ? " on" : ""}`} aria-pressed={on} onClick={() => update({ strength: s.id, mood: s.mood, concentration: STRENGTH_PLAN[s.id].conc })}>
                  <StrengthAura rings={s.rings} on={on} />
                  <h3>{s.title}</h3><p>{s.blurb}</p>
                  <div className="strength-meters">
                    <span>Reach<i><b style={{ width: `${s.reach}%` }} /></i></span>
                    <span>Lasts<i><b style={{ width: `${s.lasts}%` }} /></i></span>
                  </div>
                  <small className="muted">{concentration(STRENGTH_PLAN[s.id].conc).name}</small>
                </button>
              );
            })}
          </div>
          <fieldset className="choice">
            <legend>Mood</legend>
            <div className="mood-grid">
              {MOODS.map((m) => {
                const meta = MOOD_META[m];
                const on = draft.mood === m;
                return (
                  <button key={m} type="button" className={`mood-card${on ? " on" : ""}`} aria-pressed={on} onClick={() => update({ mood: m })}
                    style={{ "--m1": meta.colors[0], "--m2": meta.colors[1] } as React.CSSProperties}>
                    <span className="mood-bg" aria-hidden="true"><i /><i /><i /></span>
                    <span className="mood-icon" aria-hidden="true">{meta.icon}</span>
                    <b>{m[0].toUpperCase() + m.slice(1)}</b>
                    <small>{meta.blurb}</small>
                    <MoodFacets mood={m} />
                  </button>
                );
              })}
            </div>
          </fieldset>
        </section>
      )}

      {draft.step === 2 && (
        <section className="step">
          <h1>A few more details</h1>
          <p className="lede">All optional. Each one guides the engine a little further.</p>
          <div className="refine-grid">
            <Choice label="Season" value={draft.season} options={["any", "spring", "summer", "autumn", "winter"]} onChange={(season) => update({ season })} />
            <Choice label="Occasion" value={draft.occasion} options={["any", "daily", "work", "evening", "special"]} onChange={(occasion) => update({ occasion })} />
            <Choice label="Expression" value={draft.expression} options={["any", "feminine", "masculine", "shared"]} onChange={(expression) => update({ expression })} />
          </div>
          <AdventureDial value={draft.adventure} seeds={draft.seeds} onChange={(adventure) => update({ adventure })} />
          <RequirePicker require={draft.require} seeds={draft.seeds} avoid={draft.avoid} onChange={(require) => update({ require })} />
          <AvoidPicker avoid={draft.avoid} seeds={draft.seeds} require={draft.require} onChange={(avoid) => update({ avoid })} />
        </section>
      )}

      {draft.step === 3 && (
        <section className="step">
          <h1>Dreaming <em>generation {draft.generation + 1}</em></h1>
          {log.length > 0 && <p className="latest-change muted">Last change: <b>{log[log.length - 1].label}</b> · <a href="#dream-history">History and undo ↓</a></p>}
          <p className="lede">Four compositions built around your brief. Steer them, react to them, or dream again, and the next generation reshapes itself.</p>
          <div className="brief-ribbon" aria-label="Your brief">
            <span className="muted">Built from</span>
            {draft.seeds.map((id) => <span key={id} className="tag"><NoteIcon n={note(id)} />{note(id).name}</span>)}
            <span className="tag">{MOOD_META[draft.mood].icon} {draft.mood}</span><span className="tag">{draft.strength}</span>
            {draft.season !== "any" && <span className="tag">{draft.season}</span>}
            {draft.occasion !== "any" && <span className="tag">{draft.occasion}</span>}
            {draft.require.length > 0 && <span className="tag must" title={draft.require.map((id) => note(id).name).join(", ")}>must use {draft.require.length}</span>}
            {draft.avoid.length > 0 && <span className="tag">avoiding {draft.avoid.length}</span>}
            <button className="link-btn" onClick={() => go(0)}>Edit brief</button>
          </div>

          <div className="dream-controls">
            <div className="steer-panel">
              <div className="steer-head">
                <h3>Steer the next generation</h3>
                <p className="muted small-note">Each press pushes all four new compositions further in that direction, in which notes are chosen and how much of each is used. Press again to push harder.</p>
              </div>
              <div className="steer-grid" role="group" aria-label="Steer the next generation">
                {STEERS.map((s) => {
                  const n = steerCount(s);
                  return (
                    <button key={s.id} type="button" className={`steer-tile${n ? " on" : ""}`} title={s.hint} onClick={() => steerTo(s)}>
                      <span className="steer-icon" aria-hidden="true">{s.icon}</span>
                      <b>{s.label}</b>
                      <small>{s.hint}</small>
                      {n > 0 && <span className="steer-count" aria-label={`Applied ${n} times`}>×{n}</span>}
                    </button>
                  );
                })}
              </div>
              <div className="steer-now" aria-live="polite">
                <span className="muted">Direction now:</span>
                {steerBars.length ? steerBars.map(([f, v]) => (
                  <span key={f} className={`steer-bar${v < 0 ? " neg" : ""}`} style={{ "--c": facetColor(f), "--w": `${Math.min(100, Math.abs(v) / 1.5 * 100)}%` } as React.CSSProperties}>
                    {v > 0 ? "▲" : "▼"} {f}<i />
                  </span>
                )) : <span className="muted">Neutral, following your brief</span>}
                {steerBars.length > 0 && <button className="link-btn" onClick={() => pushStep({ kind: "clear", label: "Reset direction" })}>Reset direction</button>}
              </div>
            </div>
            <button type="button" className="dream-again" onClick={dreamAgain}>
              <span className="dream-sparkles" aria-hidden="true"><i /><i /><i /><i /></span>
              <span className="dream-again-icon" aria-hidden="true">✨</span>
              <b>Dream again</b>
              <small>Four fresh compositions, reaching for notes this generation didn't use</small>
            </button>
          </div>

          <div className="dream-grid" key={draft.generation}>
            {candidates.map((c, i) => <DreamCard key={c.id} c={c} index={i} fresh={shift ? new Set(shift.fresh) : undefined} liked={liked.includes(c.id)} dil={dil} required={draft.require} onChoose={() => choose(c)} onLike={() => feedback(c, 1)} onDislike={() => feedback(c, -1)} />)}
          </div>
          {!candidates.length && <p className="muted">No compositions fit that brief. Remove some avoided or required notes and try again.</p>}

          <section className="panel dream-history" id="dream-history" aria-labelledby="dream-history-title">
            <header className="dream-history-head">
              <div>
                <h3 id="dream-history-title">Generation history</h3>
                <p className="muted small-note">Every steer, reaction and re-dream, newest first. Undo a single change, or go back to any generation; your brief stays as it is.</p>
              </div>
              <button className="btn small ghost" onClick={() => (log.length ? setConfirmReset(true) : freshDream())}>Start a fresh dream</button>
            </header>
            {confirmReset && (
              <div className="notice create-confirm" role="alertdialog" aria-label="Reset all generations?">
                <p><strong>Reset all generations?</strong> This clears the steering, the likes and dislikes from this dream and the history below, then dreams four brand-new compositions from your brief.</p>
                <div className="actions"><button className="btn primary small" onClick={freshDream}>Reset and dream fresh</button><button className="btn ghost small" onClick={() => setConfirmReset(false)}>Keep my history</button></div>
              </div>
            )}
            <ol className="history-list">
              {[...log].reverse().map((st) => {
                const current = st.gen === draft.generation;
                const isUndo = st.kind === "undo";
                return (
                  <li key={st.id} className={current ? "current" : ""}>
                    <div className="h-head">
                      <span className="h-icon" aria-hidden="true">{STEP_ICON[st.kind]}</span>
                      <span className="h-text"><b>{st.label}</b><small className="muted">made generation {st.gen + 1}{current && " · showing now"}</small></span>
                      <span className="h-actions">
                        {!current && <button className="link-btn" onClick={() => goBackTo(st)}>Go back here</button>}
                        {!isUndo && <button className="link-btn" onClick={() => undoStep(st)}>Undo this change</button>}
                      </span>
                    </div>
                    {st.shift && (
                      <div className="h-shift">
                        {st.shift.deltas.length ? st.shift.deltas.map(({ f, d }) => (
                          <span key={f} className={`delta ${d > 0 ? "up" : "down"}`} style={{ "--c": facetColor(f as Facet) } as React.CSSProperties}><i />{f} {d > 0 ? "▲ +" : "▼ −"}{Math.abs(d)}%</span>
                        )) : <span className="muted">Character held steady.</span>}
                        {st.shift.fresh.length > 0 && <span className="muted">· new:</span>}
                        {st.shift.fresh.map((id) => <span key={id} className="tag new"><NoteIcon n={note(id)} />{note(id).name}</span>)}
                        {st.shift.dropped > 0 && <span className="muted">· {st.shift.dropped} dropped</span>}
                      </div>
                    )}
                  </li>
                );
              })}
              <li className={draft.generation === 0 ? "current" : ""}>
                <div className="h-head">
                  <span className="h-icon" aria-hidden="true">◎</span>
                  <span className="h-text"><b>Your brief</b><small className="muted">generation 1{draft.generation === 0 && " · showing now"}</small></span>
                  <span className="h-actions">{draft.generation !== 0 && <button className="link-btn" onClick={() => goBackTo(null)}>Go back here</button>}</span>
                </div>
              </li>
            </ol>
          </section>
        </section>
      )}

      {draft.step === 4 && (
        <section className="step wide">
          <h1>Formula Studio <em>{b.name}</em></h1>
          <Studio draft={draft} update={update} />
        </section>
      )}

      {draft.step === 5 && (
        <section className="step wide">
          <h1>Give it an identity</h1>
          <IdentityEditor draft={draft} update={update} ideas={brandIdeas} busy={brandBusy} onSuggest={suggestBrand} scentGlass={scentGlass} typeName={typeName} />
        </section>
      )}

      {draft.step === 6 && (
        <section className="step finish">
          <div className="finish-card">
            <div className="stage small" style={{ "--glow": b.glass } as React.CSSProperties}><Bottle branding={b} width={170} /></div>
            <div>
              <p className="eyebrow">{typeName}</p>
              <h1>{b.name || "Untitled"}</h1>
              {b.tagline && <p className="lede">{b.tagline}</p>}
              <label className="field"><span>Ideas and notes to keep with this formula</span><textarea rows={3} maxLength={5000} value={draft.ideas} onChange={(e) => update({ ideas: e.target.value })} /></label>
              {blocked && <p className="notice warn">This formula exceeds an indicative limit. <button className="link-btn" onClick={() => go(4)}>Return to the Studio</button> to fix it.</p>}
              <div className="notice ownership">
                {draft.review ? <><strong>Review copy, not saved.</strong> You opened another user's formula from Admin, so your changes here are never written back to it. </>
                  : save.status === "error" || save.status === "terms" ? <><strong>Not saved yet.</strong> Use the status at the top of the page to retry. </>
                  : <><strong>Saved automatically.</strong> Every change is kept in <Link to="/account">My formulas</Link>. </>}
                This formula and everything created with it are fully owned by Rhythm and its owners. No one, including you, can claim trademarks, copyrights or other rights in it. <Link to="/terms">Read the terms</Link>.
              </div>
              <div className="actions">
                <Link className="btn primary" to={draft.review ? "/admin" : "/account"}>{draft.review ? "Back to Admin" : "Open My formulas"}</Link>
                <button className="btn ghost" onClick={() => window.print()}>Print</button>
                <button className="btn ghost" onClick={startNew}>Start another</button>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="wizard-nav">
        <button className="btn ghost" disabled={draft.step === 0} onClick={() => go(draft.step - 1)}>Back</button>
        {draft.step === 0 && draft.seeds.length < 2 && <span className="muted">Choose at least two notes to continue</span>}
        {draft.step < STEPS.length - 1 && draft.step !== 3 && <button className="btn primary" disabled={!canNext} onClick={() => go(draft.step + 1)}>{draft.step === 2 ? "Dream" : `Continue to ${STEPS[draft.step + 1]}`}</button>}
      </div>
    </div>
  );
}
