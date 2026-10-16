import { beforeEach, describe, expect, it } from 'vitest';
import { cssEscape, elementText, findElement, getSelector, looksGenerated } from '../utils/selector';

function page(html: string): void {
  document.body.innerHTML = html;
}

function el(selector: string): Element {
  const found = document.querySelector(selector);
  if (!found) throw new Error(`no element for ${selector}`);
  return found;
}

describe('getSelector', () => {
  beforeEach(() => page(''));

  it('uses a unique id', () => {
    page('<main><h1 id="title">Hello</h1></main>');
    expect(getSelector(el('h1'))).toBe('#title');
  });

  it('escapes an id that is not a plain name', () => {
    page('<p id="price.total">1</p>');
    const selector = getSelector(el('p'));
    expect(document.querySelector(selector)).toBe(el('p'));
  });

  it('skips an id that a framework made up', () => {
    page('<div><button id=":r12:">Go</button></div>');
    expect(getSelector(el('button'))).not.toContain(':r12:');
  });

  it('uses a test attribute when there is no id', () => {
    page('<button data-testid="buy">Buy</button><button>Other</button>');
    expect(getSelector(el('button'))).toBe('[data-testid="buy"]');
  });

  it('builds a short path with nth-of-type when needed', () => {
    page('<ul><li>One</li><li>Two</li><li>Three</li></ul>');
    const second = document.querySelectorAll('li')[1]!;
    const selector = getSelector(second);
    expect(selector).toBe('li:nth-of-type(2)');
    expect(document.querySelector(selector)).toBe(second);
  });

  it('anchors the path on the nearest ancestor with an id', () => {
    page(
      '<section id="team"><div><p>A</p><p>B</p></div></section>' +
        '<section><div><p>A</p><p>B</p></div></section>',
    );
    const target = el('#team p:nth-of-type(2)');
    const selector = getSelector(target);
    expect(selector.startsWith('#team')).toBe(true);
    expect(document.querySelectorAll(selector)).toHaveLength(1);
    expect(document.querySelector(selector)).toBe(target);
  });

  it('always finds the same element again', () => {
    page(
      '<header><nav><a>Home</a><a>Docs</a></nav></header>' +
        '<main><article><h2>Post</h2><p>Text <a>link</a></p></article>' +
        '<article><h2>Post 2</h2><p>Text <a>link</a></p></article></main>',
    );
    for (const element of Array.from(document.body.querySelectorAll('*'))) {
      expect(document.querySelector(getSelector(element))).toBe(element);
    }
  });
});

describe('elementText', () => {
  it('collapses white space and cuts long text', () => {
    page(`<p>  Hello\n   world  ${'x'.repeat(200)}</p>`);
    const text = elementText(el('p'));
    expect(text.startsWith('Hello world x')).toBe(true);
    expect(text.length).toBe(80);
  });

  it('uses the placeholder of an empty input and the alt of an image', () => {
    page('<input placeholder="Your email"><img alt="Logo" src="x.png">');
    expect(elementText(el('input'))).toBe('Your email');
    expect(elementText(el('img'))).toBe('Logo');
  });

  it('falls back to aria-label', () => {
    page('<button aria-label="Close"></button>');
    expect(elementText(el('button'))).toBe('Close');
  });
});

describe('findElement', () => {
  it('finds the element by its selector', () => {
    page('<h1 id="title">Hello</h1>');
    const result = findElement(document, { selector: '#title', tag: 'h1', text: 'Hello' });
    expect(result.foundBy).toBe('selector');
    expect(result.el).toBe(el('h1'));
  });

  it('finds the element by its text when the selector breaks', () => {
    page('<div><h2>Intro</h2><h2>Pricing</h2></div>');
    const result = findElement(document, { selector: '#gone', tag: 'h2', text: 'Pricing' });
    expect(result.foundBy).toBe('text');
    expect(result.el?.textContent).toBe('Pricing');
  });

  it('prefers the text when the selector now points at another element', () => {
    page('<ul><li>New first</li><li>Contact</li></ul>');
    const result = findElement(document, { selector: 'li:nth-of-type(1)', tag: 'li', text: 'Contact' });
    expect(result.foundBy).toBe('text');
    expect(result.el?.textContent).toBe('Contact');
  });

  it('keeps the selector match when the text changed', () => {
    page('<h1 id="title">New title</h1>');
    const result = findElement(document, { selector: '#title', tag: 'h1', text: 'Old title' });
    expect(result.foundBy).toBe('selector-text-changed');
  });

  it('says when the element is gone', () => {
    page('<p>Other</p>');
    const result = findElement(document, { selector: '#title', tag: 'h1', text: 'Hello' });
    expect(result).toEqual({ el: null, foundBy: 'missing' });
  });
});

describe('helpers', () => {
  it('marks made-up ids', () => {
    expect(looksGenerated('radix-12')).toBe(true);
    expect(looksGenerated('item-482913')).toBe(true);
    expect(looksGenerated('main-nav')).toBe(false);
  });

  it('escapes a leading digit', () => {
    expect(cssEscape('1a')).toMatch(/^\\31 ?a$/);
  });
});
