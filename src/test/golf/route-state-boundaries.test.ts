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
  'src/app/golf/(dashboard)/dashboard/hub',
  'src/app/golf/(dashboard)/dashboard/patterns',
  'src/app/golf/(dashboard)/dashboard/my-insights',
  'src/app/golf/(dashboard)/dashboard/players/[playerId]',
  'src/app/golf/(dashboard)/dashboard/coachhelm/genome/[playerId]',
  // Catch-all that only calls notFound() so unknown dashboard URLs get the
  // dashboard's own not-found page (DASH-13); it never renders UI of its own.
  'src/app/golf/(dashboard)/dashboard/[...missing]',
]);

/** Real pages still without a page-shaped loading.tsx (STATE-X1 debt; shrink only). */
const LOADING_DEBT = new Set([
  'src/app/golf/admin/demo-sessions',
  'src/app/golf/(onboarding)/coach/pending',
  'src/app/golf/staff/join/[token]',
  'src/app/golf/(dashboard)/dashboard/dev/haptics',
]);

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

  it('every non-redirect segment has its own loading.tsx, apart from the listed debt', () => {
    const missing = SEGMENTS.filter(
      (s) => !REDIRECT_ONLY.has(s) && !LOADING_DEBT.has(s) && !existsSync(resolve(ROOT, s, 'loading.tsx')),
    );
    expect(missing).toEqual([]);
  });

  it('the exemption lists hold no stale entries', () => {
    for (const s of REDIRECT_ONLY) {
      const page = resolve(ROOT, s, 'page.tsx');
      expect(existsSync(page), `${s} no longer exists; drop it from REDIRECT_ONLY`).toBe(true);
      expect(readFileSync(page, 'utf8'), `${s} is listed as redirect-only`).toMatch(/\b(permanentRedirect|redirect|notFound)\(/);
    }
    for (const s of LOADING_DEBT) {
      expect(existsSync(resolve(ROOT, s, 'page.tsx')), `${s} no longer exists; drop it from LOADING_DEBT`).toBe(true);
      expect(existsSync(resolve(ROOT, s, 'loading.tsx')), `${s} now has loading.tsx; drop it from LOADING_DEBT`).toBe(
        false,
      );
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
