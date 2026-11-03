import { useId } from "react";
import { hashString, mulberry32 } from "../../shared/engine/rng";
import { mixColors } from "../../shared/engine/brand";
import type { Family } from "../../shared/types";

/** Deterministic generative illustrations, so catalogue pages need no image downloads. */
export function NoteArt({ seed, color, family, size = 120 }: { seed: string; color: string; family: Family; size?: number }) {
  const uid = useId().replace(/:/g, "");
  const rng = mulberry32(hashString(seed));
  const petals = family.includes("floral") ? 7 + Math.floor(rng() * 6) : family === "citrus" ? 10 : 0;
  const shapes = [];
  if (petals) {
    const len = 26 + rng() * 10;
    for (let i = 0; i < petals; i++) {
      const a = (360 / petals) * i;
      shapes.push(family === "citrus"
        ? <path key={i} d="M50 50 L44 18 Q50 12 56 18 Z" fill={color} opacity={0.75} transform={`rotate(${a} 50 50)`} />
        : <ellipse key={i} cx="50" cy={50 - len / 1.6} rx={6 + rng() * 5} ry={len / 1.5} fill={color} opacity={0.5 + rng() * 0.3} transform={`rotate(${a} 50 50)`} />);
    }
  } else if (family === "woody" || family === "amber") {
    for (let r = 8; r < 44; r += 5 + rng() * 3) shapes.push(<circle key={r} cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth={0.8 + rng() * 1.4} opacity={0.75} strokeDasharray={family === "amber" ? `${2 + rng() * 8} ${rng() * 5}` : undefined} />);
  } else if (family === "aquatic" || family === "gourmand") {
    for (let i = 0; i < 6; i++) {
      const y = 22 + i * 11;
      const amp = 4 + rng() * 7;
      shapes.push(<path key={i} d={`M8 ${y} Q 29 ${y - amp} 50 ${y} T 92 ${y}`} fill="none" stroke={color} strokeWidth={2} opacity={0.4 + i * 0.09} />);
    }
  } else if (family === "green" || family === "aromatic") {
    const count = 6 + Math.floor(rng() * 4);
    for (let i = 0; i < count; i++) {
      const a = -70 + (140 / (count - 1)) * i;
      shapes.push(<path key={i} d="M50 88 C 38 62 42 34 50 12 C 58 34 62 62 50 88 Z" fill={color} opacity={0.42} transform={`rotate(${a} 50 88)`} />);
    }
  } else {
    for (let i = 0; i < 16; i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * 36;
      shapes.push(<circle key={i} cx={50 + Math.cos(a) * d} cy={50 + Math.sin(a) * d} r={3 + rng() * 9} fill={color} opacity={0.2 + rng() * 0.5} />);
    }
  }
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="art" role="img" aria-label={`Generative art for ${seed}`}>
      <defs>
        <radialGradient id={`g${uid}`}><stop offset="0" stopColor={color} stopOpacity="0.55" /><stop offset="1" stopColor="#120d1a" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="100" height="100" fill="#1a1424" />
      <circle cx="50" cy="50" r="50" fill={`url(#g${uid})`} />
      {shapes}
      <circle cx="50" cy="50" r="4" fill="#fff6e6" opacity="0.8" />
    </svg>
  );
}

export function AccordArt({ seed, colors, height = 180 }: { seed: string; colors: [string, number][]; height?: number }) {
  const uid = useId().replace(/:/g, "");
  const rng = mulberry32(hashString(seed));
  const total = colors.reduce((s, [, w]) => s + w, 0) || 1;
  // Each material becomes drifting blooms sized by its share, so no two accords compose alike.
  const bands = colors.slice().sort((a, b) => b[1] - a[1]).flatMap(([c, w], i) =>
    [0, 1].map((k) => {
      const r = 22 + (w / total) * 170 * (k ? 0.55 : 1);
      const rx = r * (0.8 + rng() * 1.1);
      return <ellipse key={`${i}-${k}`} cx={rng() * 400} cy={rng() * 240} rx={rx} ry={r * (0.55 + rng() * 0.6)} fill={c} opacity={0.5 + rng() * 0.3} transform={`rotate(${rng() * 180 - 90} 200 120)`} />;
    }));
  return (
    <svg viewBox="0 0 400 240" width="100%" height={height} preserveAspectRatio="xMidYMid slice" className="art" role="img" aria-label={`Generative art for the ${seed} accord`}>
      <defs><filter id={`b${uid}`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16" /></filter></defs>
      <rect width="400" height="240" fill={mixColors(colors.map(([c, w]) => [c, w]))} opacity="0.25" />
      <rect className="art-shade" width="400" height="240" fill="#120d1a" opacity="0.6" />
      <g filter={`url(#b${uid})`} style={{ mixBlendMode: "screen" }}>{bands}</g>
    </svg>
  );
}
