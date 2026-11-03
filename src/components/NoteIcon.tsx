import type { Note } from "../../shared/types";
import { noteIcon, noteIconFilter } from "../icons";

/** A note's picture, recoloured where it needs to be. Decorative: the note's name is always beside it. */
export function NoteIcon({ n, big, className = "" }: { n: Pick<Note, "id" | "family">; big?: boolean; className?: string }) {
  const filter = noteIconFilter(n);
  return <span className={`note-icon${big ? " big" : ""}${className ? ` ${className}` : ""}`} aria-hidden="true"><span style={filter ? { filter } : undefined}>{noteIcon(n)}</span></span>;
}
