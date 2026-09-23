import fs from 'node:fs';
import path from 'node:path';
import { expect } from '@playwright/test';
import { golfPlayerTest as test, hasGolfPlayerAuth, requireGolfAuthOrSkip } from './fixtures/golf-auth';

/**
 * e2e/appstore-screenshots.spec.ts — App Store screenshot capture for the
 * v2.0 (build 9) submission (plan §68 "APP STORE SCREENSHOTS" story; see
 * docs/plans/IOS_PREMIUM_NATIVE_UPDATE_2026-08-25.md and
 * docs/audits/IOS_PREMIUM_NATIVE_AUDIT_2026-08-25.md). Existing package:
 * ios/appstore/SUBMISSION.md §10 — that doc's screenshots predate this
 * rebuild and its 5-shot recommendation; this spec captures the current
 * 6-shot story instead: dashboard, rounds (active-round surface), stats,
 * qualifiers, CoachHelm, calendar.
 *
 * STRICTLY READ-ONLY. Every test only navigates and screenshots — nothing
 * here clicks a submit/send/start/resume control or otherwise mutates state.
 * This runs against PLAYWRIGHT_BASE_URL, which for tonight's capture run is
 * production, so that boundary is load-bearing, not decorative:
 *   - The "active round" shot (#2) deliberately does NOT resume an
 *     in-progress round even if a resume/continue affordance is present on
 *     /golf/dashboard/rounds — it screenshots that library page itself
 *     (stats cards included), per the task's explicit instruction.
 *   - No form is filled or submitted, no qualifier/round/message is created.
 *
 * STANDALONE: this file is not wired into any playwright.config.ts project.
 * It reuses the existing golfPlayerTest worker fixture (e2e/fixtures/
 * golf-auth.ts) for auth and self-skips via hasGolfPlayerAuth exactly like
 * e2e/golf-dashboard.spec.ts, so it runs fine under the default `chromium`
 * project (no testMatch/testIgnore entry references it, and none was added —
 * chromium's testIgnore only excludes specs that must NOT also run there).
 *
 * SIZING: Apple's iPhone 6.9" screenshot spec is exactly 1320x2868px. Rather
 * than emulate a named device (whose CSS viewport doesn't multiply out to
 * that exact pixel size at a whole deviceScaleFactor), this sets an explicit
 * viewport of 440x956 at deviceScaleFactor 3 — 440*3=1320, 956*3=2868 exactly
 * — plus isMobile/hasTouch so the app renders its mobile (not desktop) layout.
 *
 * STABILITY: Playwright's `networkidle` is unreliable against this app (long-
 * poll/streaming connections never quiesce), so each test instead waits for a
 * page-specific, visually-real content landmark (never the page's bare <h1>
 * alone where a more specific loaded-content signal exists) plus a fixed
 * settle delay, before capturing — the "network-idle-ish" proxy the task
 * asked for. Nothing is hidden/masked; each shot is the real, current UI.
 */

const OUTPUT_DIR = path.join(process.cwd(), 'ios', 'appstore', 'screenshots-2.0');
const SETTLE_MS = 800;
const CONTENT_TIMEOUT_MS = 30_000;

/** Ensures the output directory exists (idempotent) and returns the full
 * path for one screenshot file. Called from inside each test body only, so
 * a skipped test (missing auth env) never touches the filesystem. */
function shotPath(filename: string): string {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  return path.join(OUTPUT_DIR, filename);
}

test.describe('App Store screenshots — v2.0 (build 9)', () => {
  requireGolfAuthOrSkip(test, hasGolfPlayerAuth, 'GOLFHELM_PLAYER_* or E2E_GOLF_*');

  test.describe.configure({ timeout: 90_000 });

  test.use({
    viewport: { width: 440, height: 956 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  test('01 — player dashboard', async ({ page }) => {
    await page.goto('/golf/dashboard');

    // FairwayPlayerDashboard's ViewHeader greeting — the one real h1 on this
    // page (server-rendered from the team's own timezone, so it settles
    // without waiting on a client fetch).
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({
      timeout: CONTENT_TIMEOUT_MS,
    });
    await page.waitForTimeout(SETTLE_MS);

    await page.screenshot({ path: shotPath('01-dashboard.png'), fullPage: false });
  });

  test('02 — rounds (active-round surface)', async ({ page }) => {
    // Deliberately the rounds LIBRARY page, not a specific in-progress round
    // — this must never resume/continue a round, only display the page and
    // its stats cards. See file header.
    await page.goto('/golf/dashboard/rounds');

    // FairwayRoundsLibrary's ViewHeader title ("Your rounds." for a player).
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({
      timeout: CONTENT_TIMEOUT_MS,
    });
    await page.waitForTimeout(SETTLE_MS);

    await page.screenshot({ path: shotPath('02-round.png'), fullPage: false });
  });

  test('03 — stats', async ({ page }) => {
    await page.goto('/golf/dashboard/stats');

    // Wait on a drill card, not just the h1 — this is the actual "stats"
    // content the shot exists to sell, and it's a more specific loaded-content
    // signal than the static ViewHeader title.
    await expect(page.getByRole('button', { name: /^Open Scoring/ })).toBeVisible({
      timeout: CONTENT_TIMEOUT_MS,
    });
    await page.waitForTimeout(SETTLE_MS);

    await page.screenshot({ path: shotPath('03-stats.png'), fullPage: false });
  });

  test('04 — qualifiers', async ({ page }) => {
    await page.goto('/golf/dashboard/qualifiers');

    // FairwayQualifiers' ViewHeader title ("Lineup decisions.") — this route
    // serves both roles (see the page's session-role branch), so it renders
    // for the player fixture without a redirect.
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({
      timeout: CONTENT_TIMEOUT_MS,
    });
    await page.waitForTimeout(SETTLE_MS);

    await page.screenshot({ path: shotPath('04-qualifiers.png'), fullPage: false });
  });

  test('05 — CoachHelm overview', async ({ page }) => {
    await page.goto('/golf/dashboard/coachhelm');

    // PlayerCoachHelmHome's own <h1> is visually-hidden (sr-only) by design
    // (audit P-21) — waiting on it risks a false-positive "visible" on a
    // clipped 1px box, so wait on the visible section nav landmark instead.
    await expect(page.getByRole('navigation', { name: 'CoachHelm sections' })).toBeVisible({
      timeout: CONTENT_TIMEOUT_MS,
    });
    await page.waitForTimeout(SETTLE_MS);

    await page.screenshot({ path: shotPath('05-coachhelm.png'), fullPage: false });
  });

  test('06 — calendar', async ({ page }) => {
    await page.goto('/golf/dashboard/calendar');

    // FairwayCalendar has no page <h1>; wait on the view-mode segmented
    // control (Radix ToggleGroup type="single" → role="radiogroup"), which
    // only renders once the calendar shell (not its skeleton) is mounted.
    await expect(page.getByRole('radiogroup', { name: 'Calendar view' })).toBeVisible({
      timeout: CONTENT_TIMEOUT_MS,
    });
    await page.waitForTimeout(SETTLE_MS);

    await page.screenshot({ path: shotPath('06-calendar.png'), fullPage: false });
  });
});
