import { beforeEach, describe, expect, it } from 'vitest';
import { boxFromPoints, containerOf, elementsInside, isDrag, offsetIn, placeIn, type RectOf } from '../utils/area';
import type { Box, Note } from '../utils/note';
import { buildPrompt } from '../utils/prompt';

// happy-dom has no layout, so each test gives the boxes of its elements by id.
let boxes: Record<string, Box> = {};
const rectOf: RectOf = (el) => boxes[el.id] ?? { x: 0, y: 0, width: 0, height: 0 };

function page(html: string, layout: Record<string, Box>): void {
  document.body.innerHTML = html;
  boxes = layout;
}

function box(x: number, y: number, width: number, height: number): Box {
  return { x, y, width, height };
}

const LAYOUT = {
  main: box(0, 0, 1000, 2000),
  pricing: box(0, 800, 1000, 400),
  title: box(100, 820, 300, 40),
  cards: box(100, 880, 800, 300),
  starter: box(100, 880, 380, 300),
  pro: box(520, 880, 380, 300),
  footer: box(0, 1800, 1000, 200),
};
const HTML = `
  <main id="main">
    <section id="pricing">
      <h2 id="title">Plans</h2>
      <div id="cards"><div id="starter">Starter</div><div id="pro">Pro</div></div>
    </section>
    <footer id="footer">Footer</footer>
  </main>`;

describe('a dragged box', () => {
  it('is the same box from any corner', () => {
    expect(boxFromPoints(300, 200, 100, 50)).toEqual(box(100, 50, 200, 150));
  });

  it('needs a few pixels of movement, else it is a click', () => {
    expect(isDrag(10, 10, 12, 13)).toBe(false);
    expect(isDrag(10, 10, 20, 10)).toBe(true);
  });

  it('follows its element when the page moves', () => {
    const offset = offsetIn(box(0, 800, 1000, 400), box(100, 850, 200, 100));
    expect(offset).toEqual(box(100, 50, 200, 100));
    expect(placeIn(box(0, 600, 1000, 400), offset)).toEqual(box(100, 650, 200, 100));
  });
});

describe('containerOf', () => {
  beforeEach(() => page(HTML, LAYOUT));

  it('finds the smallest element that holds the whole box', () => {
    // Over both cards: the cards row holds it, the section is larger.
    expect(containerOf(document, box(300, 900, 400, 100), rectOf).id).toBe('cards');
    // Over the title and the cards: only the section holds both.
    expect(containerOf(document, box(90, 810, 500, 200), rectOf).id).toBe('pricing');
  });

  it('takes the inner element when two have the same box', () => {
    page('<div id="outer"><div id="inner">x</div></div>', { outer: box(0, 0, 100, 100), inner: box(0, 0, 100, 100) });
    expect(containerOf(document, box(10, 10, 20, 20), rectOf).id).toBe('inner');
  });

  it('leaves out the elements that skip names', () => {
    expect(containerOf(document, box(300, 900, 400, 100), rectOf, (el) => el.id === 'cards').id).toBe('pricing');
  });

  it('falls back to the body', () => {
    expect(containerOf(document, box(-50, -50, 10, 10), rectOf)).toBe(document.body);
  });
});

describe('elementsInside', () => {
  beforeEach(() => page(HTML, LAYOUT));

  it('names the outermost elements that lie wholly in the box', () => {
    const section = document.getElementById('pricing')!;
    const inside = elementsInside(section, box(90, 810, 820, 380), rectOf).map((el) => el.id);
    expect(inside).toEqual(['title', 'cards']);
  });

  it('goes deeper when a large element is only partly in the box', () => {
    const section = document.getElementById('pricing')!;
    const inside = elementsInside(section, box(510, 870, 400, 320), rectOf).map((el) => el.id);
    expect(inside).toEqual(['pro']);
  });

  it('names the touched children when no element lies wholly in the box', () => {
    const cards = document.getElementById('cards')!;
    const inside = elementsInside(cards, box(450, 900, 100, 50), rectOf).map((el) => el.id);
    expect(inside).toEqual(['starter', 'pro']);
  });

  it('stops at the limit', () => {
    const section = document.getElementById('pricing')!;
    expect(elementsInside(section, box(90, 810, 820, 380), rectOf, 1)).toHaveLength(1);
  });
});

describe('the prompt of an area note', () => {
  it('names the area, its size, the element that holds it and the elements in it', () => {
    const note: Note = {
      id: 'a1',
      url: 'https://example.com/',
      viewport: { width: 1280, height: 800 },
      selector: '#pricing',
      tag: 'section',
      text: 'Plans Starter Pro',
      note: 'The gap between the cards is too wide.',
      screenshot: false,
      state: 'open',
      created: '2026-10-16T10:00:00.000Z',
      area: {
        page: box(300.4, 900.6, 400, 100.2),
        offset: box(300, 100, 400, 100),
        inside: [
          { selector: '#starter', tag: 'div', text: 'Starter' },
          { selector: '#pro', tag: 'div', text: 'Pro' },
        ],
      },
    };
    const prompt = buildPrompt([note]);
    expect(prompt).toContain('- Area: 400 × 100 px at x 300, y 901 of the page\n');
    expect(prompt).toContain('- Inside: `<section>` found by `#pricing`, text "Plans Starter Pro"\n');
    expect(prompt).toContain(
      '- In the area: `<div>` found by `#starter`, text "Starter"; `<div>` found by `#pro`, text "Pro"\n',
    );
    expect(prompt).not.toContain('- Element:');
  });
});
