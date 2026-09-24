/**
 * GolfHelm document titles carry exactly one brand suffix, added by the
 * `title.template` in src/app/golf/layout.tsx ('%s · GolfHelm').
 *
 * Before 2026-09-23 golf routes shipped five brand spellings (Helm Golf, Helm
 * Sports, GolfHelm, CoachHelm, Helm Sports Labs) and double suffixes such as
 * "Dashboard | GolfHelm | Helm Sports Labs". A golf page or layout now
 * declares a bare title ("Rounds"); this scan fails on any title that ends in
 * a brand suffix of its own.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const GOLF_DIR = join(process.cwd(), 'src/app/golf');

/**
 * Files other in-flight work still owns. Each still carries a suffix that the
 * owning change strips; remove the entry when it does. Do not add new ones.
 */
const PENDING = new Set<string>([
  'src/app/golf/(dashboard)/dashboard/roster/page.tsx',
  'src/app/golf/(dashboard)/dashboard/intelligence/page.tsx',
  'src/app/golf/(dashboard)/dashboard/players/[playerId]/game/page.tsx',
  'src/app/golf/(dashboard)/dashboard/players/[playerId]/genome/page.tsx',
  'src/app/golf/(dashboard)/dashboard/coachhelm/genome/compare/page.tsx',
  'src/app/golf/(dashboard)/dashboard/stats/team/page.tsx',
]);

/** A `title` whose string literal ends with a separator + brand. */
const SUFFIXED_TITLE =
  /title:[^\n]*?(?:\||·)\s*(?:Helm Golf|Helm Sports Labs|Helm Sports|GolfHelm|CoachHelm)\s*['"`]/g;

function routeFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') routeFiles(full, acc);
    } else if (entry.name === 'page.tsx' || entry.name === 'layout.tsx') {
      acc.push(full);
    }
  }
  return acc;
}

describe('golf document titles', () => {
  it('the golf layout owns the single GolfHelm suffix', () => {
    const layout = readFileSync(join(GOLF_DIR, 'layout.tsx'), 'utf8');
    expect(layout).toMatch(/template:\s*'%s · GolfHelm'/);
  });

  it('no golf page or layout adds its own brand suffix', () => {
    const files = routeFiles(GOLF_DIR);
    expect(files.length).toBeGreaterThan(30);
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(process.cwd(), file);
      if (PENDING.has(rel)) continue;
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(SUFFIXED_TITLE)) {
        if (/openGraph|twitter/.test(m[0])) continue;
        offenders.push(`${rel}: ${m[0].trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
