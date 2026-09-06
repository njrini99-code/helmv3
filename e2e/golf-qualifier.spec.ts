import { expect } from '@playwright/test';
import {
  golfCoachTest,
  golfPlayerTest,
  hasGolfCoachAuth,
  hasGolfPlayerAuth,
  requireGolfAuthOrSkip,
} from './fixtures/golf-auth';

/**
 * Golf Qualifier E2E Test
 * Tests qualifier creation, round submission, and leaderboard
 *
 * AUTH: env-gated (matches e2e/course-library.spec.ts's "authenticated
 * flow" pattern) — the previous hardcoded coach@helmsportslabs.com /
 * rinin376@gmail.com credentials were placeholder/personal accounts, not
 * CI-seeded ones, so every run against real CI failed at login. Set
 * E2E_GOLF_EMAIL / E2E_GOLF_PASSWORD to a seeded golf coach/player login to
 * run these; otherwise they self-skip instead of failing.
 */

golfCoachTest.describe('Golf Qualifier - Coach Flow', () => {
  // Was `test.skip('should create a new qualifier', ...)` — Playwright's
  // (name, fn) skip signature, which unconditionally skips forever
  // regardless of env vars. That predates the env-gating documented in the
  // file header above and never actually adopted it, unlike the Player
  // Flow / Leaderboard blocks below. Converted to the same conditional
  // skip so this runs whenever seeded creds are present. Verified
  // 2026-07-09: E2E_GOLF_EMAIL/E2E_GOLF_PASSWORD are still unset in this
  // repo's environment (no seeded-auth CI fixture exists yet), so this
  // remains skipped today — the true current blocker is the missing env
  // vars, not the test itself.
  requireGolfAuthOrSkip(golfCoachTest, hasGolfCoachAuth, 'GOLFHELM_COACH_EMAIL and GOLFHELM_COACH_PASSWORD');

  golfCoachTest('coach can reach the qualifier creation form', async ({ page }) => {
    await page.goto('/golf/dashboard/qualifiers');
    await expect(page.getByRole('heading', { name: 'Lineup decisions.' })).toBeVisible();

    // Assert the real navigation contract without adding another durable
    // qualifier to the shared test team on every run. This must be a working
    // click, not only a valid href: coach soft navigation previously started
    // the request but never committed the route transition.
    const createQualifier = page.getByRole('link', { name: 'Create qualifier' });
    await expect(createQualifier).toHaveAttribute('href', '/golf/dashboard/qualifiers/new');
    await createQualifier.click();
    await expect(page).toHaveURL(/\/golf\/dashboard\/qualifiers\/new/);
    await expect(page.getByRole('heading', { name: 'Create a qualifier.' })).toBeVisible();
    await expect(page.getByLabel(/qualifier name/i)).toBeVisible();
    await expect(page.getByLabel(/start date/i)).toBeVisible();
  });
});

golfPlayerTest.describe('Golf Qualifier - Player Flow', () => {
  requireGolfAuthOrSkip(golfPlayerTest, hasGolfPlayerAuth, 'GOLFHELM_PLAYER_* or E2E_GOLF_*');

  golfPlayerTest('should view qualifiers list', async ({ page }) => {
    // Navigate to qualifiers page
    await page.goto('/golf/dashboard/qualifiers');

    // Should see the qualifiers heading (FairwayQualifiers.tsx:226 title).
    // `.first()`: two identical view-header h1s coexist for a beat during the
    // route transition (old + new view), so a bare locator('h1') trips strict
    // mode — observed flaking exactly that way in CI (run 32165337216).
    await expect(
      page.getByRole('heading', { name: 'Lineup decisions.' }).first(),
    ).toBeVisible();

    // Should see list or empty state
    const content = page.locator('main');
    await expect(content).toBeVisible();
  });

  golfPlayerTest('should view qualifier details', async ({ page }) => {
    await page.goto('/golf/dashboard/qualifiers');

    // Click on a qualifier if one exists
    const qualifierLink = page.locator('a[href*="/qualifiers/"]').first();

    if (await qualifierLink.isVisible()) {
      await qualifierLink.click();

      // Should see qualifier details.
      //
      // `.first()` is load-bearing, not style. Every page in this app renders
      // an `h1` ("GolfHelm") plus an `h2` page title, so a bare `h1, h2`
      // locator matches two elements and Playwright's strict mode fails the
      // assertion outright:
      //
      //   strict mode violation: locator('h1, h2') resolved to 2 elements
      //
      // It only fired when the `isVisible()` guard above passed, so the test
      // went green whenever the qualifier link had NOT rendered and red when it
      // had — failing precisely when the page worked. All 12 sibling uses in
      // baseball-phase1.spec.ts already carry `.first()`; this was the outlier.
      await expect(page.locator('h1, h2').first()).toBeVisible();

      // Should see leaderboard section (visibility depends on qualifier state)
      // Leaderboard may or may not be visible depending on qualifier state
    }
  });

  golfPlayerTest('should submit a round for a qualifier', async ({ page }) => {
    await page.goto('/golf/dashboard/qualifiers');

    // Find a qualifier with "Submit Round" option
    const submitButton = page.locator('button:has-text("Submit Round"), a:has-text("Submit Round")').first();

    if (await submitButton.isVisible()) {
      await submitButton.click();

      // Should navigate to round submission
      await expect(page).toHaveURL(/rounds\/new/);
    }
  });
});

golfPlayerTest.describe('Golf Qualifier - Leaderboard', () => {
  requireGolfAuthOrSkip(golfPlayerTest, hasGolfPlayerAuth, 'GOLFHELM_PLAYER_* or E2E_GOLF_*');

  golfPlayerTest('should display leaderboard correctly', async ({ page }) => {
    await page.goto('/golf/dashboard/qualifiers');

    // Navigate to a qualifier
    const qualifierLink = page.locator('a[href*="/qualifiers/"]').first();

    if (await qualifierLink.isVisible()) {
      await qualifierLink.click();

      // Look for leaderboard table/list
      const leaderboard = page.locator('table, [data-testid="leaderboard"]');

      if (await leaderboard.isVisible()) {
        // Should have player names and scores
        await expect(page.locator('th:has-text("Player"), th:has-text("Name")').first()).toBeVisible();
        await expect(page.locator('th:has-text("Score"), th:has-text("Total")').first()).toBeVisible();
      }
    }
  });

  golfPlayerTest('should highlight qualifying positions', async ({ page }) => {
    await page.goto('/golf/dashboard/qualifiers');

    const qualifierLink = page.locator('a[href*="/qualifiers/"]').first();

    if (await qualifierLink.isVisible()) {
      await qualifierLink.click();

      // Look for "bubble line" or qualifying position indicator
      // Bubble line visibility depends on qualifier configuration
    }
  });
});
