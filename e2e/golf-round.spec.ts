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
 *
 * UI: assertions target the current Fairway redesign (Wave W1 — Fairway is
 * the only dashboard tree; see src/lib/redesign/flag.ts). The legacy
 * "Add Shot" button → "Shot Details" modal no longer exists — shot entry is
 * an always-visible inline panel (FairwayShotEntry) — and the in-round exit
 * action is "Save & exit" (FairwayScorecardHeader's desktop band), not a
 * generic "Save"/"Pause" button.
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

    // Click next (manual entry has no baseline, so the CTA submits to the
    // hole-configuration step)
    await page.getByRole('button', { name: 'Next: configure holes →' }).click();

    // Step 2: Hole Configuration
    await expect(page.locator('text=E2E Test Course')).toBeVisible();

    // Configure some holes (par values should be prefilled)
    await page.getByRole('button', { name: 'Start round →' }).click();

    // Step 3: Shot Tracking
    await expect(page.locator('text=Hole 1')).toBeVisible({ timeout: 5000 });

    // The shot entry panel is always visible (no "Add Shot" trigger / "Shot
    // Details" modal in the current UI) — verify it loaded for the first shot.
    const shotResultGroup = page.getByRole('radiogroup', { name: 'Shot result' });
    await expect(shotResultGroup).toBeVisible({ timeout: 3000 });
  });

  test('should show validation errors for invalid input', async ({ page }) => {
    // Navigate to new round page
    await page.goto('/golf/dashboard/rounds/new');

    // Try to proceed without filling course name
    const nextButton = page.getByRole('button', { name: 'Next: configure holes →' });

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

    await page.getByRole('button', { name: 'Next: configure holes →' }).click();
    await page.getByRole('button', { name: 'Start round →' }).click();

    // Wait for shot tracking to load
    await expect(page.locator('text=Hole 1')).toBeVisible({ timeout: 5000 });

    // "Save & exit" (desktop scorecard header) opens the exit-confirmation
    // sheet; "Save for later" persists the in-progress round.
    const exitButton = page.getByRole('button', { name: 'Save & exit' });
    if (await exitButton.isVisible()) {
      await exitButton.click();

      const saveForLater = page.getByRole('button', { name: /Save for later/i });
      if (await saveForLater.isVisible()) {
        await saveForLater.click();

        // Verify round is saved
        await page.goto('/golf/dashboard/rounds');
        await expect(page.locator('text=Progress Test Course')).toBeVisible();
      }
    }
  });

  test('should continue an in-progress round', async ({ page }) => {
    // Navigate to rounds list
    await page.goto('/golf/dashboard/rounds');

    // Look for an in-progress round (FairwayUnfinishedBanner's primary CTA)
    const continueButton = page.getByRole('button', { name: 'Continue' }).first();

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

    await page.getByRole('button', { name: 'Next: configure holes →' }).click();

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

    // Should see stats categories (rendered as role="tab")
    await expect(page.getByRole('tab', { name: 'Scoring' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Putting' })).toBeVisible();

    // Click on putting to see detailed stats
    await page.getByRole('tab', { name: 'Putting' }).click();

    // Should see putting stats (if rounds exist)
    // Stats visibility depends on having rounds
  });

  test('should navigate between stat categories', async ({ page }) => {
    await page.goto('/golf/dashboard/stats');

    // Click through all categories
    const categories = ['Scoring', 'Driving', 'Approach', 'Putting', 'Scrambling'];

    for (const category of categories) {
      await page.getByRole('tab', { name: category }).click();
      // Wait for the category's content fetch to settle instead of a flat
      // 500ms guess. Tolerant (matches e2e/helpers/common.ts's
      // waitForPageLoad) since this loop has no single stable selector to
      // assert on across all five categories.
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    }
  });
});
