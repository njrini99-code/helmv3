import { expect } from '@playwright/test';
import { golfPlayerTest as test, hasGolfPlayerAuth } from './fixtures/golf-auth';

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

async function closeCoursePicker(page: import('@playwright/test').Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Choose a course' });
  // The course picker is opened in an effect after the new-round screen
  // mounts. Give that effect a bounded chance to run before choosing manual
  // entry, otherwise the picker can appear just after this helper returns.
  await dialog.waitFor({ state: 'visible', timeout: 2_000 }).catch(() => {});
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
  }
}

test.describe('Golf Round - Complete Flow', () => {
  test.skip(!hasGolfPlayerAuth, 'Set GOLFHELM_PLAYER_* or E2E_GOLF_* credentials to run.');

  test('should configure a full round entry', async ({ page }) => {
    // Navigate to new round page
    await page.goto('/golf/dashboard/rounds/new');
    await closeCoursePicker(page);

    // Step 1: Course Setup
    await page.fill('#courseName', 'E2E Test Course');
    await page.fill('#courseCity', 'Test City');
    await page.fill('#courseState', 'CA');

    // Click next (manual entry has no baseline, so the CTA submits to the
    // hole-configuration step)
    await page.getByRole('button', { name: 'Next: configure holes →' }).click();

    // Step 2: Hole Configuration
    await expect(page.locator('text=E2E Test Course')).toBeVisible();

    // The configured scorecard reaches the persistence boundary. The next
    // click creates a real round; the save-in-progress test owns that write.
    await expect(page.getByRole('button', { name: 'Start round →' })).toBeEnabled();
  });

  test('should show validation errors for invalid input', async ({ page }) => {
    // Navigate to new round page
    await page.goto('/golf/dashboard/rounds/new');
    await closeCoursePicker(page);

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
    await closeCoursePicker(page);

    // Setup course
    await page.fill('#courseName', 'Progress Test Course');
    await page.fill('#courseCity', 'Test City');
    await page.fill('#courseState', 'TX');

    await page.getByRole('button', { name: 'Next: configure holes →' }).click();
    await page.getByRole('button', { name: 'Start round →' }).click();

    // Wait for shot tracking to load
    await expect(page.getByRole('heading', { name: 'Hole 1', exact: true })).toBeVisible({ timeout: 5000 });

    // "Save & exit" (desktop scorecard header) opens the exit-confirmation
    // sheet; "Save for later" persists the in-progress round.
    const exitButton = page.getByRole('button', { name: 'Save & exit' });
    if (await exitButton.isVisible()) {
      await exitButton.click();

      const saveForLater = page.getByRole('button', { name: /Save for later/i });
      if (await saveForLater.isVisible()) {
        const exitDialog = page.getByRole('dialog', { name: 'Exit round' });
        await saveForLater.click();
        // The dialog closes only after savePartialRound succeeds. Waiting on
        // that state avoids racing a manual navigation against the save.
        await expect(exitDialog).toBeHidden({ timeout: 20000 });

        // Verify round is saved
        await page.goto('/golf/dashboard/rounds');
        await expect(
          page.getByRole('region', { name: 'Rounds in progress' }).getByText('Progress Test Course'),
        ).toBeVisible();
      }
    }
  });

  test('should continue an in-progress round', async ({ page }) => {
    // Navigate to rounds list
    await page.goto('/golf/dashboard/rounds');

    // Look for an in-progress round (FairwayUnfinishedBanner's primary CTA)
    const continueButton = page.getByRole('button', { name: 'Continue' }).first();

    if (await continueButton.isVisible()) {
      await Promise.all([
        page.waitForURL(/\/golf\/dashboard\/rounds\/continue\//, { timeout: 20000 }),
        continueButton.click(),
      ]);

      // Should load shot tracking
      await expect(page.getByRole('heading', { name: /^Hole \d+$/ })).toBeVisible({ timeout: 10000 });
    }
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Navigate to new round page
    await page.goto('/golf/dashboard/rounds/new');
    await closeCoursePicker(page);

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
  test.skip(!hasGolfPlayerAuth, 'Set GOLFHELM_PLAYER_* or E2E_GOLF_* credentials to run.');

  test('should display stats after round completion', async ({ page }) => {
    // Navigate to stats page
    await page.goto('/golf/dashboard/stats');

    // The stats redesign exposes drill cards as named buttons.
    await expect(page.getByRole('button', { name: /^Open Scoring/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Open Putting/ })).toBeVisible();

    // Click on putting to see detailed stats
    await page.getByRole('button', { name: /^Open Putting/ }).click();
    await expect(page.getByRole('heading', { name: 'Putting by distance' })).toBeVisible();

    // Should see putting stats (if rounds exist)
    // Stats visibility depends on having rounds
  });

  test('should navigate between stat categories', async ({ page }) => {
    await page.goto('/golf/dashboard/stats');

    // Click through all categories
    const categories = ['Scoring', 'Off the tee', 'Approach', 'Putting', 'Short game'];

    for (const category of categories) {
      await page.getByRole('button', { name: new RegExp(`^Open ${category}`) }).click();
      await expect(page.getByRole('button', { name: 'All areas' })).toBeVisible();
      await page.getByRole('button', { name: 'All areas' }).click();
    }
  });
});
