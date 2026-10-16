import { describe, expect, it } from 'vitest';
import type { Note } from '../utils/note';
import { buildPrompt, codeSpan, PROMPT_INTRO } from '../utils/prompt';

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
    created: `2026-10-16T10:00:${String(counter).padStart(2, '0')}.000Z`,
    ...overrides,
  };
}

describe('buildPrompt', () => {
  it('is empty when no note is open', () => {
    expect(buildPrompt([])).toBe('');
    expect(buildPrompt([note({ state: 'fixed' })])).toBe('');
  });

  it('opens with the line that says what the list is', () => {
    expect(buildPrompt([note()]).split('\n')[0]).toBe(PROMPT_INTRO);
  });

  it('writes one entry with every field of the plan', () => {
    const n = note({ screenshot: true });
    const prompt = buildPrompt([n], { [n.id]: '/home/user/Downloads/annotatetofix/example.com/n.png' });
    expect(prompt).toBe(
      [
        PROMPT_INTRO,
        '',
        '## Page: https://example.com/',
        '',
        '### Note 1',
        '- Window: 1280 × 800',
        '- Element: `<h1>` found by `#title`, text "Welcome"',
        '- Problem: The title is too small.',
        '- Screenshot: /home/user/Downloads/annotatetofix/example.com/n.png',
        '',
      ].join('\n'),
    );
  });

  it('groups notes by page and numbers them per page in the order they were made', () => {
    const a = note({ url: 'https://example.com/a', note: 'first on a' });
    const b = note({ url: 'https://example.com/b', note: 'first on b' });
    const c = note({ url: 'https://example.com/a', note: 'second on a' });
    const prompt = buildPrompt([c, b, a]);
    expect(prompt.match(/## Page: /g)).toHaveLength(2);
    const pageA = prompt.indexOf('## Page: https://example.com/a');
    const pageB = prompt.indexOf('## Page: https://example.com/b');
    expect(pageA).toBeLessThan(pageB);
    const sectionA = prompt.slice(pageA, pageB);
    expect(sectionA.indexOf('first on a')).toBeLessThan(sectionA.indexOf('second on a'));
    expect(sectionA).toContain('### Note 2');
  });

  it('leaves out fixed notes and keeps the numbers in order', () => {
    const prompt = buildPrompt([note({ state: 'fixed', note: 'done' }), note({ note: 'still open' })]);
    expect(prompt).not.toContain('done');
    expect(prompt).toContain('### Note 1\n');
    expect(prompt).not.toContain('### Note 2');
  });

  it('gives the earlier text of a note marked not fixed', () => {
    const prompt = buildPrompt([
      note({ state: 'not-fixed', previousNote: 'Button overlaps', note: 'Still overlaps at 375 px' }),
    ]);
    expect(prompt).toContain('- Earlier note: Button overlaps');
    expect(prompt).toContain('- Still wrong: Still overlaps at 375 px');
    expect(prompt).not.toContain('- Problem:');
  });

  it('keeps a note with several lines inside its list item', () => {
    const prompt = buildPrompt([note({ note: 'Line one\nLine two' })]);
    expect(prompt).toContain('- Problem: Line one\n  Line two');
  });

  it('says when the element has no text, and names no screenshot that was not saved', () => {
    const n = note({ text: '', screenshot: true });
    const prompt = buildPrompt([n], {});
    expect(prompt).toContain(', no text');
    expect(prompt).not.toContain('Screenshot:');
  });
});

describe('codeSpan', () => {
  it('survives backticks in a selector', () => {
    expect(codeSpan('a')).toBe('`a`');
    expect(codeSpan('a`b')).toBe('``a`b``');
    expect(codeSpan('`a')).toBe('`` `a ``');
  });
});
