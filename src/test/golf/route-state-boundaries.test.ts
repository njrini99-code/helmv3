/**
 * Every golf route segment owns its error and loading states
 * (design-direction §4.6 and Phase 5; ledger STATE-X1).
 *
 * A segment without its own `error.tsx` falls through to an ancestor boundary
 * that names the wrong page and offers the wrong way home; a segment without
 * its own `loading.tsx` shows the parent's skeleton, shaped for a different
 * page. New segments must ship both.
 *
 * Redirect-only segments render nothing, so they need neither. The loading
 * list below is known debt and may only SHRINK: each entry needs a skeleton
 * shaped like its page (§4.6: no spinners on content), not a generic one.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../..');
const GOLF_APP = resolve(ROOT, 'src/app/golf');

/** Pages whose only job is to redirect. */
const REDIRECT_ONLY = new Set([
  // (The hub, patterns, alerts, insights, my-*, development, analytics/coachhelm,
  // players/[playerId] and coachhelm/genome/[playerId] shim pages were deleted
  // in plan phase 7b; next.config.mjs redirects() serves those URLs now.)
  // Catch-all that only calls notFound() so unknown dashboard URLs get the
  // dashboard's own not-found page (DASH-13); it never renders UI of its own.
  'src/app/golf/(dashboard)/dashboard/[...missing]',
]);

/**
 * Old addresses whose layout sends each role on to its Clubhouse screen (`redirectToClubhouse`,
 * src/clubhouse/routes/alias.ts) and whose page draws nothing (Fairway retired, 2026-11-14). They need a page so the
 * layout runs; they show no content of their own, so the dashboard's loading covers the hop. Each keeps its error.tsx.
 */
const ALIASED = new Set([
  'src/app/golf/(dashboard)/dashboard/coachhelm/chat',
  'src/app/golf/(dashboard)/dashboard/coachhelm/genome/compare',
  'src/app/golf/(dashboard)/dashboard/coachhelm/qualifying/[id]',
  'src/app/golf/(dashboard)/dashboard/courses',
  'src/app/golf/(dashboard)/dashboard/intelligence',
  'src/app/golf/(dashboard)/dashboard/players/[playerId]/game',
  'src/app/golf/(dashboard)/dashboard/players/[playerId]/game/print',
  'src/app/golf/(dashboard)/dashboard/players/[playerId]/genome',
  'src/app/golf/(dashboard)/dashboard/roster/[id]',
  'src/app/golf/(dashboard)/dashboard/team',
]);

/** The segment's own layout, or one above it inside the dashboard, sends the request on. */
function redirectingLayout(segment: string): boolean {
  for (let dir = segment; dir.startsWith('src/app/golf/(dashboard)/dashboard'); dir = dirname(dir)) {
    const layout = resolve(ROOT, dir, 'layout.tsx');
    if (existsSync(layout) && /\bredirectToClubhouse\(/.test(readFileSync(layout, 'utf8'))) return true;
  }
  return false;
}

function pageDirs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) pageDirs(p, out);
    else if (name === 'page.tsx') out.push(dirname(p));
  }
  return out;
}

const SEGMENTS = pageDirs(GOLF_APP)
  .map((abs) => relative(ROOT, abs).split('\\').join('/'))
  .sort();

describe('golf route segments own their error and loading states (STATE-X1)', () => {
  it('finds the golf pages', () => {
    expect(SEGMENTS.length).toBeGreaterThan(50);
  });

  it('every non-redirect segment has its own error.tsx', () => {
    const missing = SEGMENTS.filter((s) => !REDIRECT_ONLY.has(s) && !existsSync(resolve(ROOT, s, 'error.tsx')));
    expect(missing).toEqual([]);
  });

  it('every non-redirect segment has its own loading.tsx', () => {
    const missing = SEGMENTS.filter(
      (s) => !REDIRECT_ONLY.has(s) && !ALIASED.has(s) && !existsSync(resolve(ROOT, s, 'loading.tsx')),
    );
    expect(missing).toEqual([]);
  });

  it('the exemption lists hold no stale entries', () => {
    for (const s of REDIRECT_ONLY) {
      const page = resolve(ROOT, s, 'page.tsx');
      expect(existsSync(page), `${s} no longer exists; drop it from REDIRECT_ONLY`).toBe(true);
      expect(readFileSync(page, 'utf8'), `${s} is listed as redirect-only`).toMatch(/\b(permanentRedirect|redirect|notFound)\(/);
    }
    for (const s of ALIASED) {
      const page = resolve(ROOT, s, 'page.tsx');
      expect(existsSync(page), `${s} no longer exists; drop it from ALIASED`).toBe(true);
      expect(readFileSync(page, 'utf8'), `${s} is listed as aliased, so its page draws nothing`).toMatch(/\breturn null;/);
      expect(redirectingLayout(s), `${s} is listed as aliased, so a layout over it calls redirectToClubhouse`).toBe(true);
    }
  });

  it('every error.tsx is a client component (Next requires it)', () => {
    const bad = SEGMENTS.map((s) => resolve(ROOT, s, 'error.tsx'))
      .filter((f) => existsSync(f))
      .filter((f) => !/^\s*['"]use client['"]/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f));
    expect(bad).toEqual([]);
  });
});
