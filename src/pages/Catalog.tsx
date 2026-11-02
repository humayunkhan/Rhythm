import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ACCORDS, PERFUMES } from "../../shared/data/catalog";
import { NOTES, NOTE_BY_ID } from "../../shared/data/notes";
import { CONCENTRATIONS, limitFor, normalise, PRODUCTS } from "../../shared/engine/formula";
import { simulate } from "../../shared/engine/simulate";
import { FAMILIES, type Accord, type Family, type Note } from "../../shared/types";
import { AccordArt, NoteArt } from "../components/art";
import { MetricBars, NoteLifetimes } from "../components/viz";
import { FAMILY_META, loadDraft, noteColor, saveDraft, useSession } from "../lib";

const name = (id: string) => NOTE_BY_ID.get(id)?.name ?? id;
const accordMetrics = (a: Accord) => {
  const items = normalise(Object.entries(a.parts).map(([noteId, parts]) => ({ noteId, parts }))).filter((i) => NOTE_BY_ID.has(i.noteId));
  const avg = (k: "sillage" | "projection" | "longevity" | "strength") => items.reduce((s, i) => s + NOTE_BY_ID.get(i.noteId)![k] * i.parts / 100, 0);
  return { items, sillage: avg("sillage"), projection: avg("projection"), longevity: avg("longevity"), strength: avg("strength") };
};
const accordColors = (a: Accord) => Object.entries(a.parts).flatMap(([id, w]): [string, number][] => {
  const n = NOTE_BY_ID.get(id);
  return n ? [[noteColor(n), w]] : [];
});

function NoteDetail({ n }: { n: Note }) {
  const accords = ACCORDS.filter((a) => n.id in a.parts);
  const perfumes = PERFUMES.filter((p) => [...p.top, ...p.heart, ...p.base].includes(n.id));
  return (
    <article className="detail">
      <p className="crumb"><Link to="/notes">All notes</Link></p>
      <div className="detail-head">
        <NoteArt seed={n.id} color={noteColor(n)} family={n.family} size={200} />
        <div>
          <p className="eyebrow">{FAMILY_META[n.family].label} · {n.position} note</p>
          <h1>{n.name}</h1>
          <p className="lede">{n.description}</p>
          <button className="btn primary" onClick={() => { const d = loadDraft(); if (!d.seeds.includes(n.id)) d.seeds = [...d.seeds, n.id]; d.step = 0; saveDraft(d); location.assign("/create"); }}>Create with {n.name}</button>
        </div>
      </div>
      <div className="detail-grid">
        <section className="panel"><h3>Performance</h3><MetricBars note={n} /></section>
        <section className="panel">
          <h3>Use levels</h3>
          <p>Typical use: <b>{n.dose[0]} to {n.dose[1]}%</b> of the concentrate.</p>
          <table className="formula compact">
            <thead><tr><th>Product</th><th className="num">Indicative max in product</th></tr></thead>
            <tbody>{PRODUCTS.map((p) => { const l = limitFor(n, p.id); return <tr key={p.id}><td>{p.name} <small className="muted">{p.ifraCat}</small></td><td className="num">{l != null ? `${l}%` : n.ifra.status === "specification" ? "Check spec" : "Verify"}</td></tr>; })}</tbody>
          </table>
          {n.ifra.note && <p className="notice small-note">{n.ifra.note}.</p>}
          <p className="muted">Indicative only, not an IFRA record. Only the fine fragrance value is based on IFRA restrictions; other rows are conservative estimates. Always confirm with the <a href="https://ifrafragrance.org/" target="_blank" rel="noreferrer">current IFRA Standards</a> and your supplier's certificate.</p>
        </section>
        <section className="panel"><h3>Pairs well with</h3><div className="chips">{n.pairs.filter((p) => NOTE_BY_ID.has(p)).map((p) => <Link key={p} className="chip" to={`/notes/${p}`}><i style={{ background: noteColor(NOTE_BY_ID.get(p)!) }} />{name(p)}</Link>)}</div></section>
        <section className="panel"><h3>Found in accords</h3>{accords.length ? <div className="chips">{accords.map((a) => <Link key={a.id} className="chip plain" to={`/accords/${a.id}`}>{a.name}</Link>)}</div> : <p className="muted">Not used in a catalogue accord yet.</p>}</section>
        <section className="panel full"><h3>Found in well-known perfumes</h3>{perfumes.length ? <ul className="perfumes">{perfumes.map((p) => <li key={p.name}><b>{p.name}</b> <span className="muted">{p.house}, {p.year}</span></li>)}</ul> : <p className="muted">Not listed in our reference perfumes.</p>}
          <p className="muted small">Based on publicly described note pyramids, simplified. Brands belong to their owners and are unaffiliated with Rhythm.</p></section>
      </div>
    </article>
  );
}

function AccordDetail({ a }: { a: Accord }) {
  const m = useMemo(() => accordMetrics(a), [a]);
  const sim = useMemo(() => simulate(m.items, "edp"), [m]);
  return (
    <article className="detail">
      <p className="crumb"><Link to="/accords">All accords</Link></p>
      <div className="accord-banner"><AccordArt seed={a.id} colors={accordColors(a)} height={240} /><div><p className="eyebrow">{FAMILY_META[a.family].label} accord</p><h1>{a.name}</h1><p className="lede">{a.description}</p></div></div>
      <div className="detail-grid">
        <section className="panel"><h3>Structure</h3>
          <table className="formula compact"><tbody>{m.items.sort((x, y) => y.parts - x.parts).map((i) => <tr key={i.noteId}><td><Link to={`/notes/${i.noteId}`}>{name(i.noteId)}</Link></td><td className="num">{i.parts.toFixed(1)}%</td></tr>)}</tbody></table>
          <button className="btn primary small space-top" onClick={() => { const d = loadDraft(); saveDraft({ ...d, id: undefined, seeds: m.items.slice(0, 3).map((i) => i.noteId), items: m.items, step: 4, concentration: CONCENTRATIONS[1].id, branding: { ...d.branding, name: a.name } }); location.assign("/create"); }}>Open in Studio</button>
        </section>
        <section className="panel"><h3>Performance</h3><MetricBars note={m} /><div className="chips small space-top">{a.character.map((c) => <span key={c} className="tag">{c}</span>)}</div></section>
        <section className="panel full"><h3>How it fades</h3><NoteLifetimes sim={sim} items={m.items} hour={0} /></section>
        <section className="panel"><h3>Found in the style of</h3>{a.foundIn.length ? <ul className="perfumes">{a.foundIn.map((p) => <li key={p}>{p}</li>)}</ul> : <p className="muted">No references yet.</p>}<p className="muted small">Style references only. These are not the recipes of those perfumes.</p></section>
        <section className="panel"><h3>Also used in</h3><div className="chips">{a.products.map((p) => <span key={p} className="tag">{p}</span>)}</div></section>
      </div>
    </article>
  );
}

export default function Catalog({ kind }: { kind: "notes" | "accords" }) {
  const { id } = useParams();
  useSession(); // Re-render once admin-imported catalogue entries have merged.
  const [q, setQ] = useState("");
  const [family, setFamily] = useState<Family | "all">("all");
  const [position, setPosition] = useState("all");
  if (id) {
    const n = kind === "notes" ? NOTE_BY_ID.get(id) : undefined;
    const a = kind === "accords" ? ACCORDS.find((x) => x.id === id) : undefined;
    if (n) return <NoteDetail n={n} />;
    if (a) return <AccordDetail a={a} />;
    return <div className="narrow"><h1>We couldn't find that entry</h1><p><Link to={`/${kind}`}>Back to the catalogue</Link></p></div>;
  }
  const match = (s: string) => s.toLowerCase().includes(q.trim().toLowerCase());
  const notes = NOTES.filter((n) => match(n.name) && (family === "all" || n.family === family) && (position === "all" || n.position === position));
  const accords = ACCORDS.filter((a) => match(a.name) && (family === "all" || a.family === family));
  const total = kind === "notes" ? notes.length : accords.length;
  return (
    <div className="catalog">
      <header className="catalog-head">
        <h1>{kind === "notes" ? "Notes catalogue" : "Accords catalogue"}</h1>
        <p className="lede">{kind === "notes" ? "The raw vocabulary of perfume: how each material behaves, lasts and pairs." : "Time-tested harmonies: the building blocks Rhythm learns to remix."}</p>
        <div className="filters">
          <input type="search" aria-label="Search" placeholder={`Search ${kind}`} value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Family" value={family} onChange={(e) => setFamily(e.target.value as Family | "all")}>
            <option value="all">All families</option>
            {FAMILIES.map((f) => <option key={f} value={f}>{FAMILY_META[f].label}</option>)}
          </select>
          {kind === "notes" && <select aria-label="Layer" value={position} onChange={(e) => setPosition(e.target.value)}><option value="all">All layers</option><option value="top">Top</option><option value="heart">Heart</option><option value="base">Base</option></select>}
          <span className="muted" role="status">{total} found</span>
        </div>
      </header>
      {kind === "notes" ? (
        <div className="card-grid">
          {notes.map((n) => (
            <Link key={n.id} to={`/notes/${n.id}`} className="card">
              <NoteArt seed={n.id} color={noteColor(n)} family={n.family} size={300} />
              <div className="card-body"><h3>{n.name}</h3><p className="muted cap">{FAMILY_META[n.family].label} · {n.position}</p></div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card-grid wide">
          {accords.map((a) => (
            <Link key={a.id} to={`/accords/${a.id}`} className="card">
              <AccordArt seed={a.id} colors={accordColors(a)} height={150} />
              <div className="card-body"><h3>{a.name}</h3><p className="muted">{a.character.join(" · ")}</p></div>
            </Link>
          ))}
        </div>
      )}
      {!total && <p className="muted center">Nothing matches those filters.</p>}
      <p className="muted small art-note">Images are generative art drawn by Rhythm from each entry's character, not photographs.</p>
    </div>
  );
}
