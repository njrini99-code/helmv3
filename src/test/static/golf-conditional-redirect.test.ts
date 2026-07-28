/**
 * Static guard: the golf dashboard pages that produced React #310 must not go
 * back to redirecting out of a role/session-conditional render branch.
 *
 * Evidence for the crash class (production `admin_events`, 34 events):
 * every #310 route was a route that calls `redirect()` during its RSC render.
 * The bare redirect shims — /hub, /my-standing, /my-development, /my-insights,
 * /players/[playerId] — stopped emitting #310 on 2026-07-22, the day
 * `next.config.mjs` `redirects()` began intercepting them before render. After
 * that date only the pages whose redirect is CONDITIONAL on the session kept
 * crashing (/stats, /coachhelm, /rounds/new, /qualifiers/new), because a
 * session-dependent redirect cannot be expressed in next.config.
 *
 * Those pages now render `<FeatureUnavailable>` in place instead — the pattern
 * /whats-new already adopted. This guard pins that: a bare `if (!session)`
 * auth bounce is still allowed (middleware normally handles it, and the branch
 * is not reachable from in-app navigation), but any other `redirect()` in these
 * files is the regression.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DASHBOARD = resolve(__dirname, '../../app/golf/(dashboard)/dashboard');

/**
 * Pages fixed for the #310 crash class. Adding a page here is a promise that
 * every non-auth role gate in it renders in place.
 */
const IN_PLACE_GATED_PAGES = [
  'stats/page.tsx',
  'coachhelm/page.tsx',
  'rounds/new/page.tsx',
  'rounds/recover/page.tsx',
  'qualifiers/new/page.tsx',
  'whats-new/page.tsx',
];

/** `if (!session) redirect('/golf/login')` — the one allowed bounce. */
const SESSION_BOUNCE = /if\s*\(!session\)\s*(?:return\s+)?redirect\(\s*['"]\/golf\/login['"]\s*\)/;

function codeLines(file: string): string[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    // Strip comment lines so the explanatory prose above each fix (which names
    // `redirect()` on purpose) cannot trip the scan.
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));
}

describe('golf dashboard conditional redirects (React #310 guard)', () => {
  for (const rel of IN_PLACE_GATED_PAGES) {
    it(`${rel} gates roles in place, not with redirect()`, () => {
      const offenders = codeLines(resolve(DASHBOARD, rel))
        .filter((line) => /\bredirect\(/.test(line))
        .filter((line) => !/\bpermanentRedirect\(/.test(line))
        .filter((line) => !SESSION_BOUNCE.test(line))
        .map((line) => line.trim());

      expect(offenders).toEqual([]);
    });

    it(`${rel} renders FeatureUnavailable or an in-place notice`, () => {
      const src = readFileSync(resolve(DASHBOARD, rel), 'utf8');
      expect(/FeatureUnavailable|NotPlayerState/.test(src)).toBe(true);
    });
  }
});
