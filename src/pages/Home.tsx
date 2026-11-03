import { Link } from "react-router-dom";
import { useMemo } from "react";
import { generate, simulate } from "../../shared/engine/generate";
import { Bottle } from "../components/Bottle";
import { CREATE_NEW, CREATE_RESUME, draftLabel, isUnfinished, loadDraft, loadShelved, noteColor, useSession } from "../lib";
import { NOTES } from "../../shared/data/notes";

const STEPS = [
  ["Sign in", "Create a free account so every formula you compose is saved to your collection."],
  ["Choose what you love", "Spin the fragrance wheel and pick two or more notes you already know."],
  ["Say how it should feel", "Mild and gentle, fresh and bright, or strong and bold. You set the character."],
  ["Guide the dream", "Rhythm composes candidates. Like, reject and steer them until one feels like yours."],
  ["Perfect it in the Studio", "Watch it evolve hour by hour, tune every weight, and let the balancer refine it."],
  ["Give it an identity", "Choose its type, bottle, name and packaging, with AI ideas at every turn."],
];

export function Home() {
  const { user } = useSession();
  const demo = useMemo(() => {
    const c = generate({ seeds: ["bergamot", "jasmine", "oud"], mood: "elegant", strength: "moderate" }, 1, 11)[0];
    return { c, sim: simulate(c.items, c.concentration) };
  }, []);
  // Unfinished work gets its own way back in; "Start creating" always means a new fragrance.
  const unfinished = useMemo(() => {
    const d = loadDraft();
    if (isUnfinished(d)) return { name: draftLabel(d), state: undefined };
    const s = loadShelved();
    return s && isUnfinished(s) ? { name: draftLabel(s), state: CREATE_RESUME } : null;
  }, []);
  const ribbons = useMemo(() => NOTES.filter((_, i) => i % 7 === 0).slice(0, 12), []);
  return (
    <>
      <section className="hero">
        <div className="hero-glow" aria-hidden="true">
          {ribbons.map((n, i) => <span key={n.id} style={{ background: noteColor(n), left: `${(i * 8.3) % 100}%`, animationDelay: `${i * -2.1}s`, animationDuration: `${16 + (i % 5) * 3}s` }} />)}
        </div>
        <div className="hero-copy">
          <p className="eyebrow">The AI-assisted perfume studio</p>
          <h1>Compose a fragrance that has never existed.</h1>
          <p className="lede">Tell Rhythm the notes you love and how you want to feel. It remixes known accords into new formulas, then shows you how they will open, unfold and fade on skin.</p>
          <div className="actions">
            <Link to={user ? "/create" : "/login?next=/create"} state={user ? CREATE_NEW : undefined} className="btn primary">{user ? "Start creating" : "Sign in to start creating"}</Link>
            {user && unfinished && <Link to="/create" state={unfinished.state} className="btn">Resume {unfinished.name}</Link>}
            <Link to="/notes" className="btn ghost">Explore the notes</Link>
          </div>
          {user && unfinished && <p className="muted small-note">Starting a new fragrance keeps “{unfinished.name}” exactly as it is now, so you can resume it later.</p>}
        </div>
        <div className="hero-bottle">
          <Bottle branding={{ name: demo.c.name, bottle: "flacon", glass: "#c98b3c", accent: "#f4e3bf", label: "#14101c" }} width={260} />
        </div>
      </section>

      <section className="section">
        <h2>From a feeling to a formula</h2>
        <ol className="steps-list">
          {STEPS.map(([t, d], i) => <li key={t}><span>{i + 1}</span><div><h3>{t}</h3><p>{d}</p></div></li>)}
        </ol>
      </section>

      <section className="section feature-grid">
        <article><h3>See it fade before you make it</h3><p>A living river of notes shows which materials lead at every hour, and which remain after {Math.round(demo.sim.lifespan > 24 ? 24 : demo.sim.lifespan)} hours.</p></article>
        <article><h3>Balance with one touch</h3><p>Rhythm tunes the pyramid, dosage and strength while holding indicative IFRA limits as hard caps.</p></article>
        <article><h3>Yours to guide</h3><p>Every like and rejection teaches the engine your taste, so each generation comes closer.</p></article>
      </section>
    </>
  );
}
