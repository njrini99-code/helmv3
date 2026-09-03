/**
 * e2e/sentry-snapshots-baseball.spec.ts — Sentry Snapshots capture:
 * BaseballHelm coach + player screens.
 *
 * Other half of the Sentry Snapshots CI capture (see
 * docs/observability/SENTRY_SNAPSHOTS.md; the public + golf half lives in
 * e2e/sentry-snapshots.spec.ts). Runs under the `baseball-coach` /
 * `baseball-player` Playwright projects (see playwright.config.ts) — same
 * proven auth mechanism e2e/visual-audit.spec.ts and
 * e2e/baseball-route-crawler.spec.ts use: the `setup` project logs each role
 * in once via the real login form and persists storageState, and this spec
 * only consumes it via the project's `use.storageState`, same as those two.
 * This spec's filename was added to those two projects' `testMatch` and to
 * the default `chromium` project's `testIgnore` in playwright.config.ts,
 * mirroring exactly how visual-audit.spec.ts is wired there.
 *
 * GATED behind SENTRY_SNAPSHOTS=1 (test.skip otherwise), mirroring
 * VISUAL_AUDIT=1 in e2e/visual-audit.spec.ts.
 *
 * Route list is a fixed table, not a crawl — Sentry diffs by filename, so
 * the set of images must be stable across runs (see
 * e2e/fixtures/sentry-snapshot-helpers.ts header). Every route below is one
 * baseball-smoke.spec.ts / visual-audit.spec.ts already exercises for the
 * matching role, so reachability is proven, not assumed:
 *   - coach entry route /baseball/dashboard/command-center is
 *     visual-audit.spec.ts's own coach entry point.
 *   - player entry route /baseball/player/today is visual-audit.spec.ts's
 *     own player entry point.
 *
 * STRICTLY READ-ONLY: every test only navigates and screenshots.
 */
import { test } from '@playwright/test';
import { VIEWPORTS, settleAndCapture } from './fixtures/sentry-snapshot-helpers';

const GATE_SKIP_REASON = 'Gated behind SENTRY_SNAPSHOTS=1 — see sentry-snapshots.yml';

const COACH_ROUTES: Array<{ route: string; name: string }> = [
  { route: '/baseball/dashboard/command-center', name: 'baseball-coach-command-center' },
  { route: '/baseball/dashboard/roster', name: 'baseball-coach-roster' },
  { route: '/baseball/dashboard/stats', name: 'baseball-coach-stats' },
  { route: '/baseball/dashboard/calendar', name: 'baseball-coach-calendar' },
];

const PLAYER_ROUTES: Array<{ route: string; name: string }> = [
  { route: '/baseball/player/today', name: 'baseball-player-today' },
  { route: '/baseball/player/passport', name: 'baseball-player-passport' },
  { route: '/baseball/player/timeline', name: 'baseball-player-timeline' },
];

test.describe('Sentry Snapshots — baseball coach', { tag: '@coach' }, () => {
  for (const { route, name } of COACH_ROUTES) {
    for (const viewport of VIEWPORTS) {
      test(`${name} — ${viewport.name}`, async ({ page }) => {
        test.skip(process.env.SENTRY_SNAPSHOTS !== '1', GATE_SKIP_REASON);
        const result = await settleAndCapture(page, route, name, viewport);
        if (!result.captured) {
          console.warn(`sentry-snapshots: ${name} (${viewport.name}) not captured: ${result.error}`);
        }
      });
    }
  }
});

test.describe('Sentry Snapshots — baseball player', { tag: '@player' }, () => {
  for (const { route, name } of PLAYER_ROUTES) {
    for (const viewport of VIEWPORTS) {
      test(`${name} — ${viewport.name}`, async ({ page }) => {
        test.skip(process.env.SENTRY_SNAPSHOTS !== '1', GATE_SKIP_REASON);
        const result = await settleAndCapture(page, route, name, viewport);
        if (!result.captured) {
          console.warn(`sentry-snapshots: ${name} (${viewport.name}) not captured: ${result.error}`);
        }
      });
    }
  }
});
