// The data of one note. Notes live in storage.local under notesKey(origin);
// screenshot images live in the IndexedDB of the background script.

export type NoteState = 'open' | 'fixed' | 'not-fixed';

export interface Note {
  id: string;
  /** Page address without the hash. */
  url: string;
  viewport: { width: number; height: number };
  /** A CSS selector that finds the element. */
  selector: string;
  /** Lower-case tag name of the element. */
  tag: string;
  /** The start of the element's text, to find it again when the selector breaks. */
  text: string;
  note: string;
  screenshot: boolean;
  state: NoteState;
  /** ISO date and time. */
  created: string;
  /** For a note marked not fixed: the text it had before. */
  previousNote?: string;
}

export function notesKey(origin: string): string {
  return `notes:${origin}`;
}

/** The page address that notes are stored and shown under: no hash. */
export function pageUrl(href: string): string {
  const url = new URL(href);
  url.hash = '';
  return url.href;
}

/** Notes that still need work, in the order they were made. */
export function openNotes(notes: Note[]): Note[] {
  return notes
    .filter((n) => n.state !== 'fixed')
    .sort((a, b) => a.created.localeCompare(b.created));
}

/** A folder name for the screenshots of a site, safe on every file system. */
export function siteFolder(host: string): string {
  return host.replace(/[^a-zA-Z0-9.-]/g, '_') || 'site';
}

export function newId(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${time}-${rand}`;
}
