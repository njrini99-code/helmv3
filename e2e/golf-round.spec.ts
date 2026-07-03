import { test, expect } from '@playwright/test';

/**
 * Golf Round E2E Test
 * Tests round submission flow including happy path and error cases
 *
 * AUTH: env-gated (matches e2e/course-library.spec.ts's "authenticated
 * flow" pattern) — the previous hardcoded rinin376@gmail.com / Pirates#09!!
 * credentials were a personal local account, not a CI-seeded one, so every
 * run against real CI (no such account) failed at login. Set E2E_GOLF_EMAIL
 * / E2E_GOLF_PASSWORD to a seeded golf coach/player login to run these;
 * otherwise they self-skip instead of failing.
 */

const GOLF_EMAIL = process.env.E2E_GOLF_EMAIL;
const GOLF_PASSWORD = process.env.E2E_GOLF_PASSWORD;
const hasSeededAuth = Boolean(GOLF_EMAIL && GOLF_PASSWORD);

test.describe('Golf Round - Complete Flow', () => {
  test.skip(!hasSeededAuth, 'Set E2E_GOLF_EMAIL and E2E_GOLF_PASSWORD (seeded golf coach/player) to run.');

  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('/golf/login');

    // Login
    await page.fill('input[type="email"]', GOLF_EMAIL as string);
    await page.fill('input[type="password"]', GOLF_PASSWORD as string);
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL('**/golf/dashboard**', { timeout: 10000 });
  });

  test('should complete a full round entry', async ({ page }) => {
    // Navigate to new round page
    await page.goto('/golf/dashboard/rounds/new');

    // Step 1: Course Setup
    await page.fill('#courseName', 'E2E Test Course');
    await page.fill('#courseCity', 'Test City');
    await page.fill('#courseState', 'CA');

    // Click next
    await page.click('button:has-text("Next: Configure Holes")');

    // Step 2: Hole Configuration
    await expect(page.locator('text=E2E Test Course')).toBeVisible();

    // Configure some holes (par values should be prefilled)
    await page.click('button:has-text("Save Course & Start Round")');

    // Step 3: Shot Tracking
    await expect(page.locator('text=Hole 1')).toBeVisible({ timeout: 5000 });

    // Enter first shot (tee shot)
    const shotButton = page.locator('button:has-text("Add Shot")').first();
    if (await shotButton.isVisible()) {
      await shotButton.click();

      // Wait for shot modal
      await expect(page.locator('text=Shot Details')).toBeVisible({ timeout: 3000 });
    }
  });

  test('should show validation errors for invalid input', async ({ page }) => {
    // Navigate to new round page
    await page.goto('/golf/dashboard/rounds/new');

    // Try to proceed without filling course name
    const nextButton = page.locator('button:has-text("Next: Configure Holes")');

    // Should not proceed without required fields
    await nextButton.click();

    // Should see validation error or field focus
    const courseInput = page.locator('#courseName');
    await expect(courseInput).toBeFocused();
  });

  test('should save round in progress', async ({ page }) => {
    // Navigate to new round page
    await page.goto('/golf/dashboard/rounds/new');

    // Setup course
    await page.fill('#courseName', 'Progress Test Course');
    await page.fill('#courseCity', 'Test City');
    await page.fill('#courseState', 'TX');

    await page.click('button:has-text("Next: Configure Holes")');
    await page.click('button:has-text("Save Course & Start Round")');

    // Wait for shot tracking to load
    await expect(page.locator('text=Hole 1')).toBeVisible({ timeout: 5000 });

    // Look for save/pause button
    const saveButton = page.locator('button:has-text("Save"), button:has-text("Pause")').first();
    if (await saveButton.isVisible()) {
      await saveButton.click();

      // Verify round is saved
      await page.goto('/golf/dashboard/rounds');
      await expect(page.locator('text=Progress Test Course')).toBeVisible();
    }
  });

  test('should continue an in-progress round', async ({ page }) => {
    // Navigate to rounds list
    await page.goto('/golf/dashboard/rounds');

    // Look for an in-progress round
    const continueButton = page.locator('button:has-text("Continue")').first();

    if (await continueButton.isVisible()) {
      await continueButton.click();

      // Should load shot tracking
      await expect(page.locator('text=Hole')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Navigate to new round page
    await page.goto('/golf/dashboard/rounds/new');

    // Setup course
    await page.fill('#courseName', 'Network Error Test');
    await page.fill('#courseCity', 'Test City');
    await page.fill('#courseState', 'FL');

    // Simulate offline mode
    await page.context().setOffline(true);

    await page.click('button:has-text("Next: Configure Holes")');

    // Should show error message or handle gracefully
    // Re-enable network
    await page.context().setOffline(false);
  });
});

test.describe('Golf Round - Stats Calculation', () => {
  test.skip(!hasSeededAuth, 'Set E2E_GOLF_EMAIL and E2E_GOLF_PASSWORD (seeded golf coach/player) to run.');

  test.beforeEach(async ({ page }) => {
    await page.goto('/golf/login');
    await page.fill('input[type="email"]', GOLF_EMAIL as string);
    await page.fill('input[type="password"]', GOLF_PASSWORD as string);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/golf/dashboard**', { timeout: 10000 });
  });

  test('should display stats after round completion', async ({ page }) => {
    // Navigate to stats page
    await page.goto('/golf/dashboard/stats');

    // Should see stats categories
    await expect(page.locator('button:has-text("Scoring")')).toBeVisible();
    await expect(page.locator('button:has-text("Putting")')).toBeVisible();

    // Click on putting to see detailed stats
    await page.click('button:has-text("Putting")');

    // Should see putting stats (if rounds exist)
    // Stats visibility depends on having rounds
  });

  test('should navigate between stat categories', async ({ page }) => {
    await page.goto('/golf/dashboard/stats');

    // Click through all categories
    const categories = ['Scoring', 'Driving', 'Approach', 'Putting', 'Scrambling'];

    for (const category of categories) {
      await page.click(`button:has-text("${category}")`);
      // Wait for the category's content fetch to settle instead of a flat
      // 500ms guess. Tolerant (matches e2e/helpers/common.ts's
      // waitForPageLoad) since this loop has no single stable selector to
      // assert on across all five categories.
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    }
  });
});
