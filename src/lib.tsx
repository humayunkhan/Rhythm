import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ACCORDS } from "../shared/data/catalog";
import { applyNoteOverrides } from "../shared/data/notes";
import { facetColor } from "../shared/engine/brand";
import { dominantFacets } from "../shared/engine/generate";
import type { Family, FormulaItem, Note } from "../shared/types";

export interface User { id: string; email: string; name: string; role: string; emailVerified: boolean; termsAccepted: boolean; taste: Record<string, number>; hasPassword: boolean }
export interface Config { google: boolean; apple: boolean; mail: boolean; ai: boolean }

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError("Rhythm can't reach the server. Check your connection and try again.", 0);
  }
  const data: any = (res.headers.get("content-type") ?? "").includes("json") ? await res.json() : null;
  if (!res.ok) throw new ApiError(data?.error ?? "Something went wrong. Please try again.", res.status, data?.code);
  return data as T;
}

interface Session { user: User | null; config: Config; ready: boolean; setUser: (u: User | null) => void; refresh: () => Promise<void> }
const SessionContext = createContext<Session>(null as never);
export const useSession = () => useContext(SessionContext);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<Config>({ google: false, apple: false, mail: false, ai: false });
  const refresh = useCallback(async () => {
    const me = await api<{ user: User | null }>("/auth/me").catch(() => ({ user: null }));
    setUser(me.user);
  }, []);
  useEffect(() => {
    Promise.all([
      refresh(),
      api<Config>("/config").then(setConfig).catch(() => {}),
      api<{ notes: Note[]; accords: typeof ACCORDS }>("/catalog/overrides").then((o) => {
        applyNoteOverrides(o.notes);
        for (const a of o.accords) {
          const i = ACCORDS.findIndex((x) => x.id === a.id);
          if (i >= 0) ACCORDS[i] = a; else ACCORDS.push(a);
        }
      }).catch(() => {}),
    ]).finally(() => setReady(true));
  }, [refresh]);
  return <SessionContext.Provider value={{ user, config, ready, setUser, refresh }}>{children}</SessionContext.Provider>;
}

export const FAMILY_META: Record<Family, { label: string; color: string }> = {
  citrus: { label: "Citrus", color: "#f4d35e" },
  aromatic: { label: "Aromatic", color: "#9dc08b" },
  green: { label: "Green", color: "#6fae6a" },
  aquatic: { label: "Aquatic", color: "#6db7d9" },
  fruity: { label: "Fruity", color: "#ec7f7b" },
  floral: { label: "Floral", color: "#eda6c3" },
  "white-floral": { label: "White Floral", color: "#f3e6d8" },
  spicy: { label: "Spicy", color: "#d4693c" },
  gourmand: { label: "Gourmand", color: "#e8b77a" },
  woody: { label: "Woody", color: "#a87748" },
  amber: { label: "Amber", color: "#d48a2e" },
  animalic: { label: "Musk & Leather", color: "#a78f99" },
};

export const noteColor = (n: Note) => {
  const top = dominantFacets(n.facets, 1)[0];
  return n.family === "white-floral" || n.family === "floral" ? FAMILY_META[n.family].color : facetColor(top);
};

export type Draft = {
  id?: string;
  step: number;
  seeds: string[];
  strength: "mild" | "moderate" | "bold";
  mood: "gentle" | "refreshing" | "romantic" | "sensual" | "mysterious" | "uplifting" | "cozy" | "elegant";
  season: "any" | "spring" | "summer" | "autumn" | "winter";
  occasion: "any" | "daily" | "work" | "evening" | "special";
  expression: "any" | "feminine" | "masculine" | "shared";
  avoid: string[];
  adventure: number;
  taste: Record<string, number>;
  steer: Record<string, number>;
  generation: number;
  items: FormulaItem[];
  concentration: "parfum" | "edp" | "edt" | "edc" | "mist" | "oil" | "solid";
  product: "fine" | "lip" | "body" | "rinse" | "candle";
  batchMl: number;
  ideas: string;
  branding: { name: string; tagline: string; story: string; bottle: string; packaging: string; glass: string; accent: string; label: string };
};

export const newDraft = (): Draft => ({
  step: 0, seeds: [], strength: "moderate", mood: "elegant", season: "any", occasion: "any", expression: "any", avoid: [], adventure: 0.3,
  taste: {}, steer: {}, generation: 0, items: [], concentration: "edp", product: "fine", batchMl: 50, ideas: "",
  branding: { name: "", tagline: "", story: "", bottle: "column", packaging: "matte", glass: "#d8a657", accent: "#f4e3bf", label: "#14101c" },
});

const DRAFT_KEY = "rhythm.draft.v1";
export function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return { ...newDraft(), ...JSON.parse(raw) };
  } catch { /* Storage can be blocked; the wizard still works in memory. */ }
  return newDraft();
}
export function saveDraft(d: Draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* See loadDraft. */ }
}

export const fmtDuration = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 10 ? `${h.toFixed(1)} h` : `${Math.round(h)} h`);
