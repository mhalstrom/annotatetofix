// A note on an area: the box that the user drags, the smallest element that
// holds the whole box, and the main elements inside the box.

import type { Box, ElementRef } from './note';
import { elementText, getSelector } from './selector';

/** The most elements that an area names. */
export const INSIDE_MAX = 6;
/** A press that moves less than this many CSS pixels is a click, not a drag. */
export const DRAG_MIN = 6;

/** Gives the box of an element in the same coordinates as the area box. */
export type RectOf = (el: Element) => Box;

export function boxFromPoints(x1: number, y1: number, x2: number, y2: number): Box {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

export function isDrag(x1: number, y1: number, x2: number, y2: number): boolean {
  return Math.abs(x2 - x1) >= DRAG_MIN || Math.abs(y2 - y1) >= DRAG_MIN;
}

function holds(outer: Box, inner: Box): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.width >= inner.x + inner.width &&
    outer.y + outer.height >= inner.y + inner.height
  );
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function hasSize(box: Box): boolean {
  return box.width > 0 && box.height > 0;
}

/**
 * The smallest element that holds the whole box. Elements for which skip says
 * yes (the add-on's own UI) are left out. The body is the answer when nothing
 * smaller holds the box.
 */
export function containerOf(doc: Document, box: Box, rectOf: RectOf, skip: (el: Element) => boolean = () => false): Element {
  let best: Element = doc.body ?? doc.documentElement;
  let bestSize = Infinity;
  for (const el of Array.from(doc.body?.querySelectorAll('*') ?? [])) {
    if (skip(el)) continue;
    const rect = rectOf(el);
    if (!hasSize(rect) || !holds(rect, box)) continue;
    const size = rect.width * rect.height;
    // On a tie the later element wins: in document order it is the descendant.
    if (size <= bestSize) {
      best = el;
      bestSize = size;
    }
  }
  return best;
}

/**
 * The main elements inside the box: the outermost descendants of the
 * container that lie wholly in the box. When none does, the children of the
 * container that the box touches.
 */
export function elementsInside(container: Element, box: Box, rectOf: RectOf, max = INSIDE_MAX): Element[] {
  const inside: Element[] = [];
  const walk = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      if (inside.length >= max) return;
      const rect = rectOf(child);
      if (hasSize(rect) && holds(box, rect)) inside.push(child);
      else if (!hasSize(rect) || overlaps(box, rect)) walk(child);
    }
  };
  walk(container);
  if (inside.length > 0) return inside;
  return Array.from(container.children)
    .filter((child) => {
      const rect = rectOf(child);
      return hasSize(rect) && overlaps(box, rect);
    })
    .slice(0, max);
}

export function elementRef(el: Element): ElementRef {
  return { selector: getSelector(el), tag: el.tagName.toLowerCase(), text: elementText(el) };
}

/** The box relative to the top left of the container, so that it follows the container when the page moves. */
export function offsetIn(container: Box, box: Box): Box {
  return { x: box.x - container.x, y: box.y - container.y, width: box.width, height: box.height };
}

/** The box again from the container's box and the stored offset. */
export function placeIn(container: Box, offset: Box): Box {
  return { x: container.x + offset.x, y: container.y + offset.y, width: offset.width, height: offset.height };
}
