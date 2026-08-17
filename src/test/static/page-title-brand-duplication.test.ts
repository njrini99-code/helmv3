/**
 * `src/app/layout.tsx` declares:
 *
 *     title: { default: 'Helm Sports Labs', template: '%s | Helm Sports Labs' }
 *
 * so every NESTED route already gets the brand appended. A page whose own title
 * also contains it renders the brand twice.
 *
 * Measured against production 2026-08-17 — six of eight marketing pages:
 *
 *   /about     About — Helm Sports Labs | Helm Sports Labs
 *   /products  Helm Sports Labs — Products | Helm Sports Labs
 *   /pricing   Pricing — Helm Sports Labs | Helm Sports Labs
 *   /support   Support | Helm Sports Labs | Helm Sports Labs
 *   /privacy   Privacy Policy | Helm Sports Labs | Helm Sports Labs
 *   /terms     Terms of Service | Helm Sports Labs | Helm Sports Labs
 *
 * That is what shows in a browser tab, a bookmark, and a Google result — on
 * exactly the pages a coach evaluating the product reads first.
 *
 * TWO PAGES ARE LEGITIMATELY EXEMPT, and both are why this is a scan rather
 * than a blanket ban:
 *
 *   - `src/app/page.tsx` is the ROOT segment's own page. Next.js does not apply
 *     a layout's `title.template` to the segment that declares it, so `/`
 *     renders "Helm Sports Labs — College Golf Intelligence" once. Excluded.
 *   - `openGraph.title` / `twitter.title` do NOT go through the template, so
 *     they SHOULD carry the brand. They are nested deeper in the metadata
 *     object, so the two-space indent below distinguishes the top-level
 *     `title:` from them. Verified against every current call site.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const APP_DIR = join(process.cwd(), 'src/app');
const BRAND = 'Helm Sports Labs';

/** The root segment's own page — the template does not apply to it. */
const EXEMPT = [join(APP_DIR, 'page.tsx')];

function allPageFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) allPageFiles(full, acc);
    else if (entry.name === 'page.tsx') acc.push(full);
  }
  return acc;
}

/**
 * Top-level `title:` lines inside a metadata object — two-space indent.
 * `openGraph`/`twitter` titles sit at four or more and are excluded on purpose.
 */
const TOP_LEVEL_TITLE = /^ {2}title: *['"`]([^'"`]*)['"`]/gm;

describe('page <title> brand duplication', () => {
  it('finds the app directory and some pages (guards the fixture)', () => {
    expect(existsSync(APP_DIR)).toBe(true);
    expect(allPageFiles(APP_DIR).length).toBeGreaterThan(20);
  });

  it('never repeats the brand a layout template already appends', () => {
    const offenders: string[] = [];

    for (const file of allPageFiles(APP_DIR)) {
      if (EXEMPT.includes(file)) continue;
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(TOP_LEVEL_TITLE)) {
        const title = m[1] ?? '';
        if (title.includes(BRAND)) {
          offenders.push(`${file.slice(file.indexOf('src/app'))}  ->  "${title}"`);
        }
      }
    }

    expect(
      offenders,
      `these render as "<title> | ${BRAND}" because src/app/layout.tsx already `
        + `appends the brand via title.template — drop it from the page title`,
    ).toEqual([]);
  });
});
