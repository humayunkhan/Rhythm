import { useMemo, useState } from "react";
import { note } from "../../shared/data/notes";
import { facetColor, scentColor } from "../../shared/engine/brand";
import { analyse, concentration } from "../../shared/engine/formula";
import { dilutionFor, fmtDilution, type DilutionMap } from "../../shared/engine/dilution";
import { dominantFacets, type Candidate } from "../../shared/engine/generate";
import { scentAt, simulate, TIMES } from "../../shared/engine/simulate";
import type { FacetVector, Position } from "../../shared/types";
import { fmtDuration, noteColor } from "../lib";
import { Bottle } from "./Bottle";
import { NoteCard, useNoteHover } from "./NoteHover";
import { NoteIcon } from "./NoteIcon";

const PHASES = [
  { label: "Opening", hour: 0.1, when: "first minutes" },
  { label: "Heart", hour: 1.5, when: "after an hour" },
  { label: "Drydown", hour: 6, when: "hours later" },
];

/** Plain-language fit for season and time of day, read from the scent's facets and strength. */
function bestWorn(f: FacetVector, strength: number) {
  const fresh = f.fresh + f.citrus + f.aquatic + f.green;
  const warm = f.amber + f.sweet + f.spicy + f.woody + f.smoky;
  const seasons = fresh > warm * 1.3 ? ["Spring", "Summer"] : warm > fresh * 1.3 ? ["Autumn", "Winter"] : f.floral > 0.5 ? ["Spring", "Autumn"] : ["All year"];
  const time = strength > 62 || warm > fresh * 1.6 ? "Evening" : strength < 40 ? "Daytime" : "Day to night";
  return [...seasons, time];
}

const level = (v: number) => (v >= 75 ? "Very high" : v >= 55 ? "High" : v >= 35 ? "Moderate" : "Soft");

/** The composition as a bar of its notes, each as wide as its share. Hover or focus a segment for the note's details. */
function NoteSpectrum({ items, dil, required }: { items: Candidate["items"]; dil?: DilutionMap; required?: string[] }) {
  const hover = useNoteHover();
  return (
    <>
      <div className="spectrum dream-spectrum" role="list" aria-label="Notes by share of the concentrate">
        {items.map((i) => {
          const n = note(i.noteId);
          return <span key={i.noteId} role="listitem" tabIndex={0} aria-label={`${n.name}, ${i.parts.toFixed(1)}%`} style={{ flex: i.parts, background: noteColor(n) }} {...hover.bind(i.noteId)} />;
        })}
      </div>
      {hover.render((id) => {
        const share = items.find((i) => i.noteId === id)?.parts ?? 0;
        return (
          <>
            <div className="pop-share">
              <b>{share.toFixed(1)}%</b> of the concentrate · {note(id).position} note · stock {fmtDilution(dilutionFor(id, dil))}{required?.includes(id) && " · must use"}
            </div>
            <NoteCard id={id} />
          </>
        );
      })}
    </>
  );
}

export function DreamCard({ c, index = 0, fresh, liked, dil, required, onChoose, onLike, onDislike }: { c: Candidate; index?: number; fresh?: Set<string>; liked?: boolean; dil?: DilutionMap; required?: string[]; onChoose: () => void; onLike: () => void; onDislike: () => void }) {
  const [open, setOpen] = useState(false);
  // Performance follows the user's stock dilutions, like the Studio.
  const a = useMemo(() => (dil ? analyse(c.items, c.concentration, "fine", dil) : c.analysis), [c, dil]);
  const sim = useMemo(() => simulate(c.items, c.concentration, undefined, TIMES, a.dose), [c, a.dose]);
  const glass = scentColor(c.analysis.facets);
  const phases = PHASES.map((p) => ({ ...p, notes: scentAt(sim, p.hour).slice(0, 3) }));
  const facets = dominantFacets(a.facets, 4);
  const maxFacet = Math.max(...facets.map((f) => a.facets[f]), 0.01);
  const tier = (pos: Position) => c.items.filter((i) => note(i.noteId).position === pos);
  const metres = Math.max(...sim.sillageM);
  const newCount = fresh ? c.items.filter((i) => fresh.has(i.noteId)).length : 0;

  return (
    <article className={`dream-card${liked ? " liked" : ""}`} style={{ "--glow": glass, animationDelay: `${index * 90}ms` } as React.CSSProperties}>
      {newCount > 0 && <span className="dream-new" title="Notes this generation added">{newCount} new {newCount === 1 ? "note" : "notes"}</span>}
      <header className="dream-head">
        <div className="dream-bottle"><Bottle branding={{ name: c.name, bottle: "flacon", glass, accent: "#f4e3bf", label: "#14101c" }} width={78} /></div>
        <div>
          <p className="eyebrow">{concentration(c.concentration).name}</p>
          <h3>{c.name}</h3>
          <p className="dream-profile">{c.profile}</p>
          <div className="chips small">{bestWorn(a.facets, a.strength).map((t) => <span key={t} className="tag">{t}</span>)}</div>
        </div>
        <div className="dream-score" title="Overall composition score"><b>{a.score}</b><span>score</span></div>
      </header>

      <div className="dream-evolution" aria-label="How the scent evolves">
        {phases.map((p) => (
          <div key={p.label} className="phase" style={{ background: `linear-gradient(135deg, ${[...p.notes.map((n) => noteColor(note(n.noteId)) + "55"), "#ffffff08"].join(", ")})` }}>
            <small>{p.label} · {p.when}</small>
            <span>{p.notes.map((n) => note(n.noteId).name).join(", ") || "Faded"}</span>
          </div>
        ))}
      </div>

      <div className="dream-body">
        <div className="mini-pyramid" aria-label="Note pyramid">
          {(["top", "heart", "base"] as Position[]).map((pos) => (
            <div key={pos} className={`mp-row mp-${pos}`}>
              <b>{pos}</b>
              <span>{tier(pos).map((i) => <em key={i.noteId} className={`${fresh?.has(i.noteId) ? "fresh" : ""}${required?.includes(i.noteId) ? " must" : ""}`} title={fresh?.has(i.noteId) ? "New in this generation" : required?.includes(i.noteId) ? "Required by your brief" : undefined}><NoteIcon n={note(i.noteId)} />{note(i.noteId).name}</em>)}</span>
            </div>
          ))}
        </div>
        <div className="dream-metrics">
          <div className="meter"><span>Longevity</span><div><i style={{ width: `${a.longevity}%` }} /></div><b>{sim.lifespan >= 24 ? "24 h+" : fmtDuration(sim.lifespan)}</b></div>
          <div className="meter"><span>Sillage</span><div><i style={{ width: `${a.sillage}%` }} /></div><b>{metres.toFixed(1)} m</b></div>
          <div className="meter"><span>Projection</span><div><i style={{ width: `${a.projection}%` }} /></div><b>{level(a.projection)}</b></div>
          <div className="meter"><span>Harmony</span><div><i style={{ width: `${a.harmony}%` }} /></div><b>{a.harmony}</b></div>
          <div className="facet-bars">
            {facets.map((f) => <span key={f} style={{ "--w": `${(a.facets[f] / maxFacet) * 100}%`, "--c": facetColor(f) } as React.CSSProperties}>{f}</span>)}
          </div>
        </div>
      </div>
      <NoteSpectrum items={c.items} dil={dil} required={required} />
      <p className="muted small-note spectrum-note">{c.items.length} materials · each segment is a note's share of the concentrate; hover one for details.</p>

      {open && (
        <div className="dream-more">
          {c.rationale.length > 0 ? <ul>{c.rationale.map((r) => <li key={r}>{r}</li>)}</ul> : <p className="muted">Built entirely from your favourites and required notes.</p>}
        </div>
      )}

      <div className="actions">
        <button className="btn primary small" onClick={onChoose}>Open in Studio</button>
        <button className="btn ghost small" aria-label={`More like ${c.name}`} aria-pressed={liked} onClick={onLike}>♥ More like this</button>
        <button className="btn ghost small" aria-label={`Less like ${c.name}`} onClick={onDislike}>Less</button>
        <button className="link-btn dream-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Less detail" : "Why it works"}</button>
      </div>
    </article>
  );
}
