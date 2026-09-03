/**
 * e2e/sentry-snapshots.spec.ts — Sentry Snapshots capture: public pages +
 * GolfHelm player screens.
 *
 * Half of the Sentry Snapshots CI capture (see
 * docs/observability/SENTRY_SNAPSHOTS.md); the baseball half lives in
 * e2e/sentry-snapshots-baseball.spec.ts because those routes need the
 * `baseball-coach` / `baseball-player` projects' storageState (see
 * playwright.config.ts), while this file's routes don't — public pages need
 * no auth, and golf player auth is self-contained via `golfPlayerTest`
 * (e2e/fixtures/golf-auth.ts), same pattern e2e/appstore-screenshots.spec.ts
 * already uses. STANDALONE like that file: not wired into any project's
 * testMatch, runs fine under the default `chromium` project via an explicit
 * file argument, and is added to chromium's testIgnore below so it never
 * shows up (even as a no-op skip) in the ordinary e2e lane.
 *
 * GATED behind SENTRY_SNAPSHOTS=1 (test.skip otherwise), mirroring
 * VISUAL_AUDIT=1 in e2e/visual-audit.spec.ts — this must never run in the
 * normal e2e lane or the cheap PR a11y smoke.
 *
 * There is currently no coach-role golf credential in CI (GOLFHELM_COACH_*
 * is not a GitHub secret; only E2E_GOLF_* / GOLFHELM_PLAYER_* are), so golf
 * coach-only surfaces (roster, the coach Intelligence home) are NOT captured
 * here — see docs/observability/SENTRY_SNAPSHOTS.md "OWNER ACTION" for what
 * adding them needs. Every route below was verified reachable for the
 * PLAYER role by reading its role branch, not assumed:
 *   - /golf/dashboard, /golf/dashboard/rounds, /golf/dashboard/stats,
 *     /golf/dashboard/qualifiers, /golf/dashboard/coachhelm,
 *     /golf/dashboard/calendar — all six are exactly the route list
 *     e2e/appstore-screenshots.spec.ts already ships screenshots for under
 *     the player fixture; qualifiers and coachhelm explicitly serve both
 *     roles off a session-role branch (see that file's per-test comments).
 *   - dashboard/roster and dashboard/intelligence import
 *     `loadCoachIntents` / coach-analytics loaders and are coach-facing;
 *     dashboard/my-standing, my-qualifiers, my-game-profile, my-insights,
 *     insights are legacy redirects onto /golf/dashboard/coachhelm, so
 *     capturing them separately would just re-shoot that same page.
 *
 * STRICTLY READ-ONLY: every test only navigates and screenshots.
 */
import { test } from '@playwright/test';
import { golfPlayerTest, hasGolfPlayerAuth } from './fixtures/golf-auth';
import { VIEWPORTS, settleAndCapture } from './fixtures/sentry-snapshot-helpers';

const GATE_SKIP_REASON = 'Gated behind SENTRY_SNAPSHOTS=1 — see sentry-snapshots.yml';

test.describe('Sentry Snapshots — public pages', () => {
  test.beforeEach(() => {
    test.skip(process.env.SENTRY_SNAPSHOTS !== '1', GATE_SKIP_REASON);
  });

  const PUBLIC_ROUTES: Array<{ route: string; name: string }> = [
    { route: '/golf/login', name: 'public-golf-login' },
    { route: '/baseball/login', name: 'public-baseball-login' },
  ];

  for (const { route, name } of PUBLIC_ROUTES) {
    for (const viewport of VIEWPORTS) {
      test(`${name} — ${viewport.name}`, async ({ page }) => {
        const result = await settleAndCapture(page, route, name, viewport);
        if (!result.captured) {
          // Data capture, not an assertion (see sentry-snapshot-helpers.ts
          // header) — log and move on rather than failing this advisory job
          // over one route.
          console.warn(`sentry-snapshots: ${name} (${viewport.name}) not captured: ${result.error}`);
        }
      });
    }
  }
});

test.describe('Sentry Snapshots — golf player', () => {
  golfPlayerTest.skip(!hasGolfPlayerAuth, 'Set GOLFHELM_PLAYER_* or E2E_GOLF_* credentials to run.');
  golfPlayerTest.beforeEach(() => {
    golfPlayerTest.skip(process.env.SENTRY_SNAPSHOTS !== '1', GATE_SKIP_REASON);
  });

  const GOLF_PLAYER_ROUTES: Array<{ route: string; name: string }> = [
    { route: '/golf/dashboard', name: 'golf-player-dashboard' },
    { route: '/golf/dashboard/rounds', name: 'golf-player-rounds' },
    { route: '/golf/dashboard/stats', name: 'golf-player-stats' },
    { route: '/golf/dashboard/qualifiers', name: 'golf-player-qualifiers' },
    { route: '/golf/dashboard/coachhelm', name: 'golf-player-coachhelm' },
    { route: '/golf/dashboard/calendar', name: 'golf-player-calendar' },
  ];

  for (const { route, name } of GOLF_PLAYER_ROUTES) {
    for (const viewport of VIEWPORTS) {
      golfPlayerTest(`${name} — ${viewport.name}`, async ({ page }) => {
        const result = await settleAndCapture(page, route, name, viewport);
        if (!result.captured) {
          console.warn(`sentry-snapshots: ${name} (${viewport.name}) not captured: ${result.error}`);
        }
      });
    }
  }
});
