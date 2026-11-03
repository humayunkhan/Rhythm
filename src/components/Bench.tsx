import { useEffect, useMemo, useState } from "react";
import { ACCORDS } from "../../shared/data/catalog";
import { NOTES, NOTE_BY_ID, note } from "../../shared/data/notes";
import { mixColors } from "../../shared/engine/brand";
import { fmtDilution } from "../../shared/engine/dilution";
import type { Analysis } from "../../shared/engine/formula";
import type { FormulaItem, Position } from "../../shared/types";
import { FAMILY_META, noteColor } from "../lib";
import { accordIcon } from "../icons";
import { NoteCard, useNoteHover } from "./NoteHover";
import { NoteIcon } from "./NoteIcon";

export type Group = { id: string; name: string; blurb: string; color: string; icon: string; notes: string[]; accord: boolean };

const LOOSE: Record<Position, { name: string; blurb: string; icon: string }> = {
  top: { name: "Top modifiers", blurb: "Bright, volatile notes that shape the first impression.", icon: "✨" },
  heart: { name: "Heart modifiers", blurb: "Notes that colour the core of the scent.", icon: "💗" },
  base: { name: "Base & fixatives", blurb: "Slow notes that anchor the blend and make it last.", icon: "⚓" },
};

/**
 * Sorts a formula into the classic accords it contains, so the bench reads like a perfumer's
 * worksheet. Greedy: the accord that explains the most of the formula claims its notes first.
 */
export function groupByAccords(ids: string[]): Group[] {
  const left = new Set(ids);
  const ranked = ACCORDS.map((a) => {
    const hit = Object.keys(a.parts).filter((id) => left.has(id));
    const total = Object.values(a.parts).reduce((s, v) => s + v, 0) || 1;
    const covered = hit.reduce((s, id) => s + a.parts[id], 0) / total;
    return { a, score: hit.length * covered };
  }).sort((x, y) => y.score - x.score);
  const groups: Group[] = [];
  for (const { a } of ranked) {
    const hit = Object.keys(a.parts).filter((id) => left.has(id));
    if (hit.length < 2) continue;
    hit.forEach((id) => left.delete(id));
    groups.push({ id: a.id, name: a.name, blurb: a.description, color: FAMILY_META[a.family].color, icon: accordIcon(a), notes: hit, accord: true });
  }
  for (const pos of ["top", "heart", "base"] as Position[]) {
    const rest = ids.filter((id) => left.has(id) && note(id).position === pos);
    if (rest.length) groups.push({ id: `loose-${pos}`, ...LOOSE[pos], color: "#c8bfd1", notes: rest, accord: false });
  }
  return groups;
}

// Square-root slider travel gives fine control over trace materials as well as big ones.
const MAX = 60;
const toSlider = (pct: number) => Math.round(Math.sqrt(Math.min(MAX, pct) / MAX) * 1000);
const fromSlider = (v: number) => Math.pow(v / 1000, 2) * MAX;
const stepFor = (pct: number) => (pct < 2 ? 0.1 : pct < 10 ? 0.5 : 1);

function PctInput({ value, label, onCommit }: { value: number; label: string; onCommit: (v: number) => void }) {
  const [text, setText] = useState(value.toFixed(1));
  useEffect(() => setText(value.toFixed(1)), [value]);
  const commit = () => {
    const v = parseFloat(text);
    if (Number.isFinite(v)) onCommit(Math.max(0, Math.min(100, v)));
    else setText(value.toFixed(1));
  };
  return <input className="pct-input" inputMode="decimal" aria-label={`${label} percent`} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
}

/** The accord's emblem inside a ring that fills with the group's share of the concentrate. */
function AccordBadge({ pct, color, icon }: { pct: number; color: string; icon: string }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <span className="accord-badge" aria-hidden="true">
      <svg viewBox="0 0 64 64" width="64" height="64">
        <circle cx="32" cy="32" r={r} fill="none" className="badge-track" strokeWidth="5" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${Math.min(1, pct / 60) * c} ${c}`} transform="rotate(-90 32 32)" style={{ transition: "stroke-dasharray .4s" }} />
      </svg>
      <span className="badge-icon" style={{ background: `radial-gradient(circle, ${color}55, transparent 70%)` }}>{icon}</span>
    </span>
  );
}

export function Bench({ items, analysis, locked, required = [], onToggleLock, onSet, onRemove, onScaleGroup }: {
  items: FormulaItem[];
  analysis: Analysis;
  locked: Set<string>;
  /** Notes the user marked as required in the brief. */
  required?: string[];
  onToggleLock: (id: string) => void;
  onSet: (id: string, pct: number) => void;
  onRemove: (id: string) => void;
  onScaleGroup: (ids: string[], factor: number) => void;
}) {
  const key = items.map((i) => i.noteId).sort().join();
  // Grouping depends only on which notes are present, so moving a slider never reshuffles the bench.
  const groups = useMemo(() => groupByAccords(items.map((i) => i.noteId)), [key]);
  const pct = new Map(items.map((i) => [i.noteId, i.parts]));
  const ifra = new Map(analysis.ifra.map((r) => [r.noteId, r]));
  const stock = new Map(analysis.dose?.rows.map((r) => [r.noteId, r.dilution]) ?? []);
  const hover = useNoteHover();

  return (
    <div className="bench">
      {groups.map((g) => {
        const total = g.notes.reduce((s, id) => s + (pct.get(id) ?? 0), 0);
        const liquid = mixColors(g.notes.map((id) => [noteColor(note(id)), pct.get(id) ?? 0.1] as [string, number]));
        return (
          <section key={g.id} className={`flask${g.accord ? " accord" : ""}`} style={{ "--fam": g.color } as React.CSSProperties}>
            <header className="flask-head">
              <AccordBadge pct={total} color={liquid} icon={g.icon} />
              <div className="flask-title">
                <p className="eyebrow">{g.accord ? "Accord" : "Modifiers"}</p>
                <h4>{g.name}</h4>
                <p className="muted">{g.blurb}</p>
              </div>
              <div className="flask-total">
                <b>{total.toFixed(1)}<small>%</small></b>
                {groups.length > 1 && (
                  <div className="scale-btns">
                    <button type="button" aria-label={`Reduce ${g.name}`} title="Reduce this group by 10%" onClick={() => onScaleGroup(g.notes, 1 / 1.1)}>−</button>
                    <button type="button" aria-label={`Boost ${g.name}`} title="Boost this group by 10%" onClick={() => onScaleGroup(g.notes, 1.1)}>+</button>
                  </div>
                )}
              </div>
            </header>
            <ul className="vials">
              {g.notes.slice().sort((a, b) => (pct.get(b) ?? 0) - (pct.get(a) ?? 0)).map((id) => {
                const n = note(id);
                const v = pct.get(id) ?? 0;
                const r = ifra.get(id);
                const over = (r?.ratio ?? 0) > 1;
                const isLocked = locked.has(id);
                const step = stepFor(v);
                return (
                  <li key={id} className={`vial${over ? " over" : ""}${isLocked ? " locked" : ""}`}>
                    <span className="tube" aria-hidden="true"><i style={{ height: `${Math.min(100, (v / 40) * 100)}%`, background: noteColor(n) }} /></span>
                    <span className="vial-name" tabIndex={0} {...hover.bind(id)}>
                      <b><NoteIcon n={n} />{n.name}</b>
                      <small>{n.position}{stock.get(id) && <> · <span className="stock-tag" title="Your stock dilution for this note">{fmtDilution(stock.get(id)!)}</span></>}{required.includes(id) && <> · <span className="must-tag">must use</span></>}{r?.limit != null && <> · limit {r.limit}%{over && " exceeded"}</>}</small>
                    </span>
                    <input type="range" className="vial-slider" min="0" max="1000" value={toSlider(v)} disabled={isLocked} aria-label={`${n.name} share`} aria-valuetext={`${v.toFixed(1)} percent`}
                      style={{ "--c": noteColor(n), "--p": `${toSlider(v) / 10}%` } as React.CSSProperties} onChange={(e) => onSet(id, fromSlider(+e.target.value))} />
                    <span className="stepper-ctl">
                      <button type="button" disabled={isLocked} aria-label={`Less ${n.name}`} onClick={() => onSet(id, Math.max(0, v - step))}>−</button>
                      <PctInput value={v} label={n.name} onCommit={(x) => onSet(id, x)} />
                      <button type="button" disabled={isLocked} aria-label={`More ${n.name}`} onClick={() => onSet(id, v + step)}>+</button>
                    </span>
                    <button type="button" className={`lock${isLocked ? " on" : ""}`} aria-pressed={isLocked} aria-label={`${isLocked ? "Unlock" : "Lock"} ${n.name}`} title={isLocked ? "Locked: other changes won't move it" : "Lock this amount"} onClick={() => onToggleLock(id)}>{isLocked ? "🔒" : "🔓"}</button>
                    <button type="button" className="icon-btn" aria-label={`Remove ${n.name}`} onClick={() => onRemove(id)}>×</button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {hover.render((id) => <NoteCard id={id} />)}
    </div>
  );
}

/** Search notes, or drop in a whole classic accord at a chosen share. */
export function Shelf({ present, suggestions, onAddNote, onAddAccord }: {
  present: string[];
  suggestions: { noteId: string; reason: string }[];
  onAddNote: (id: string) => void;
  onAddAccord: (parts: Record<string, number>) => void;
}) {
  const [mode, setMode] = useState<"notes" | "accords">("notes");
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase();
  const notes = s ? NOTES.filter((n) => n.name.toLowerCase().includes(s) && !present.includes(n.id)).slice(0, 14) : [];
  const accords = ACCORDS.filter((a) => !s || a.name.toLowerCase().includes(s) || a.character.some((c) => c.includes(s)));
  return (
    <div className="shelf">
      <div className="shelf-head">
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={mode === "notes"} className={mode === "notes" ? "on" : ""} onClick={() => setMode("notes")}>Add a note</button>
          <button role="tab" aria-selected={mode === "accords"} className={mode === "accords" ? "on" : ""} onClick={() => setMode("accords")}>Add an accord</button>
        </div>
        <input type="search" value={q} placeholder={mode === "notes" ? "Search the catalogue" : "Search accords: smoky, fresh, sweet…"} aria-label="Search the shelf" onChange={(e) => setQ(e.target.value)} />
      </div>
      {mode === "notes" ? (
        <>
          {!s && <p className="muted small-note">Suggested for this blend</p>}
          <div className="chips">
            {(s ? notes.map((n) => ({ noteId: n.id, reason: n.description })) : suggestions).map((x) => (
              <button key={x.noteId} className="chip" title={x.reason} onClick={() => { onAddNote(x.noteId); setQ(""); }}><NoteIcon n={note(x.noteId)} />+ {note(x.noteId).name}</button>
            ))}
            {s && !notes.length && <p className="muted">No notes match that search.</p>}
          </div>
        </>
      ) : (
        <div className="accord-shelf">
          {accords.map((a) => {
            const ids = Object.keys(a.parts).filter((id) => NOTE_BY_ID.has(id));
            const have = ids.filter((id) => present.includes(id)).length;
            return (
              <button key={a.id} className="accord-pick" title={a.description} onClick={() => onAddAccord(a.parts)}>
                <span className="spectrum" aria-hidden="true">{ids.map((id) => <span key={id} style={{ flex: a.parts[id], background: noteColor(note(id)) }} />)}</span>
                <b><span aria-hidden="true">{accordIcon(a)}</span> {a.name}</b>
                <small>{a.character.join(" · ")}{have > 0 && ` · ${have}/${ids.length} already in`}</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
