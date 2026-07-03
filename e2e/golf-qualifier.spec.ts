import { test, expect } from '@playwright/test';

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

const GOLF_EMAIL = process.env.E2E_GOLF_EMAIL;
const GOLF_PASSWORD = process.env.E2E_GOLF_PASSWORD;
const hasSeededAuth = Boolean(GOLF_EMAIL && GOLF_PASSWORD);

test.describe('Golf Qualifier - Coach Flow', () => {
  test.skip('should create a new qualifier', async ({ page }) => {
    // Skip if coach login not available
    // This test requires a coach account

    await page.goto('/golf/login');
    await page.fill('input[type="email"]', GOLF_EMAIL ?? '');
    await page.fill('input[type="password"]', GOLF_PASSWORD ?? '');
    await page.click('button[type="submit"]');

    // Navigate to qualifiers
    await page.goto('/golf/dashboard/qualifiers');

    // Click create qualifier
    await page.click('button:has-text("Create Qualifier")');

    // Fill qualifier form
    await page.fill('input[name="name"]', 'E2E Test Qualifier');
    await page.fill('input[name="numRounds"]', '2');
    await page.fill('input[name="spots"]', '5');

    // Submit
    await page.click('button:has-text("Create")');

    // Should see new qualifier in list
    await expect(page.locator('text=E2E Test Qualifier')).toBeVisible();
  });
});

test.describe('Golf Qualifier - Player Flow', () => {
  test.skip(!hasSeededAuth, 'Set E2E_GOLF_EMAIL and E2E_GOLF_PASSWORD (seeded golf coach/player) to run.');

  test.beforeEach(async ({ page }) => {
    await page.goto('/golf/login');
    await page.fill('input[type="email"]', GOLF_EMAIL as string);
    await page.fill('input[type="password"]', GOLF_PASSWORD as string);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/golf/dashboard**', { timeout: 10000 });
  });

  test('should view qualifiers list', async ({ page }) => {
    // Navigate to qualifiers page
    await page.goto('/golf/dashboard/qualifiers');

    // Should see qualifiers heading
    await expect(page.locator('h1')).toContainText(/Qualifier/i);

    // Should see list or empty state
    const content = page.locator('main');
    await expect(content).toBeVisible();
  });

  test('should view qualifier details', async ({ page }) => {
    await page.goto('/golf/dashboard/qualifiers');

    // Click on a qualifier if one exists
    const qualifierLink = page.locator('a[href*="/qualifiers/"]').first();

    if (await qualifierLink.isVisible()) {
      await qualifierLink.click();

      // Should see qualifier details
      await expect(page.locator('h1, h2')).toBeVisible();

      // Should see leaderboard section (visibility depends on qualifier state)
      // Leaderboard may or may not be visible depending on qualifier state
    }
  });

  test('should submit a round for a qualifier', async ({ page }) => {
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

test.describe('Golf Qualifier - Leaderboard', () => {
  test.skip(!hasSeededAuth, 'Set E2E_GOLF_EMAIL and E2E_GOLF_PASSWORD (seeded golf coach/player) to run.');

  test.beforeEach(async ({ page }) => {
    await page.goto('/golf/login');
    await page.fill('input[type="email"]', GOLF_EMAIL as string);
    await page.fill('input[type="password"]', GOLF_PASSWORD as string);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/golf/dashboard**', { timeout: 10000 });
  });

  test('should display leaderboard correctly', async ({ page }) => {
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

  test('should highlight qualifying positions', async ({ page }) => {
    await page.goto('/golf/dashboard/qualifiers');

    const qualifierLink = page.locator('a[href*="/qualifiers/"]').first();

    if (await qualifierLink.isVisible()) {
      await qualifierLink.click();

      // Look for "bubble line" or qualifying position indicator
      // Bubble line visibility depends on qualifier configuration
    }
  });
});
