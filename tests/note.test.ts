import { describe, expect, it } from 'vitest';
import {
  editText,
  fixedNotes,
  historyOf,
  lastEvent,
  markFixed,
  markNotFixed,
  markSent,
  openNotes,
  type Note,
} from '../utils/note';
import { buildPrompt } from '../utils/prompt';

let counter = 0;
function note(overrides: Partial<Note> = {}): Note {
  counter += 1;
  return {
    id: `n${counter}`,
    url: 'https://example.com/',
    viewport: { width: 1280, height: 800 },
    selector: '#title',
    tag: 'h1',
    text: 'Welcome',
    note: 'The title is too small.',
    screenshot: false,
    state: 'open',
    created: '2026-10-16T10:00:00.000Z',
    ...overrides,
  };
}

const T1 = '2026-10-16T11:00:00.000Z';
const T2 = '2026-10-17T09:00:00.000Z';
const T3 = '2026-10-18T09:00:00.000Z';

describe('the record of a note', () => {
  it('starts with the creation for a note saved before the record', () => {
    expect(historyOf(note())).toEqual([
      { type: 'created', at: '2026-10-16T10:00:00.000Z', text: 'The title is too small.' },
    ]);
  });

  it('records each prompt that a note went out in, and only for the notes in it', () => {
    const a = note();
    const b = note();
    const [sentA, sentB] = markSent(markSent([a, b], [a.id], T1), [a.id], T2);
    expect(historyOf(sentA!).map((e) => e.type)).toEqual(['created', 'sent', 'sent']);
    expect(lastEvent(sentA!, 'sent')).toBe(T2);
    expect(historyOf(sentB!).map((e) => e.type)).toEqual(['created']);
  });

  it('keeps a fixed note, with the date it was fixed', () => {
    const fixed = markFixed(markSent([note()], [], T1)[0]!, T2);
    expect(fixed.state).toBe('fixed');
    expect(lastEvent(fixed, 'fixed')).toBe(T2);
    expect(openNotes([fixed])).toEqual([]);
  });

  it('keeps the earlier and the new text of a note marked not fixed', () => {
    const n = markNotFixed(note({ note: 'Button overlaps' }), 'Still overlaps at 375 px', T2);
    expect(n.state).toBe('not-fixed');
    expect(n.previousNote).toBe('Button overlaps');
    expect(n.note).toBe('Still overlaps at 375 px');
    expect(historyOf(n).at(-1)).toEqual({ type: 'not-fixed', at: T2, text: 'Still overlaps at 375 px' });
  });

  it('asks again in the next prompt when a fixed problem comes back', () => {
    const back = markNotFixed(markFixed(note({ note: 'Logo blurry' }), T2), 'Blurry again on the phone', T3);
    expect(historyOf(back).map((e) => e.type)).toEqual(['created', 'fixed', 'not-fixed']);
    const prompt = buildPrompt([back]);
    expect(prompt).toContain('- Earlier note: Logo blurry');
    expect(prompt).toContain('- Still wrong: Blurry again on the phone');
  });

  it('records an edit only when the text changes', () => {
    const n = note();
    expect(editText(n, n.note, T1)).toBe(n);
    const edited = editText(n, 'The title is too small on the phone.', T1);
    expect(edited.note).toBe('The title is too small on the phone.');
    expect(historyOf(edited).at(-1)).toEqual({ type: 'edited', at: T1, text: 'The title is too small on the phone.' });
  });

  it('lists the fixed notes of one page, the last fixed first', () => {
    const early = markFixed(note({ note: 'early' }), T1);
    const late = markFixed(note({ note: 'late' }), T3);
    const other = markFixed(note({ url: 'https://example.com/other' }), T2);
    const open = note();
    expect(fixedNotes([early, open, other, late], 'https://example.com/').map((n) => n.note)).toEqual([
      'late',
      'early',
    ]);
  });
});
