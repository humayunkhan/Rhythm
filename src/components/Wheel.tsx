import { useMemo, useState } from "react";
import { NOTES, NOTE_BY_ID } from "../../shared/data/notes";
import { FAMILIES, type Family } from "../../shared/types";
import { FAMILY_META, noteColor } from "../lib";

const polar = (r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [200 + r * Math.cos(a), 200 + r * Math.sin(a)];
};

function arc(r1: number, r2: number, a0: number, a1: number) {
  const [x0, y0] = polar(r2, a0), [x1, y1] = polar(r2, a1), [x2, y2] = polar(r1, a1), [x3, y3] = polar(r1, a0);
  return `M${x0} ${y0} A${r2} ${r2} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r1} ${r1} 0 0 0 ${x3} ${y3}Z`;
}

/** The fragrance wheel: pick a family, then choose notes you know. Selections glow on the wheel. */
export function FragranceWheel({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  const [family, setFamily] = useState<Family>("floral");
  const [q, setQ] = useState("");
  const step = 360 / FAMILIES.length;
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? NOTES.filter((n) => n.name.toLowerCase().includes(s)) : NOTES.filter((n) => n.family === family);
  }, [q, family]);

  return (
    <div className="wheel-layout">
      <svg viewBox="0 0 400 400" className="wheel" role="group" aria-label="Fragrance wheel">
        {FAMILIES.map((f, i) => {
          const meta = FAMILY_META[f];
          const a0 = i * step, a1 = (i + 1) * step;
          const mid = a0 + step / 2;
          const [tx, ty] = polar(138, mid);
          const active = family === f && !q;
          const picks = selected.filter((id) => NOTE_BY_ID.get(id)?.family === f);
          return (
            <g key={f} className="wheel-seg" role="button" tabIndex={0} aria-label={`${meta.label} family`} aria-pressed={active}
              onClick={() => { setFamily(f); setQ(""); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFamily(f); setQ(""); } }}>
              <path d={arc(88, active ? 196 : 186, a0 + 0.7, a1 - 0.7)} fill={meta.color} fillOpacity={active ? 0.95 : 0.42} />
              <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fontSize="11.5" fontWeight="600" fill={active ? "#120d1a" : "#fff6e6"}>
                {meta.label.split(" ").map((w, k, all) => <tspan key={w} x={tx} dy={k === 0 ? (all.length - 1) * -6.5 : 13}>{w}</tspan>)}
              </text>
              {picks.map((id, k) => {
                const [x, y] = polar(172, a0 + ((k + 1) * step) / (picks.length + 1));
                return <circle key={id} cx={x} cy={y} r="5" fill="#fff6e6" stroke="#120d1a" strokeWidth="1.5" className="wheel-dot"><title>{NOTE_BY_ID.get(id)?.name}</title></circle>;
              })}
            </g>
          );
        })}
        <circle cx="200" cy="200" r="80" fill="#1a1424" stroke="#ffffff22" />
        <text x="200" y="192" textAnchor="middle" fontSize="38" fill="#e5b567" fontFamily="Cormorant Garamond, serif">{selected.length}</text>
        <text x="200" y="214" textAnchor="middle" fontSize="11" fill="#c8bfd1">{selected.length === 1 ? "note chosen" : "notes chosen"}</text>
      </svg>
      <div className="wheel-panel">
        <label className="field">
          <span>Search all notes</span>
          <input type="search" value={q} placeholder="Try jasmine, oud, lemon" onChange={(e) => setQ(e.target.value)} />
        </label>
        <h3>{q ? `Results for "${q}"` : FAMILY_META[family].label}</h3>
        <div className="chips" role="group" aria-label="Notes">
          {matches.map((n) => {
            const on = selected.includes(n.id);
            return (
              <button key={n.id} className={`chip${on ? " on" : ""}`} aria-pressed={on} title={n.description} onClick={() => onToggle(n.id)}>
                <i style={{ background: noteColor(n) }} />{n.name}
              </button>
            );
          })}
          {!matches.length && <p className="muted">No notes match that search.</p>}
        </div>
      </div>
    </div>
  );
}
