// Finds a short selector for an element, and finds the element again later.

const TEST_ATTRIBUTES = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa'];
const TEXT_LENGTH = 80;

export function cssEscape(value: string): string {
  const native = (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS?.escape;
  if (native) return native(value);
  if (value === '-') return '\\-';
  let out = '';
  for (const [i, ch] of Array.from(value).entries()) {
    const leadingDigit = /\d/.test(ch) && (i === 0 || (i === 1 && value[0] === '-'));
    if (leadingDigit) out += `\\3${ch} `;
    else if (/[a-zA-Z0-9_-]/.test(ch) || ch.charCodeAt(0) >= 0x80) out += ch;
    else out += `\\${ch}`;
  }
  return out;
}

function quoteAttribute(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Ids that a framework makes up change between builds, so they make bad selectors. */
export function looksGenerated(id: string): boolean {
  return /\d{4,}/.test(id) || id.startsWith(':') || /^(radix|headlessui|mui|ember|react)[-_]/i.test(id);
}

function isUnique(doc: Document, selector: string, el: Element): boolean {
  try {
    const found = doc.querySelectorAll(selector);
    return found.length === 1 && found[0] === el;
  } catch {
    return false;
  }
}

/** The text that identifies an element for a person and for a later search. */
export function elementText(el: Element): string {
  const html = el as HTMLElement;
  let text = '';
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    text = el.value || el.placeholder;
  } else if (el instanceof HTMLImageElement) {
    text = el.alt;
  } else {
    text = (typeof html.innerText === 'string' ? html.innerText : '') || el.textContent || '';
  }
  if (!text.trim()) text = el.getAttribute('aria-label') || el.getAttribute('title') || '';
  return text.replace(/\s+/g, ' ').trim().slice(0, TEXT_LENGTH);
}

/**
 * An id or a test attribute when the element has a unique one, else the
 * shortest path of tags (with :nth-of-type where needed) that is unique.
 */
export function getSelector(el: Element): string {
  const doc = el.ownerDocument;

  if (el.id && !looksGenerated(el.id)) {
    const byId = `#${cssEscape(el.id)}`;
    if (isUnique(doc, byId, el)) return byId;
  }
  for (const name of TEST_ATTRIBUTES) {
    const value = el.getAttribute(name);
    if (!value) continue;
    const byAttribute = `[${name}=${quoteAttribute(value)}]`;
    if (isUnique(doc, byAttribute, el)) return byAttribute;
  }

  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== doc.documentElement) {
    if (current !== el && current.id && !looksGenerated(current.id)) {
      const anchor = `#${cssEscape(current.id)}`;
      if (isUnique(doc, anchor, current)) {
        parts.unshift(anchor);
        const path = parts.join(' > ');
        if (isUnique(doc, path, el)) return path;
        parts.shift();
      }
    }
    let part = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (parent) {
      const tag = current.tagName;
      const same = Array.from(parent.children).filter((c) => c.tagName === tag);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    const path = parts.join(' > ');
    if (isUnique(doc, path, el)) return path;
    current = parent;
  }
  return parts.join(' > ');
}

export type FoundBy = 'selector' | 'text' | 'selector-text-changed' | 'missing';

/**
 * Finds the element of a note. The selector comes first; when it finds no
 * element, or an element with other text, the stored text decides.
 */
export function findElement(
  doc: Document,
  target: { selector: string; tag: string; text: string },
): { el: Element | null; foundBy: FoundBy } {
  let bySelector: Element | null = null;
  try {
    bySelector = doc.querySelector(target.selector);
  } catch {
    bySelector = null;
  }
  if (bySelector && (!target.text || elementText(bySelector) === target.text)) {
    return { el: bySelector, foundBy: 'selector' };
  }
  if (target.text) {
    const candidates = Array.from(doc.getElementsByTagName(target.tag));
    const match = candidates.find((c) => elementText(c) === target.text);
    if (match) return { el: match, foundBy: 'text' };
  }
  if (bySelector) return { el: bySelector, foundBy: 'selector-text-changed' };
  return { el: null, foundBy: 'missing' };
}
