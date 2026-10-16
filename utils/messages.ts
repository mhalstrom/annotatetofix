// Messages between the content script and the background script.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Request =
  /** Capture the visible tab, cut it to rect plus a margin, and keep it for noteId. */
  | { type: 'capture'; noteId: string; rect: Rect; viewportWidth: number }
  /** Save the kept screenshots as files; the reply maps each note id to its path. */
  | { type: 'save-shots'; host: string; noteIds: string[] }
  | { type: 'delete-shot'; noteId: string }
  /** Turn the add-on off for the site of the sending tab. */
  | { type: 'disable-site' };

export type Reply =
  | { ok: true; paths?: Record<string, string> }
  | { ok: false; error: string };

/** From the background script to the content script. */
export type ToContent = { type: 'toggle-panel' };

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
