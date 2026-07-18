import { test, expect } from '@playwright/test';
// The seeded "E2E Prospect Camp" is owned by the #375 fixture coach
// (testcoach@helm.test) on the dedicated "E2E Test University" team — log in
// as those pinned accounts, NOT the env-driven Rini-demo accounts (see
// helpers/auth.ts E2E_FIXTURE_USERS). Under the shared env-driven login the
// coach/player never saw the seeded camp.
import { loginAsFixtureCoach as loginAsCoach, loginAsFixturePlayer as loginAsPlayer } from './helpers/auth';
import { waitForPageLoad } from './helpers/common';

/**
 * Baseball Camps E2E Test
 *
 * Exercises the real camp browse/register (player) and create/manage
 * (coach) flows against the deterministic fixtures provisioned by
 * `scripts/seed-baseball-e2e.ts` (issue #375):
 *   - one open camp ("E2E Prospect Camp") owned by the seeded test coach
 *   - one bench roster player ("Riley Bennett") pre-registered for it
 *   - the shared test-player login intentionally left UNREGISTERED so the
 *     register/unregister round trip always starts from a clean state
 *
 * Gated on PLAYWRIGHT_BASEBALL_SEEDED=1, with a per-test self-skip if the
 * login fixture is unavailable in the target environment — same pattern as
 * baseball-phase1.spec.ts.
 */

const SEEDED =
  process.env.PLAYWRIGHT_BASEBALL_SEEDED === '1' ||
  process.env.PLAYWRIGHT_BASEBALL_SEEDED === 'true';

const SEEDED_CAMP_NAME = 'E2E Prospect Camp';
const SEEDED_REGISTRANT_NAME = 'Riley Bennett';

test.describe('Camps - Player Flow', () => {
  test.skip(!SEEDED, 'no seeded baseball camp fixture (set PLAYWRIGHT_BASEBALL_SEEDED=1)');

  test.beforeEach(async ({ page }) => {
    try {
      await loginAsPlayer(page);
    } catch {
      test.skip(true, 'player login fixture unavailable in this environment');
    }
    await waitForPageLoad(page);
  });

  test('should browse available camps and see the seeded camp', async ({ page }) => {
    await page.goto('/baseball/dashboard/camps');
    await waitForPageLoad(page);

    await expect(page.locator('h1')).toContainText(/Camp/i);
    await expect(page.locator('[data-testid="camps-grid"]')).toBeVisible();

    const seededCard = page.locator('[data-testid="camp-card"]', { hasText: SEEDED_CAMP_NAME });
    await expect(seededCard).toBeVisible();
  });

  test('should view camp details including date, location, and registration button', async ({ page }) => {
    await page.goto('/baseball/dashboard/camps');
    await waitForPageLoad(page);

    const seededCard = page.locator('[data-testid="camp-card"]', { hasText: SEEDED_CAMP_NAME });
    await expect(seededCard).toBeVisible();
    await expect(seededCard.getByText('Test University Field')).toBeVisible();
    await expect(
      seededCard.getByRole('button', { name: /^Register$/i })
    ).toBeVisible();
  });

  test('should register for the seeded camp and then unregister', async ({ page }) => {
    await page.goto('/baseball/dashboard/camps');
    await waitForPageLoad(page);

    const seededCard = page.locator('[data-testid="camp-card"]', { hasText: SEEDED_CAMP_NAME });
    await expect(seededCard).toBeVisible();

    // Register — the seeded test player starts unregistered (seed script
    // resets this every run, see resetTestPlayerCampRegistration).
    const registerButton = seededCard.getByRole('button', { name: /^Register$/i });
    await expect(registerButton).toBeVisible();
    await registerButton.click();

    const registeredButton = seededCard.getByRole('button', { name: /Registered/i });
    await expect(registeredButton).toBeVisible({ timeout: 5000 });

    // Unregister — clicking the "Registered" pill cancels the registration.
    await registeredButton.click();
    await expect(seededCard.getByRole('button', { name: /^Register$/i })).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Camps - Coach Flow', () => {
  test.skip(!SEEDED, 'no seeded baseball camp fixture (set PLAYWRIGHT_BASEBALL_SEEDED=1)');

  test.beforeEach(async ({ page }) => {
    try {
      await loginAsCoach(page);
    } catch {
      test.skip(true, 'coach login fixture unavailable in this environment');
    }
    await waitForPageLoad(page);
  });

  test('should list the seeded camp with a registration count', async ({ page }) => {
    await page.goto('/baseball/dashboard/camps');
    await waitForPageLoad(page);

    const seededCard = page.locator('[data-testid="camp-card"]', { hasText: SEEDED_CAMP_NAME });
    await expect(seededCard).toBeVisible();
    await expect(seededCard.getByText(/registered$/i)).toBeVisible();
  });

  test('should view camp roster and see the seeded registration', async ({ page }) => {
    await page.goto('/baseball/dashboard/camps');
    await waitForPageLoad(page);

    const seededCard = page.locator('[data-testid="camp-card"]', { hasText: SEEDED_CAMP_NAME });
    await seededCard.getByRole('button', { name: new RegExp(`View roster for ${SEEDED_CAMP_NAME}`, 'i') }).click();
    await waitForPageLoad(page);

    await expect(page).toHaveURL(/\/dashboard\/camps\/[a-zA-Z0-9-]+$/);
    await expect(page.locator('body')).not.toContainText(/Application error|500/i);
    await expect(page.getByRole('heading', { name: /Roster/i })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(SEEDED_REGISTRANT_NAME)).toBeVisible();
  });

  test('should create a new camp and then delete it', async ({ page }) => {
    await page.goto('/baseball/dashboard/camps');
    await waitForPageLoad(page);

    const campName = `E2E Created Camp ${Date.now()}`;

    await page.getByRole('button', { name: 'Create Camp', exact: true }).click();

    const closeModalButton = page.getByRole('button', { name: 'Close create camp modal' });
    await expect(closeModalButton).toBeVisible();
    const modal = closeModalButton.locator('xpath=ancestor::div[contains(@class, "glass-prominent")]');

    await modal.getByLabel(/Camp Name/i).fill(campName);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 30);
    const startDateStr = startDate.toISOString().slice(0, 10);
    await modal.getByLabel(/Start Date/i).fill(startDateStr);
    await modal.getByLabel(/^Location$/i).fill('E2E Created Field');

    await modal.getByRole('button', { name: 'Create Camp', exact: true }).click();

    const createdCard = page.locator('[data-testid="camp-card"]', { hasText: campName });
    await expect(createdCard).toBeVisible({ timeout: 8000 });

    // Clean up: delete the camp we just created so repeated CI runs don't
    // accumulate test data outside the deterministic seed namespace.
    await createdCard.getByRole('button', { name: new RegExp(`Delete ${campName}`, 'i') }).click();

    const deleteDialog = page.getByRole('dialog', { name: 'Delete Camp' });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.locator('[data-testid="camp-card"]', { hasText: campName })).toHaveCount(0, { timeout: 8000 });
  });
});
