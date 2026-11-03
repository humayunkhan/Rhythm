import { useMemo, useState } from "react";
import { NOTES, NOTE_BY_ID } from "../../shared/data/notes";
import { affinity } from "../../shared/engine/formula";
import { FAMILIES, type Family } from "../../shared/types";
import { FAMILY_META, noteColor } from "../lib";
import { NoteIcon } from "./NoteIcon";

const LEVELS = [
  { at: 0, name: "Timeless", blurb: "Pairings perfumers have trusted for a century. Smooth, polished, easy to love.", icon: "◎" },
  { at: 0.25, name: "Familiar twist", blurb: "Classic structure with one quiet surprise tucked inside.", icon: "◐" },
  { at: 0.5, name: "Curious", blurb: "A few unexpected companions that make people ask what you are wearing.", icon: "✧" },
  { at: 0.75, name: "Daring", blurb: "Contrasts and clashes, held together by a careful frame.", icon: "✦" },
  { at: 1, name: "Avant-garde", blurb: "Unheard-of combinations. Bold, artistic and sometimes polarising.", icon: "✺" },
];

const levelFor = (v: number) => LEVELS.reduce((best, l) => (Math.abs(l.at - v) < Math.abs(best.at - v) ? l : best));

/** Shows what the chosen adventure level means using the user's own seed notes. */
function examplePairings(seeds: string[], level: number) {
  const out: { seed: string; partner: string }[] = [];
  for (const seed of seeds.slice(0, 3)) {
    const ranked = NOTES.filter((n) => !seeds.includes(n.id)).map((n) => ({ id: n.id, a: affinity(seed, n.id) })).sort((x, y) => y.a - x.a);
    // Low adventure picks from the most natural partners; high adventure reaches far down the list.
    const idx = Math.min(ranked.length - 1, Math.round(Math.pow(level, 1.6) * (ranked.length * 0.8)));
    const partner = ranked[idx]?.id;
    if (partner && !out.some((o) => o.partner === partner)) out.push({ seed, partner });
  }
  return out;
}

export function AdventureDial({ value, seeds, onChange }: { value: number; seeds: string[]; onChange: (v: number) => void }) {
  const level = levelFor(value);
  const pairs = useMemo(() => examplePairings(seeds, level.at), [seeds, level.at]);
  return (
    <fieldset className="choice adventure">
      <legend>How adventurous?</legend>
      <div className="adv-track" style={{ "--pos": value } as React.CSSProperties}>
        <div className="adv-glow" aria-hidden="true" />
        <input type="range" min="0" max="1" step="0.25" value={level.at} aria-valuetext={level.name} onChange={(e) => onChange(+e.target.value)} />
        <div className="adv-stops">
          {LEVELS.map((l) => (
            <button key={l.name} type="button" className={l === level ? "on" : ""} aria-pressed={l === level} style={{ left: `${l.at * 100}%` }} onClick={() => onChange(l.at)}>
              <span className="adv-icon" aria-hidden="true">{l.icon}</span>{l.name}
            </button>
          ))}
        </div>
      </div>
      <div className="adv-card" aria-live="polite">
        <p><b>{level.name}.</b> {level.blurb}</p>
        {pairs.length > 0 && (
          <div className="adv-pairs">
            <span className="muted">Pairings like</span>
            {pairs.map((p) => (
              <span key={p.seed + p.partner} className="adv-pair">
                <i style={{ background: noteColor(NOTE_BY_ID.get(p.seed)!) }} />{NOTE_BY_ID.get(p.seed)!.name}
                <em>+</em>
                <i style={{ background: noteColor(NOTE_BY_ID.get(p.partner)!) }} />{NOTE_BY_ID.get(p.partner)!.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </fieldset>
  );
}

const COMMON_DISLIKES = ["oud", "patchouli", "tuberose", "coconut", "leather", "incense", "white-musk", "civet", "birch-tar", "lavender", "vanilla", "cinnamon"];

const MODES = {
  avoid: {
    legend: "Anything you'd rather not smell?",
    hint: "Tap a note to rule it out. Tap again to bring it back. Favourites and must-use notes can't be avoided.",
    search: "Search notes to avoid", common: "Often disliked", on: "Avoided", other: "Must use", listLabel: "Avoided notes", chip: "⊘", allow: "Allow",
  },
  require: {
    legend: "Any notes it must use?",
    hint: "Tap a note to include it in every composition, alongside your favourites. Tap again to make it optional. Avoided notes can't be required.",
    search: "Search notes to require", common: "Popular choices", on: "Must use", other: "Avoided", listLabel: "Required notes", chip: "✓", allow: "Make optional",
  },
} as const;
const COMMON_PICKS = ["bergamot", "rose", "jasmine", "vanilla", "sandalwood", "white-musk", "iris", "vetiver", "amber", "lavender", "cedarwood", "pink-pepper"];

/** Picks notes to rule out ("avoid") or to use in every composition ("require"). A note can't be in both lists. */
function NotePicker({ mode, picked, seeds, other, onChange }: { mode: keyof typeof MODES; picked: string[]; seeds: string[]; other: string[]; onChange: (next: string[]) => void }) {
  const t = MODES[mode];
  const [family, setFamily] = useState<Family | "common">("common");
  const [q, setQ] = useState("");
  const toggle = (id: string) => onChange(picked.includes(id) ? picked.filter((a) => a !== id) : [...picked, id]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s) return NOTES.filter((n) => n.name.toLowerCase().includes(s));
    if (family === "common") return (mode === "avoid" ? COMMON_DISLIKES : COMMON_PICKS).map((id) => NOTE_BY_ID.get(id)).filter((n) => !!n);
    return NOTES.filter((n) => n.family === family);
  }, [q, family, mode]);
  const countIn = (f: Family) => picked.filter((id) => NOTE_BY_ID.get(id)?.family === f).length;

  return (
    <fieldset className={`choice avoid picker-${mode}`}>
      <legend>{t.legend}</legend>
      <p className="muted small-note">{t.hint}</p>
      <div className="avoid-bar">
        <input type="search" value={q} placeholder="Search a note" aria-label={t.search} onChange={(e) => setQ(e.target.value)} />
        {picked.length > 0 && <button type="button" className="link-btn" onClick={() => onChange([])}>Clear all ({picked.length})</button>}
      </div>
      {!q && (
        <div className="family-tabs" role="tablist" aria-label="Note families">
          <button type="button" role="tab" aria-selected={family === "common"} className={family === "common" ? "on" : ""} onClick={() => setFamily("common")}>{t.common}</button>
          {FAMILIES.map((f) => (
            <button key={f} type="button" role="tab" aria-selected={family === f} className={family === f ? "on" : ""} style={{ "--fam": FAMILY_META[f].color } as React.CSSProperties} onClick={() => setFamily(f)}>
              <i />{FAMILY_META[f].label}{countIn(f) > 0 && <b>{countIn(f)}</b>}
            </button>
          ))}
        </div>
      )}
      <div className="avoid-grid">
        {list.map((n) => {
          const seed = seeds.includes(n.id);
          const elsewhere = other.includes(n.id);
          const on = picked.includes(n.id);
          return (
            <button key={n.id} type="button" className={`avoid-tile${on ? " off" : ""}`} disabled={seed || elsewhere} aria-pressed={on} title={n.description} onClick={() => toggle(n.id)}>
              <i style={{ background: noteColor(n) }} />
              <span><NoteIcon n={n} />{n.name}</span>
              <small>{seed ? "Favourite" : elsewhere ? t.other : on ? t.on : n.position}</small>
            </button>
          );
        })}
        {!list.length && <p className="muted">No notes match that search.</p>}
      </div>
      {picked.length > 0 && (
        <div className="chips avoided" aria-label={t.listLabel}>
          {picked.map((id) => <button key={id} type="button" className="chip" aria-label={`${t.allow}: ${NOTE_BY_ID.get(id)?.name}`} onClick={() => toggle(id)}>{t.chip} {NOTE_BY_ID.get(id)?.name} ×</button>)}
        </div>
      )}
    </fieldset>
  );
}

export function AvoidPicker({ avoid, seeds, require = [], onChange }: { avoid: string[]; seeds: string[]; require?: string[]; onChange: (next: string[]) => void }) {
  return <NotePicker mode="avoid" picked={avoid} seeds={seeds} other={require} onChange={onChange} />;
}

export function RequirePicker({ require, seeds, avoid, onChange }: { require: string[]; seeds: string[]; avoid: string[]; onChange: (next: string[]) => void }) {
  return <NotePicker mode="require" picked={require} seeds={seeds} other={avoid} onChange={onChange} />;
}
