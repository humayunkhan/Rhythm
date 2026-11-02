import { useEffect, useMemo, useRef } from "react";
import { note, NOTE_BY_ID } from "../../shared/data/notes";
import { facetColor } from "../../shared/engine/brand";
import { analyse } from "../../shared/engine/formula";
import { scentAt, type Simulation } from "../../shared/engine/simulate";
import { FACETS, type FacetVector, type FormulaItem, type Position } from "../../shared/types";
import { fmtDuration, noteColor } from "../lib";

const HOURS = 24;
// Square-root time gives the fast early changes room while still showing the whole day.
const xOf = (h: number, w: number) => (Math.sqrt(h / HOURS)) * w;
const hOf = (x: number, w: number) => Math.pow(Math.max(0, Math.min(1, x / w)), 2) * HOURS;

const colorOf = (id: string) => {
  const n = NOTE_BY_ID.get(id);
  return n ? noteColor(n) : "#888";
};

const interp = (sim: Simulation, values: number[], h: number) => {
  const { times } = sim;
  let hi = times.findIndex((t) => t >= h);
  if (hi < 0) hi = times.length - 1;
  const lo = Math.max(0, hi - 1);
  const f = times[hi] === times[lo] ? 0 : (h - times[lo]) / (times[hi] - times[lo]);
  return values[lo] + (values[hi] - values[lo]) * f;
};

/** The scent river: a centred stream of every note, widening with strength and tapering as it fades. */
export function ScentRiver({ sim, hour, onHour }: { sim: Simulation; hour: number; onHour: (h: number) => void }) {
  const W = 900, H = 320, PAD = 26;
  const ref = useRef<SVGSVGElement>(null);
  const ordered = useMemo(() => {
    const lasts = sim.series.map((s) => ({ s, last: sim.lastsFor[s.noteId] ?? 0 }));
    return lasts.sort((a, b) => b.last - a.last).map((x) => x.s);
  }, [sim]);
  const samples = useMemo(() => Array.from({ length: 90 }, (_, i) => hOf((i / 89) * W, W)), []);
  const maxTotal = Math.max(...sim.total, 0.01);
  const scale = (H - PAD * 2 - 8) / maxTotal;
  const paths = useMemo(() => {
    const stacks = samples.map((h) => {
      const vals = ordered.map((s) => interp(sim, s.values, h) * scale);
      const total = vals.reduce((a, b) => a + b, 0);
      return { vals, start: (H - PAD) / 2 + 4 - total / 2 };
    });
    return ordered.map((s, k) => {
      const lower: string[] = [], upper: string[] = [];
      samples.forEach((h, i) => {
        const before = stacks[i].vals.slice(0, k).reduce((a, b) => a + b, 0);
        const y0 = stacks[i].start + before;
        const x = xOf(h, W);
        upper.push(`${x.toFixed(1)} ${y0.toFixed(1)}`);
        lower.unshift(`${x.toFixed(1)} ${(y0 + stacks[i].vals[k]).toFixed(1)}`);
      });
      return { id: s.noteId, d: `M${upper.join("L")}L${lower.join("L")}Z` };
    });
  }, [ordered, samples, sim, scale]);

  const onPointer = (e: React.PointerEvent) => {
    if (e.type === "pointermove" && e.buttons !== 1) return;
    const r = ref.current!.getBoundingClientRect();
    onHour(hOf(((e.clientX - r.left) / r.width) * W, W));
  };
  const cx = xOf(hour, W);
  return (
    <div>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="river" onPointerDown={onPointer} onPointerMove={onPointer}
        role="img" aria-label="Stream chart of each note's strength over 24 hours. Drag to move through time.">
        <g>{paths.map((p) => <path key={p.id} d={p.d} fill={colorOf(p.id)} fillOpacity=".86" stroke="#120d1a" strokeOpacity=".4" strokeWidth=".6"><title>{note(p.id).name}</title></path>)}</g>
        {[0.25, 1, 3, 6, 12, 24].map((h) => (
          <g key={h}>
            <line x1={xOf(h, W)} x2={xOf(h, W)} y1={8} y2={H - 22} stroke="#ffffff" strokeOpacity=".09" />
            <text x={Math.min(xOf(h, W), W - 20)} y={H - 6} fill="#a99fb3" fontSize="12" textAnchor="middle">{h < 1 ? "15 min" : `${h} h`}</text>
          </g>
        ))}
        <line x1={cx} x2={cx} y1={4} y2={H - 22} stroke="#fff6e6" strokeWidth="1.5" />
        <circle cx={cx} cy={10} r="6" fill="#fff6e6" />
      </svg>
    </div>
  );
}

/** A live particle aura around a wearer. Radius follows modelled sillage, colours follow what remains at this hour. */
export function SillageAura({ sim, hour }: { sim: Simulation; hour: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({ radius: 0, palette: [] as { color: string; share: number }[] });
  const metres = interp(sim, sim.sillageM, hour);

  useEffect(() => {
    state.current.radius = metres;
    state.current.palette = scentAt(sim, hour).slice(0, 7).map((s) => ({ color: colorOf(s.noteId), share: s.share }));
  }, [sim, hour, metres]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    type P = { a: number; d: number; s: number; size: number; pick: number; life: number };
    const parts: P[] = Array.from({ length: 260 }, () => ({ a: Math.random() * 6.283, d: Math.random(), s: 0.0007 + Math.random() * 0.002, size: 0.8 + Math.random() * 2.6, pick: Math.random(), life: Math.random() * 6.283 }));
    let raf = 0;
    let shown = 0;
    const draw = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const W = c.clientWidth, H = c.clientHeight;
      if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      const unit = Math.min(W, H) / 2 / 5.4; // pixels per metre
      shown += (state.current.radius - shown) * 0.07;
      const R = Math.max(0, shown) * unit;
      ctx.lineWidth = 1;
      ctx.font = "11px Manrope Variable, sans-serif";
      for (const m of [1, 2, 3, 4, 5]) {
        ctx.strokeStyle = "rgba(255,255,255,.09)";
        ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.arc(cx, cy, m * unit, 0, 6.283); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(200,191,209,.6)";
        ctx.fillText(`${m} m`, cx + m * unit * 0.72, cy - m * unit * 0.72);
      }
      const pal = state.current.palette;
      if (pal.length && R > 0) {
        const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, R);
        grad.addColorStop(0, pal[0].color + "88");
        grad.addColorStop(0.75, pal[Math.min(1, pal.length - 1)].color + "33");
        grad.addColorStop(1, pal[0].color + "00");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();
        for (const p of parts) {
          p.d += p.s; p.a += 0.0016 * Math.sin(p.life); p.life += 0.01;
          if (p.d > 1) { p.d = 0; p.a = Math.random() * 6.283; }
          let acc = 0; let color = pal[0].color;
          for (const x of pal) { acc += x.share; if (p.pick <= acc) { color = x.color; break; } }
          const rr = p.d * R;
          ctx.globalAlpha = Math.pow(1 - p.d, 0.55) * 0.95;
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(cx + Math.cos(p.a) * rr, cy + Math.sin(p.a) * rr, p.size, 0, 6.283); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // Wearer seen from above.
      ctx.fillStyle = "#fff6e6";
      ctx.beginPath(); ctx.ellipse(cx, cy, 15, 8, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = "#120d1a";
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 6.283); ctx.fill();
      if (visible) raf = reduce ? window.setTimeout(draw, 300) : requestAnimationFrame(draw);
    };
    // Off-screen, the aura costs nothing.
    let visible = false;
    const io = new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting;
      if (visible && !was) draw();
    });
    io.observe(c);
    return () => {
      visible = false;
      io.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(raf);
    };
  }, []);

  return (
    <figure className="viz-figure">
      <canvas ref={canvas} className="aura" role="img" aria-label={`Top-down view: scent reaches about ${metres.toFixed(1)} metres from the wearer at this hour.`} />
      <figcaption><b>{metres.toFixed(1)} m</b> scent trail at this hour, seen from above</figcaption>
    </figure>
  );
}

/** Side-on sound-wave style pulses leaving the wrist; their reach shows projection. */
export function ProjectionWaves({ sim, hour }: { sim: Simulation; hour: number }) {
  const cm = interp(sim, sim.projectionCm, hour);
  const W = 420, H = 220, X0 = 58, CM = (W - X0 - 20) / 120;
  const reach = cm * CM;
  const ry = Math.min(reach, H / 2 - 30);
  const label = cm > 70 ? "Noticed across a table" : cm > 35 ? "Noticed at conversation distance" : cm > 10 ? "Noticed in a close moment" : cm > 0 ? "A skin scent" : "Gone";
  return (
    <figure className="viz-figure">
      <svg viewBox={`0 0 ${W} ${H}`} className="waves" role="img" aria-label={`Projection about ${Math.round(cm)} centimetres. ${label}.`}>
        <defs>
          <radialGradient id="wv"><stop offset="0" stopColor="#e5b567" stopOpacity=".55" /><stop offset="1" stopColor="#e5b567" stopOpacity="0" /></radialGradient>
          <clipPath id="wvclip"><rect x={X0} y="0" width={W} height={H} /></clipPath>
        </defs>
        {[30, 60, 90, 120].map((v) => (
          <g key={v}>
            <line x1={X0 + v * CM} x2={X0 + v * CM} y1={22} y2={H - 26} stroke="#fff" strokeOpacity=".09" strokeDasharray="3 5" />
            <text x={X0 + v * CM} y={H - 8} fontSize="11" fill="#a99fb3" textAnchor="middle">{v} cm</text>
          </g>
        ))}
        <g clipPath="url(#wvclip)">
          <ellipse cx={X0} cy={H / 2 - 8} rx={Math.max(reach, 1)} ry={Math.max(ry, 1)} fill="url(#wv)" />
          {reach > 2 && [0, 1, 2, 3, 4].map((i) => (
            <ellipse key={i} cx={X0} cy={H / 2 - 8} rx={reach} ry={ry} fill="none" stroke="#e5b567" strokeWidth="1.4" className="wave" style={{ animationDelay: `${i * 0.6}s`, transformOrigin: `${X0}px ${H / 2 - 8}px` }} />
          ))}
        </g>
        <rect x="0" y={H / 2 - 22} width={X0 - 4} height="28" rx="14" fill="#e6d3c0" />
        <circle cx={X0} cy={H / 2 - 8} r="4" fill="#120d1a" stroke="#fff6e6" />
      </svg>
      <figcaption><b>{Math.round(cm)} cm</b> {label.toLowerCase()}</figcaption>
    </figure>
  );
}

export function facetsAt(sim: Simulation, hour: number): FacetVector {
  const out = Object.fromEntries(FACETS.map((f) => [f, 0])) as FacetVector;
  for (const s of scentAt(sim, hour)) {
    const n = NOTE_BY_ID.get(s.noteId);
    if (!n) continue;
    for (const f of FACETS) out[f] += n.facets[f] * s.share;
  }
  return out;
}

export function FacetRadar({ facets, size = 340 }: { facets: FacetVector; size?: number }) {
  const C = 170, R = 118;
  const max = Math.max(...Object.values(facets), 0.3);
  const pt = (i: number, v: number) => {
    const a = (i / FACETS.length) * 2 * Math.PI - Math.PI / 2;
    return [C + Math.cos(a) * R * v, C + Math.sin(a) * R * v] as const;
  };
  const shape = FACETS.map((f, i) => pt(i, facets[f] / max).join(",")).join(" ");
  return (
    <svg viewBox="0 0 340 340" width="100%" style={{ maxWidth: size }} role="img" aria-label={`Scent facets: ${FACETS.filter((f) => facets[f] / max > 0.5).join(", ")}`}>
      {[0.25, 0.5, 0.75, 1].map((r) => <polygon key={r} points={FACETS.map((_, i) => pt(i, r).join(",")).join(" ")} fill="none" stroke="#fff" strokeOpacity=".1" />)}
      <polygon points={shape} fill="#e5b56755" stroke="#e5b567" strokeWidth="2" style={{ transition: "all .4s" }} />
      {FACETS.map((f, i) => {
        const [x, y] = pt(i, 1.17);
        return (
          <g key={f}>
            <circle cx={pt(i, facets[f] / max)[0]} cy={pt(i, facets[f] / max)[1]} r="3.5" fill={facetColor(f)} />
            <text x={x} y={y} fontSize="11" fill="#c8bfd1" textAnchor="middle" dominantBaseline="middle">{f}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** How long each note stays perceptible. Bars fade toward the end of each note's life. */
export function NoteLifetimes({ sim, items, hour }: { sim: Simulation; items: FormulaItem[]; hour: number }) {
  const rows = items.filter((i) => NOTE_BY_ID.has(i.noteId)).map((i) => ({ id: i.noteId, life: sim.lastsFor[i.noteId] ?? 0 })).sort((a, b) => a.life - b.life);
  return (
    <div className="lifetimes">
      {rows.map(({ id, life }) => {
        const n = note(id);
        const alive = life > hour;
        const c = colorOf(id);
        return (
          <div key={id} className={`life-row${alive ? "" : " gone"}`}>
            <span className="life-name">{n.name}</span>
            <div className="life-track">
              <div className="life-bar" style={{ width: `${Math.max(0.5, Math.sqrt(Math.min(life, HOURS) / HOURS) * 100)}%`, background: `linear-gradient(90deg, ${c}, ${c}22)` }} />
              <div className="life-cursor" style={{ left: `${Math.sqrt(hour / HOURS) * 100}%` }} />
            </div>
            <span className="life-val">{life >= HOURS ? "24 h+" : fmtDuration(life)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Pyramid({ items }: { items: FormulaItem[] }) {
  const known = items.filter((i) => NOTE_BY_ID.has(i.noteId));
  const p = analyse(known).pyramid;
  const row = (pos: Position) => known.filter((i) => note(i.noteId).position === pos).sort((a, b) => b.parts - a.parts);
  const tiers: { pos: Position; label: string; w: number }[] = [
    { pos: "top", label: "Top", w: 44 }, { pos: "heart", label: "Heart", w: 72 }, { pos: "base", label: "Base", w: 100 },
  ];
  return (
    <div className="pyramid">
      {tiers.map((t) => (
        <div key={t.pos} className="tier" style={{ width: `${t.w}%` }}>
          <div className="tier-head"><b>{t.label}</b><span>{p[t.pos].toFixed(0)}%</span></div>
          <div className="tier-notes">{row(t.pos).map((i) => <span key={i.noteId}><i style={{ background: colorOf(i.noteId) }} />{note(i.noteId).name}</span>)}{!row(t.pos).length && <span className="muted">Empty</span>}</div>
        </div>
      ))}
    </div>
  );
}

export function ScoreRing({ value, label, size = 86 }: { value: number; label: string; size?: number }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <div className="ring">
      <svg viewBox="0 0 86 86" width={size} height={size} aria-hidden="true">
        <circle cx="43" cy="43" r={r} fill="none" stroke="#ffffff18" strokeWidth="6" />
        <circle cx="43" cy="43" r={r} fill="none" stroke="#e5b567" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 43 43)" style={{ transition: "stroke-dasharray .5s" }} />
        <text x="43" y="49" textAnchor="middle" fontSize="20" fill="#fff6e6" fontWeight="600">{value}</text>
      </svg>
      <span>{label}</span>
    </div>
  );
}

export function MetricBars({ note: n }: { note: { sillage: number; projection: number; longevity: number; strength: number } }) {
  const rows: [string, number][] = [["Sillage", n.sillage], ["Projection", n.projection], ["Longevity", n.longevity], ["Strength", n.strength]];
  return (
    <div className="metric-bars">
      {rows.map(([k, v]) => (
        <div key={k}><span>{k}</span><div className="bar"><div style={{ width: `${v * 10}%` }} /></div><b>{v.toFixed(v % 1 ? 1 : 0)}</b></div>
      ))}
    </div>
  );
}
