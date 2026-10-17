// The site map: each page of a site with the date of its last fixed note, and
// the pages of the site's sitemap.xml that have no note as "never checked".

import { lastEvent, pageUrl, type Note } from './note';

/** The most nested sitemaps that a sitemap index may make the page read. */
export const NESTED_SITEMAPS_MAX = 10;

export interface SitemapXml {
  /** Page addresses of a <urlset>. */
  pages: string[];
  /** Addresses of nested sitemaps of a <sitemapindex>. */
  sitemaps: string[];
}

function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

/** Reads the <loc> addresses of a sitemap or a sitemap index. */
export function parseSitemap(xml: string): SitemapXml {
  const locs = Array.from(xml.matchAll(/<(?:[\w-]+:)?loc>([\s\S]*?)<\/(?:[\w-]+:)?loc>/g), (m) => decodeXml(m[1]!));
  const isIndex = /<(?:[\w-]+:)?sitemapindex[\s>]/.test(xml);
  return isIndex ? { pages: [], sitemaps: locs } : { pages: locs, sitemaps: [] };
}

export interface PageRow {
  url: string;
  /** ISO time of the last note marked fixed on the page. */
  lastFixed?: string;
  /** Notes that still need work. */
  open: number;
  /** Every note of the page, fixed ones too. */
  notes: number;
}

/** 0: no note ever; 1: notes, none fixed yet; 2: has a fixed note. Lower comes first. */
function rank(row: PageRow): number {
  if (row.lastFixed) return 2;
  return row.notes > 0 ? 1 : 0;
}

/**
 * One row for each page that has a note and each page of the sitemap on the
 * same origin. The pages checked longest ago come first: never checked, then
 * noted but nothing fixed yet, then the oldest fixed note.
 */
export function siteRows(origin: string, notes: Note[], sitemapPages: string[] = []): PageRow[] {
  const rows = new Map<string, PageRow>();
  const row = (url: string): PageRow => {
    let found = rows.get(url);
    if (!found) {
      found = { url, open: 0, notes: 0 };
      rows.set(url, found);
    }
    return found;
  };

  for (const note of notes) {
    const r = row(note.url);
    r.notes += 1;
    if (note.state !== 'fixed') r.open += 1;
    const fixed = lastEvent(note, 'fixed');
    if (fixed && (!r.lastFixed || fixed > r.lastFixed)) r.lastFixed = fixed;
  }
  for (const address of sitemapPages) {
    let url: string;
    try {
      url = pageUrl(address);
    } catch {
      continue;
    }
    if (new URL(url).origin === origin) row(url);
  }

  return Array.from(rows.values()).sort(
    (a, b) =>
      rank(a) - rank(b) || (a.lastFixed ?? '').localeCompare(b.lastFixed ?? '') || a.url.localeCompare(b.url),
  );
}

/** The origin of a match pattern such as https://example.com/*. */
export function patternOrigin(pattern: string): string | null {
  const match = /^(https?):\/\/([^/]+)\/\*$/.exec(pattern);
  return match ? `${match[1]}://${match[2]}` : null;
}
