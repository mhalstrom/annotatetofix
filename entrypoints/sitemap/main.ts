// The site map page: one list for each site that has notes or that the add-on
// is on for. The address may name one site after '#'; that site comes first.

import { notesKey, type Note } from '@/utils/note';
import { NESTED_SITEMAPS_MAX, parseSitemap, patternOrigin, siteRows, type PageRow } from '@/utils/sitemap';

const SITES_KEY = 'sites';
const NOTES_PREFIX = notesKey('');

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  Object.assign(el, props);
  el.append(...children);
  return el;
}

function when(at: string): string {
  return new Date(at).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

/** The pages of a site's /sitemap.xml, following a sitemap index one level down. */
async function sitemapPages(origin: string): Promise<string[]> {
  const top = parseSitemap(await fetchText(`${origin}/sitemap.xml`));
  const pages = [...top.pages];
  for (const nested of top.sitemaps.slice(0, NESTED_SITEMAPS_MAX)) {
    try {
      pages.push(...parseSitemap(await fetchText(nested)).pages);
    } catch {
      // One nested sitemap that fails leaves the others.
    }
  }
  return pages;
}

function table(rows: PageRow[]): HTMLTableElement {
  const body = h('tbody');
  for (const row of rows) {
    const path = row.url.replace(/^https?:\/\/[^/]+/, '') || '/';
    const last = row.lastFixed
      ? h('td', { className: 'when' }, when(row.lastFixed))
      : row.notes > 0
        ? h('td', { className: 'when muted' }, 'nothing fixed yet')
        : h('td', { className: 'when never' }, 'never checked');
    body.append(
      h(
        'tr',
        {},
        h('td', { className: 'page' }, h('a', { href: row.url, target: '_blank', rel: 'noopener' }, path)),
        last,
        h('td', { className: 'num' }, row.open ? String(row.open) : ''),
      ),
    );
  }
  return h(
    'table',
    {},
    h(
      'thead',
      {},
      h('tr', {}, h('th', {}, 'Page'), h('th', {}, 'Last fixed note'), h('th', { className: 'num' }, 'Open notes')),
    ),
    body,
  );
}

async function renderSite(origin: string, notes: Note[]): Promise<HTMLElement> {
  const section = h('section', {}, h('h2', {}, new URL(origin).host));
  const info = h('p', { className: 'info' }, 'Reading sitemap.xml…');
  section.append(info);
  let pages: string[] = [];
  try {
    pages = await sitemapPages(origin);
    info.textContent = `sitemap.xml lists ${pages.length} page${pages.length === 1 ? '' : 's'}.`;
  } catch (e) {
    info.textContent = `No sitemap.xml could be read (${e instanceof Error ? e.message : String(e)}), so the list holds only the pages with notes.`;
  }
  const rows = siteRows(origin, notes, pages);
  section.append(rows.length ? table(rows) : h('p', { className: 'info' }, 'No pages yet.'));
  return section;
}

async function main(): Promise<void> {
  const container = document.getElementById('sites')!;
  const stored = await browser.storage.local.get(null);
  const notesBySite = new Map<string, Note[]>();
  for (const [key, value] of Object.entries(stored)) {
    if (key.startsWith(NOTES_PREFIX)) notesBySite.set(key.slice(NOTES_PREFIX.length), (value as Note[]) ?? []);
  }
  for (const pattern of (stored[SITES_KEY] as string[] | undefined) ?? []) {
    const origin = patternOrigin(pattern);
    if (origin && !notesBySite.has(origin)) notesBySite.set(origin, []);
  }

  const first = decodeURIComponent(location.hash.slice(1));
  const origins = Array.from(notesBySite.keys()).sort((a, b) =>
    a === first ? -1 : b === first ? 1 : new URL(a).host.localeCompare(new URL(b).host),
  );
  if (origins.length === 0) {
    container.append(h('p', { className: 'info' }, 'No site yet. Turn the add-on on for a site and add a note.'));
    return;
  }
  // Each site reads its sitemap at the same time; the sections keep their order.
  const sections = await Promise.all(origins.map((origin) => renderSite(origin, notesBySite.get(origin)!)));
  container.append(...sections);
}

void main();
