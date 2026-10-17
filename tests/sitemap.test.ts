import { describe, expect, it } from 'vitest';
import { markFixed, type Note } from '../utils/note';
import { parseSitemap, patternOrigin, siteRows } from '../utils/sitemap';

let counter = 0;
function note(url: string, overrides: Partial<Note> = {}): Note {
  counter += 1;
  return {
    id: `n${counter}`,
    url,
    viewport: { width: 1280, height: 800 },
    selector: '#title',
    tag: 'h1',
    text: 'Welcome',
    note: 'A problem.',
    screenshot: false,
    state: 'open',
    created: '2026-10-16T10:00:00.000Z',
    ...overrides,
  };
}

const SITE = 'https://example.com';

describe('parseSitemap', () => {
  it('reads the pages of a urlset, with entities and CDATA', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/</loc><lastmod>2026-10-01</lastmod></url>
        <url><loc> https://example.com/search?a=1&amp;b=2 </loc></url>
        <url><loc><![CDATA[https://example.com/about]]></loc></url>
      </urlset>`;
    expect(parseSitemap(xml)).toEqual({
      pages: ['https://example.com/', 'https://example.com/search?a=1&b=2', 'https://example.com/about'],
      sitemaps: [],
    });
  });

  it('reads the nested sitemaps of a sitemap index', () => {
    const xml = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://example.com/posts.xml</loc></sitemap>
        <sitemap><loc>https://example.com/pages.xml</loc></sitemap>
      </sitemapindex>`;
    expect(parseSitemap(xml)).toEqual({
      pages: [],
      sitemaps: ['https://example.com/posts.xml', 'https://example.com/pages.xml'],
    });
  });

  it('reads a sitemap with a namespace prefix', () => {
    expect(parseSitemap('<s:urlset><s:url><s:loc>https://example.com/x</s:loc></s:url></s:urlset>').pages).toEqual([
      'https://example.com/x',
    ]);
  });
});

describe('siteRows', () => {
  it('puts the pages checked longest ago first', () => {
    const rows = siteRows(
      SITE,
      [
        markFixed(note(`${SITE}/recent`), '2026-10-15T09:00:00.000Z'),
        markFixed(note(`${SITE}/old`), '2026-10-01T09:00:00.000Z'),
        note(`${SITE}/noted`),
      ],
      [`${SITE}/never`, `${SITE}/old`],
    );
    expect(rows.map((r) => r.url)).toEqual([`${SITE}/never`, `${SITE}/noted`, `${SITE}/old`, `${SITE}/recent`]);
    expect(rows[0]).toEqual({ url: `${SITE}/never`, open: 0, notes: 0 });
  });

  it('gives each page the date of its last fixed note and its counts', () => {
    const [row] = siteRows(SITE, [
      markFixed(note(`${SITE}/a`), '2026-10-02T09:00:00.000Z'),
      markFixed(note(`${SITE}/a`), '2026-10-09T09:00:00.000Z'),
      note(`${SITE}/a`),
    ]);
    expect(row).toEqual({ url: `${SITE}/a`, lastFixed: '2026-10-09T09:00:00.000Z', open: 1, notes: 3 });
  });

  it('keeps only the sitemap pages of the same site, without the hash', () => {
    const rows = siteRows(SITE, [], [`${SITE}/a#top`, 'https://other.com/b', 'not a url', `${SITE}/a`]);
    expect(rows.map((r) => r.url)).toEqual([`${SITE}/a`]);
  });
});

describe('patternOrigin', () => {
  it('turns a match pattern into an origin', () => {
    expect(patternOrigin('https://example.com/*')).toBe('https://example.com');
    expect(patternOrigin('<all_urls>')).toBeNull();
  });
});
