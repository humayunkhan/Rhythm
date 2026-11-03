import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ACCORDS } from "../shared/data/catalog";
import { applyNoteOverrides } from "../shared/data/notes";
import { facetColor } from "../shared/engine/brand";
import type { DilutionMap } from "../shared/engine/dilution";
import { dominantFacets } from "../shared/engine/generate";
import type { Family, FormulaItem, Note } from "../shared/types";

export interface User { id: string; email: string; name: string; role: string; emailVerified: boolean; termsAccepted: boolean; taste: Record<string, number>; hasPassword: boolean; ownAi: boolean; disclaimerAck?: boolean; dilutions?: DilutionMap }
export interface Config { google: boolean; apple: boolean; mail: boolean; ai: boolean; userAi?: boolean }

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

/** The server gives the model 45 s before the engine answers, so the browser never needs to wait longer than this. */
export const AI_TIMEOUT_MS = 60000;

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
  let res: Response;
  // Every request gives up eventually, so a stalled server never leaves a page loading forever.
  // AI calls wait longer: the server gives the model up to 45 s before the engine answers.
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? (/^\/(ai\/|me\/ai\/test)/.test(path) ? AI_TIMEOUT_MS : 30000));
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
    });
  } catch (e) {
    if (opts.signal?.aborted) throw new ApiError("Cancelled.", 0, "aborted");
    if (timeout.aborted) throw new ApiError("The server took too long to answer. Check that Rhythm is running and try again.", 0, "timeout");
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

/** The signed-in user's stock dilutions. Notes without an entry use Rhythm's defaults. */
export function useDilutions(): DilutionMap {
  const { user } = useSession();
  const d = user?.dilutions;
  return useMemo(() => d ?? {}, [d]);
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
  /** Notes every dream must use, alongside the seeds. */
  require: string[];
  adventure: number;
  taste: Record<string, number>;
  steer: Record<string, number>;
  generation: number;
  items: FormulaItem[];
  concentration: "parfum" | "edp" | "edt" | "edc" | "mist" | "oil" | "solid";
  product: "fine" | "lip" | "body" | "rinse" | "candle";
  batchMl: number;
  ideas: string;
  branding: Branding;
  /** The concept the identity was started from; the other identity tabs fine-tune it. */
  conceptBase?: Branding;
  /** Earlier identity designs, newest first, so a concept switch can be undone. */
  brandHistory: BrandSnapshot[];
  /** Notes the previous dream generation used, so the next one moves on. */
  recent: string[];
  /** Mixed into every dream seed; a fresh dream picks a new one. */
  dreamSeed: number;
  /** Every change made between dream generations, oldest first; steer, taste and recent are folded from it. */
  dreamLog: DreamStep[];
  /** The taste profile before this draft's first like or dislike, so reactions can be undone. */
  tasteBase?: Record<string, number>;
  /** An admin's review copy of someone else's formula is never saved. */
  review?: boolean;
};
/** One change between dream generations. `gen` is the generation it produced. */
export type DreamStep = {
  id: string;
  gen: number;
  kind: "steer" | "like" | "dislike" | "again" | "clear" | "undo";
  label: string;
  steer?: Record<string, number>;
  /** The composition reacted to, for likes and dislikes. */
  candidateId?: string;
  items?: FormulaItem[];
  /** Notes "dream again" moved away from. */
  recent?: string[];
  /** What the change did to the generation, filled in once its compositions exist. */
  shift?: { deltas: { f: string; d: number }[]; fresh: string[]; dropped: number };
};
/** A design and the concept it was built on. */
export type BrandSnapshot = { design: Branding; base?: Branding };
export type Branding = { name: string; tagline: string; story: string; bottle: string; packaging: string; cap: string; finish: string; labelStyle: string; glass: string; accent: string; label: string; direction?: string };

export const newDraft = (): Draft => ({
  step: 0, seeds: [], strength: "moderate", mood: "elegant", season: "any", occasion: "any", expression: "any", avoid: [], require: [], adventure: 0.3,
  taste: {}, steer: {}, generation: 0, items: [], concentration: "edp", product: "fine", batchMl: 50, ideas: "", brandHistory: [], recent: [], dreamSeed: 0, dreamLog: [],
  branding: { name: "", tagline: "", story: "", bottle: "column", packaging: "matte", cap: "classic", finish: "clear", labelStyle: "plate", glass: "#d8a657", accent: "#f4e3bf", label: "#14101c" },
});

const DRAFT_KEY = "rhythm.draft.v1";
export function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return { ...newDraft(), ...d, branding: { ...newDraft().branding, ...d.branding }, brandHistory: Array.isArray(d.brandHistory) ? d.brandHistory.filter((h: { design?: unknown }) => h?.design) : [],
        dreamLog: Array.isArray(d.dreamLog) ? d.dreamLog : [], require: Array.isArray(d.require) ? d.require : [] };
    }
  } catch { /* Storage can be blocked; the wizard still works in memory. */ }
  return newDraft();
}
export function saveDraft(d: Draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* See loadDraft. */ }
}

/** The last step of the wizard; a draft that reached it is finished. */
export const FINISH_STEP = 6;
/** A draft the user has put real work into, worth keeping when they start another. */
export const hasWork = (d: Draft) => !d.review && (d.seeds.length > 0 || d.items.length > 0);
export const isUnfinished = (d: Draft) => hasWork(d) && d.step < FINISH_STEP;
export const draftLabel = (d: Draft) => d.branding.name.trim() || "Untitled draft";

// One unfinished draft set aside by "Create", so it can be resumed later.
const SHELF_KEY = "rhythm.shelved.v1";
export function loadShelved(): Draft | null {
  try {
    const raw = localStorage.getItem(SHELF_KEY);
    if (raw) { const d = JSON.parse(raw); return { ...newDraft(), ...d, branding: { ...newDraft().branding, ...d.branding } }; }
  } catch { /* See loadDraft. */ }
  return null;
}
export function saveShelved(d: Draft | null) {
  try { if (d) localStorage.setItem(SHELF_KEY, JSON.stringify(d)); else localStorage.removeItem(SHELF_KEY); } catch { /* See loadDraft. */ }
}
/** Router state for links that mean "start a new fragrance" or "resume the one set aside". */
export const CREATE_NEW = { create: "new" } as const;
export const CREATE_RESUME = { create: "resume" } as const;

export type Theme = "system" | "light" | "dark";
const THEME_KEY = "rhythm.theme";
export function readTheme(): Theme {
  try { const t = localStorage.getItem(THEME_KEY); if (t === "light" || t === "dark") return t; } catch { /* Storage can be blocked. */ }
  return "system";
}
/** Sets data-theme on the root so CSS tokens switch; "system" follows the device. */
export function applyTheme(t: Theme) {
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#120d1a" : "#faf6f0");
}
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    applyTheme(theme);
    try { if (theme === "system") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, theme); } catch { /* See readTheme. */ }
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);
  return [theme, setTheme];
}

/** Collapsible panels remember whether they were open. */
export function usePersistentToggle(key: string, initial = true): [boolean, (v: boolean) => void] {
  const k = `rhythm.open.${key}`;
  const [open, setOpen] = useState(() => {
    try { const v = localStorage.getItem(k); return v == null ? initial : v === "1"; } catch { return initial; }
  });
  const set = useCallback((v: boolean) => { setOpen(v); try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* Storage can be blocked. */ } }, [k]);
  return [open, set];
}

export const fmtDuration = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 10 ? `${h.toFixed(1)} h` : `${Math.round(h)} h`);
