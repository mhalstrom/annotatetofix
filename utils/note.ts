// The data of one note. Notes live in storage.local under notesKey(origin);
// screenshot images live in the IndexedDB of the background script.

export type NoteState = 'open' | 'fixed' | 'not-fixed';

/** One step in the record of a note. */
export interface NoteEvent {
  type: 'created' | 'edited' | 'sent' | 'fixed' | 'not-fixed';
  /** ISO date and time. */
  at: string;
  /** For 'created', 'edited' and 'not-fixed': the text of the note after this step. */
  text?: string;
}

/** A box in CSS pixels. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What finds an element again: its selector, its tag, and the start of its text. */
export interface ElementRef {
  selector: string;
  tag: string;
  text: string;
}

/** The area of a note made by dragging a box; the note's element holds the whole box. */
export interface NoteArea {
  /** The box in page coordinates: CSS pixels from the top left of the page. */
  page: Box;
  /** The box relative to the top left of the note's element, to place it again when the page moves. */
  offset: Box;
  /** The main elements inside the box. */
  inside: ElementRef[];
}

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
  /** Every step of the note, oldest first. Notes saved before the record have none. */
  history?: NoteEvent[];
  /** Set for a note on a dragged area; selector, tag and text then name the element that holds it. */
  area?: NoteArea;
}

/** The record of a note; a note saved before the record starts with its creation. */
export function historyOf(note: Note): NoteEvent[] {
  return note.history ?? [{ type: 'created', at: note.created, text: note.note }];
}

function withEvent(note: Note, event: NoteEvent): Note {
  return { ...note, history: [...historyOf(note), event] };
}

/** A change of the text by hand; no step when the text stays the same. */
export function editText(note: Note, text: string, at: string): Note {
  if (text === note.note) return note;
  return withEvent({ ...note, note: text }, { type: 'edited', at, text });
}

/** Records that the notes with these ids went out in a prompt. */
export function markSent(notes: Note[], ids: string[], at: string): Note[] {
  const sent = new Set(ids);
  return notes.map((n) => (sent.has(n.id) ? withEvent(n, { type: 'sent', at }) : n));
}

export function markFixed(note: Note, at: string): Note {
  return withEvent({ ...note, state: 'fixed' }, { type: 'fixed', at });
}

/** The problem is still there, or came back: the next prompt asks again, with both texts. */
export function markNotFixed(note: Note, text: string, at: string): Note {
  return withEvent(
    { ...note, state: 'not-fixed', previousNote: note.note, note: text },
    { type: 'not-fixed', at, text },
  );
}

/** The time of the last step of this type, if any. */
export function lastEvent(note: Note, type: NoteEvent['type']): string | undefined {
  return historyOf(note).filter((e) => e.type === type).at(-1)?.at;
}

/** Fixed notes of a page, the last fixed first. */
export function fixedNotes(notes: Note[], url: string): Note[] {
  return notes
    .filter((n) => n.url === url && n.state === 'fixed')
    .sort((a, b) => (lastEvent(b, 'fixed') ?? '').localeCompare(lastEvent(a, 'fixed') ?? ''));
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
