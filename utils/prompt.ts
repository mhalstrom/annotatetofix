// Builds the Markdown prompt for a coding agent from the open notes of a site.

import { openNotes, type ElementRef, type Note } from './note';

export const PROMPT_INTRO =
  "These are problems that the site owner found on these pages. Fix each one in the site's code.";

/** A code span that survives backticks inside the value. */
export function codeSpan(value: string): string {
  const longest = Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  const pad = value.startsWith('`') || value.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${value}${pad}${fence}`;
}

function round(value: number): number {
  return Math.round(value);
}

/** An element as the agent finds it: tag, selector and the start of its text. */
function describe(ref: ElementRef): string {
  return `${codeSpan(`<${ref.tag}>`)} found by ${codeSpan(ref.selector)}` + (ref.text ? `, text "${ref.text}"` : ', no text');
}

/** Puts a text with several lines under a list item. */
function indented(text: string): string {
  return text.trim().replace(/\r?\n/g, '\n  ');
}

/** Numbers the open notes of each page in the order they were made, as the markers do. */
export function numberByPage(notes: Note[]): Map<string, { note: Note; number: number }[]> {
  const pages = new Map<string, { note: Note; number: number }[]>();
  for (const note of openNotes(notes)) {
    const list = pages.get(note.url) ?? [];
    list.push({ note, number: list.length + 1 });
    pages.set(note.url, list);
  }
  return pages;
}

/**
 * One section for each page and one entry for each open note.
 * shotPaths maps a note id to the path of its saved screenshot file.
 */
export function buildPrompt(notes: Note[], shotPaths: Record<string, string> = {}): string {
  const pages = numberByPage(notes);
  if (pages.size === 0) return '';

  const lines: string[] = [PROMPT_INTRO];
  for (const [url, entries] of pages) {
    lines.push('', `## Page: ${url}`);
    for (const { note, number } of entries) {
      lines.push('', `### Note ${number}`, `- Window: ${note.viewport.width} × ${note.viewport.height}`);
      if (note.area) {
        const { page, inside } = note.area;
        lines.push(
          `- Area: ${round(page.width)} × ${round(page.height)} px at x ${round(page.x)}, y ${round(page.y)} of the page`,
          `- Inside: ${describe(note)}`,
        );
        if (inside.length > 0) lines.push(`- In the area: ${inside.map(describe).join('; ')}`);
      } else {
        lines.push(`- Element: ${describe(note)}`);
      }
      if (note.state === 'not-fixed' && note.previousNote) {
        lines.push(`- Earlier note: ${indented(note.previousNote)}`);
        lines.push(`- Still wrong: ${indented(note.note)}`);
      } else {
        lines.push(`- Problem: ${indented(note.note)}`);
      }
      const shot = shotPaths[note.id];
      if (shot) lines.push(`- Screenshot: ${shot}`);
    }
  }
  return lines.join('\n') + '\n';
}
