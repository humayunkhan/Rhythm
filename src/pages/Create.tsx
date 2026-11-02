import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { note, NOTES } from "../../shared/data/notes";
import { BOTTLES, PACKAGING, scentColor, suggestBranding } from "../../shared/engine/brand";
import { analyse, concentration, CONCENTRATIONS } from "../../shared/engine/formula";
import { generate, learnFromFeedback, mergeSteer, STEERS, STRENGTH_PLAN, type Candidate } from "../../shared/engine/generate";
import { simulate } from "../../shared/engine/simulate";
import { Bottle, Box } from "../components/Bottle";
import { Studio } from "../components/Studio";
import { FragranceWheel } from "../components/Wheel";
import { api, ApiError, fmtDuration, loadDraft, newDraft, noteColor, saveDraft, useSession, type Draft } from "../lib";

const STEPS = ["Notes", "Character", "Refine", "Dream", "Studio", "Identity", "Finish"];

const STRENGTHS: { id: Draft["strength"]; title: string; blurb: string; mood: Draft["mood"] }[] = [
  { id: "mild", title: "Mild and gentle", blurb: "A soft presence, for you and those close to you.", mood: "gentle" },
  { id: "moderate", title: "Moderate and refreshing", blurb: "Clear and easy, noticed without trying.", mood: "refreshing" },
  { id: "bold", title: "Strong and bold", blurb: "Rich, lasting, and impossible to miss.", mood: "mysterious" },
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

function CandidateCard({ c, onChoose, onLike, onDislike, liked }: { c: Candidate; onChoose: () => void; onLike: () => void; onDislike: () => void; liked?: boolean }) {
  const sim = useMemo(() => simulate(c.items, c.concentration), [c]);
  const glass = scentColor(c.analysis.facets);
  return (
    <article className={`candidate${liked ? " liked" : ""}`}>
      <div className="candidate-top">
        <Bottle branding={{ name: c.name, bottle: "column", glass, accent: "#f4e3bf", label: "#14101c" }} width={74} />
        <div>
          <h3>{c.name}</h3>
          <p className="score-line"><b>{c.analysis.score}</b> score · {concentration(c.concentration).name} · lasts {sim.lifespan >= 24 ? "24 h+" : fmtDuration(sim.lifespan)}</p>
          <div className="spectrum" aria-hidden="true">{c.items.map((i) => <span key={i.noteId} style={{ flex: i.parts, background: noteColor(note(i.noteId)) }} />)}</div>
        </div>
      </div>
      <p>{c.profile}</p>
      <div className="chips small">{c.items.slice(0, 8).map((i) => <span key={i.noteId} className="tag">{note(i.noteId).name}</span>)}</div>
      <div className="actions">
        <button className="btn primary small" onClick={onChoose}>Open in Studio</button>
        <button className="btn ghost small" aria-label={`More like ${c.name}`} onClick={onLike}>More like this</button>
        <button className="btn ghost small" aria-label={`Less like ${c.name}`} onClick={onDislike}>Less</button>
      </div>
    </article>
  );
}

export default function Create() {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const { user, setUser } = useSession();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [brandIdeas, setBrandIdeas] = useState<Draft["branding"][]>([]);
  const [brandBusy, setBrandBusy] = useState(false);
  const [liked, setLiked] = useState<string[]>([]);

  const update = useCallback((patch: Partial<Draft>) => { setSaved(false); setDraft((d) => ({ ...d, ...patch })); }, []);
  useEffect(() => saveDraft(draft), [draft]);

  useEffect(() => {
    const id = params.get("formula");
    const adminId = params.get("admin");
    if (!id && !adminId) return;
    api(adminId ? `/admin/formulas/${adminId}` : `/formulas/${id}`).then(({ formula }) => {
      const d = formula.data;
      // An admin review copy never overwrites the author's saved record.
      setDraft({ ...newDraft(), ...(d.brief ?? {}), id: adminId ? undefined : formula.id, step: 4, items: d.items, concentration: d.concentration, product: d.product ?? "fine", batchMl: d.batchMl ?? 50, ideas: d.ideas ?? "", branding: { ...newDraft().branding, ...(d.branding ?? {}), name: d.branding?.name ?? formula.name } });
      setParams({}, { replace: true });
    }).catch(() => setParams({}, { replace: true }));
  }, [params, setParams]);

  const brief = useMemo(() => ({
    seeds: draft.seeds, strength: draft.strength, mood: draft.mood, season: draft.season, occasion: draft.occasion, expression: draft.expression,
    avoid: draft.avoid, taste: draft.taste, steer: draft.steer, adventure: draft.adventure,
  }), [draft.seeds, draft.strength, draft.mood, draft.season, draft.occasion, draft.expression, draft.avoid, draft.taste, draft.steer, draft.adventure]);

  const candidates = useMemo(() => {
    if (draft.step !== 3 || draft.seeds.length < 2) return [];
    return generate(brief, 4, draft.generation * 7919 + 13);
  }, [draft.step, brief, draft.generation, draft.seeds.length]);

  const go = (step: number) => { update({ step }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const canNext = draft.step === 0 ? draft.seeds.length >= 2 : draft.step === 4 ? draft.items.length > 0 : draft.step === 5 ? !!draft.branding.name.trim() : true;
  const toggleSeed = (id: string) => update({ seeds: draft.seeds.includes(id) ? draft.seeds.filter((s) => s !== id) : [...draft.seeds, id] });

  const remember = (taste: Record<string, number>) => { if (user) api("/me", { method: "PATCH", body: { taste } }).catch(() => {}); };
  const feedback = (c: Candidate, dir: 1 | -1) => {
    const taste = learnFromFeedback(draft.taste, c.items, dir);
    update({ taste, generation: draft.generation + 1 });
    if (dir === 1) setLiked((l) => [...l, c.id]);
    remember(taste);
  };
  const choose = (c: Candidate) => {
    const glass = scentColor(c.analysis.facets);
    update({ items: c.items, concentration: c.concentration, step: 4, id: undefined, branding: { ...draft.branding, name: c.name, glass } });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const facets = useMemo(() => analyse(draft.items.length ? draft.items : [{ noteId: "bergamot", parts: 1 }]).facets, [draft.items]);
  const suggestBrand = async () => {
    setBrandBusy(true);
    const nonce = Date.now() % 100000;
    try {
      const out = user
        ? (await api("/ai/brand", { body: { items: draft.items, mood: draft.mood, nonce } })).concepts
        : suggestBranding(facets, draft.mood, draft.items.map((i) => i.noteId).join(), nonce);
      setBrandIdeas(out);
    } catch {
      setBrandIdeas(suggestBranding(facets, draft.mood, draft.items.map((i) => i.noteId).join(), nonce));
    } finally { setBrandBusy(false); }
  };
  useEffect(() => {
    if (draft.step === 5 && !brandIdeas.length && draft.items.length) setBrandIdeas(suggestBranding(facets, draft.mood, draft.items.map((i) => i.noteId).join()));
  }, [draft.step, brandIdeas.length, draft.items, facets, draft.mood]);

  const save = async () => {
    if (!user) { saveDraft(draft); nav("/login?next=/create"); return; }
    setSaving("Saving…");
    const body = {
      name: draft.branding.name.trim() || "Untitled", concentration: draft.concentration, product: draft.product, items: draft.items, ideas: draft.ideas, batchMl: draft.batchMl, branding: draft.branding,
      brief: { seeds: draft.seeds, strength: draft.strength, mood: draft.mood, season: draft.season, occasion: draft.occasion, expression: draft.expression },
    };
    try {
      const r = draft.id ? await api(`/formulas/${draft.id}`, { method: "PUT", body }) : await api("/formulas", { body });
      setDraft((d) => ({ ...d, id: r.id }));
      setSaved(true);
      setSaving(null);
    } catch (e) {
      if (e instanceof ApiError && e.code === "terms_required") setSaving("terms");
      else setSaving((e as Error).message);
    }
  };
  const acceptTerms = async () => {
    const r = await api("/me/accept-terms", { body: {} });
    setUser(r.user);
    setSaving(null);
    save();
  };

  const b = draft.branding;
  const typeName = concentration(draft.concentration).name;
  const blocked = useMemo(() => draft.items.length > 0 && analyse(draft.items, draft.concentration, draft.product).issues.some((i) => i.severity === "block"), [draft.items, draft.concentration, draft.product]);

  return (
    <div className="wizard">
      <nav className="stepper" aria-label="Creation steps">
        {STEPS.map((s, i) => {
          const reachable = i <= 3 ? (i === 0 || draft.seeds.length >= 2) : draft.items.length > 0;
          return <button key={s} className={`${i === draft.step ? "current" : ""}${i < draft.step ? " done" : ""}`} aria-current={i === draft.step ? "step" : undefined} disabled={!reachable} onClick={() => go(i)}><span>{i + 1}</span>{s}</button>;
        })}
      </nav>

      {draft.step === 0 && (
        <section className="step">
          <h1>Which notes do you love?</h1>
          <p className="lede">Choose two or more from the fragrance wheel. They will anchor everything Rhythm composes.</p>
          <FragranceWheel selected={draft.seeds} onToggle={toggleSeed} />
          {draft.seeds.length > 0 && <div className="chips picked">{draft.seeds.map((id) => <button key={id} className="chip on" aria-label={`Remove ${note(id).name}`} onClick={() => toggleSeed(id)}><i style={{ background: noteColor(note(id)) }} />{note(id).name} ×</button>)}</div>}
        </section>
      )}

      {draft.step === 1 && (
        <section className="step">
          <h1>How should it feel?</h1>
          <div className="strength-grid">
            {STRENGTHS.map((s) => (
              <button key={s.id} className={`strength s-${s.id}${draft.strength === s.id ? " on" : ""}`} aria-pressed={draft.strength === s.id} onClick={() => update({ strength: s.id, mood: s.mood, concentration: STRENGTH_PLAN[s.id].conc })}>
                <span className="pulse" aria-hidden="true" /><h3>{s.title}</h3><p>{s.blurb}</p>
              </button>
            ))}
          </div>
          <Choice label="Mood" value={draft.mood} options={MOODS} onChange={(mood) => update({ mood })} />
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
            <label className="field"><span>How adventurous? <b>{draft.adventure < 0.34 ? "Classic pairings" : draft.adventure < 0.67 ? "Some surprises" : "Unexpected"}</b></span>
              <input type="range" min="0" max="1" step="0.05" value={draft.adventure} onChange={(e) => update({ adventure: +e.target.value })} /></label>
          </div>
          <label className="field"><span>Notes to avoid</span>
            <select value="" onChange={(e) => e.target.value && update({ avoid: [...draft.avoid, e.target.value] })}>
              <option value="">Choose a note you dislike</option>
              {NOTES.filter((n) => !draft.avoid.includes(n.id) && !draft.seeds.includes(n.id)).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select></label>
          <div className="chips">{draft.avoid.map((id) => <button key={id} className="chip" aria-label={`Allow ${note(id).name} again`} onClick={() => update({ avoid: draft.avoid.filter((a) => a !== id) })}>{note(id).name} ×</button>)}</div>
        </section>
      )}

      {draft.step === 3 && (
        <section className="step">
          <h1>Dreaming <em>generation {draft.generation + 1}</em></h1>
          <p className="lede">Guide the engine. Each reaction reshapes the next set of compositions around your taste.</p>
          <div className="chips steer" role="group" aria-label="Steer the next generation">
            {STEERS.map((s) => <button key={s.id} className="chip plain" onClick={() => update({ steer: mergeSteer(draft.steer, s.steer) as Draft["steer"], generation: draft.generation + 1 })}>{s.label}</button>)}
            <button className="chip plain accent" onClick={() => update({ generation: draft.generation + 1 })}>Dream again</button>
            {Object.keys(draft.steer).length > 0 && <button className="chip plain" onClick={() => update({ steer: {} })}>Clear steering</button>}
          </div>
          <div className="candidate-grid">
            {candidates.map((c) => <CandidateCard key={c.id} c={c} liked={liked.includes(c.id)} onChoose={() => choose(c)} onLike={() => feedback(c, 1)} onDislike={() => feedback(c, -1)} />)}
          </div>
          {!candidates.length && <p className="muted">No compositions fit that brief. Remove some avoided notes and try again.</p>}
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
          <div className="identity">
            <div className="identity-preview" aria-live="polite">
              <div className="stage" style={{ "--glow": b.glass } as React.CSSProperties}>
                <Bottle branding={b} width={190} />
                <Box branding={b} typeLabel={typeName} width={140} />
              </div>
              <p className="preview-name">{b.name || "Your fragrance"}</p>
              <p className="muted preview-tag">{b.tagline}</p>
            </div>
            <div className="identity-form">
              <div className="panel ideas">
                <div className="panel-head"><h3>AI concepts</h3><button className="btn small" disabled={brandBusy} onClick={suggestBrand}>{brandBusy ? "Thinking…" : "Suggest more"}</button></div>
                <div className="idea-list">
                  {brandIdeas.map((x) => (
                    <button key={x.name + x.tagline} className="idea" onClick={() => update({ branding: { ...b, name: x.name, tagline: x.tagline, story: x.story, bottle: x.bottle, packaging: x.packaging } })}>
                      <b>{x.name}</b><span>{x.tagline}</span>
                    </button>
                  ))}
                </div>
              </div>
              <label className="field"><span>Name</span><input maxLength={60} value={b.name} onChange={(e) => update({ branding: { ...b, name: e.target.value } })} /></label>
              <label className="field"><span>Tagline</span><input maxLength={100} value={b.tagline} onChange={(e) => update({ branding: { ...b, tagline: e.target.value } })} /></label>
              <label className="field"><span>Story</span><textarea rows={2} maxLength={400} value={b.story} onChange={(e) => update({ branding: { ...b, story: e.target.value } })} /></label>
              <fieldset className="choice"><legend>Perfume type</legend>
                <div className="option-grid">{CONCENTRATIONS.map((c) => <button key={c.id} className={`option${draft.concentration === c.id ? " on" : ""}`} aria-pressed={draft.concentration === c.id} onClick={() => update({ concentration: c.id })}><b>{c.name}</b><small>{c.pct}% · {c.blurb}</small></button>)}</div>
              </fieldset>
              <fieldset className="choice"><legend>Bottle</legend>
                <div className="option-grid three">{BOTTLES.map((o) => <button key={o.id} className={`option center${b.bottle === o.id ? " on" : ""}`} aria-pressed={b.bottle === o.id} onClick={() => update({ branding: { ...b, bottle: o.id } })}><Bottle branding={{ ...b, name: b.name, bottle: o.id }} width={46} /><b>{o.name}</b></button>)}</div>
              </fieldset>
              <fieldset className="choice"><legend>Packaging</legend>
                <div className="option-grid">{PACKAGING.map((o) => <button key={o.id} className={`option${b.packaging === o.id ? " on" : ""}`} aria-pressed={b.packaging === o.id} onClick={() => update({ branding: { ...b, packaging: o.id } })}><b>{o.name}</b><small>{o.blurb}</small></button>)}</div>
              </fieldset>
              <div className="colors">
                <label>Liquid <input type="color" value={b.glass} onChange={(e) => update({ branding: { ...b, glass: e.target.value } })} /></label>
                <label>Accent <input type="color" value={b.accent} onChange={(e) => update({ branding: { ...b, accent: e.target.value } })} /></label>
                <label>Lettering <input type="color" value={b.label} onChange={(e) => update({ branding: { ...b, label: e.target.value } })} /></label>
              </div>
            </div>
          </div>
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
                <strong>Ownership.</strong> When you save, this formula and everything created with it are fully owned by Rhythm and its owners. No one, including you, can claim trademarks, copyrights or other rights in it. <Link to="/terms">Read the terms</Link>.
              </div>
              {saving === "terms" ? (
                <div className="notice"><p>The terms have changed. Accept them to save.</p><button className="btn primary" onClick={acceptTerms}>I accept the terms</button></div>
              ) : (
                <div className="actions">
                  <button className="btn primary" disabled={saving === "Saving…"} onClick={save}>{saved ? "Saved" : saving === "Saving…" ? "Saving…" : user ? (draft.id ? "Save changes" : "Save formula") : "Sign in to save"}</button>
                  <button className="btn ghost" onClick={() => window.print()}>Print</button>
                  <button className="btn ghost" onClick={() => { if (confirm("Start a new fragrance? Unsaved changes to this draft will be lost.")) { setDraft(newDraft()); setBrandIdeas([]); setSaved(false); } }}>Start another</button>
                </div>
              )}
              {saved && <p className="good-text" role="status">Saved. Find it in <Link to="/account">My formulas</Link>.</p>}
              {saving && saving !== "Saving…" && saving !== "terms" && <p className="warn-text" role="alert">{saving}</p>}
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
