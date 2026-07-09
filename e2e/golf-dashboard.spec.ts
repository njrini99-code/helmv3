import { test, expect } from '@playwright/test';

/**
 * Golf Dashboard E2E Test
 * Tests the complete golf dashboard flow with enhanced features
 *
 * AUTH: env-gated (matches e2e/course-library.spec.ts's "authenticated
 * flow" pattern) — the previous hardcoded rinin376@gmail.com / Pirates#09!!
 * credentials were a personal local account, not a CI-seeded one, so every
 * run against real CI (no such account) failed at login. Set E2E_GOLF_EMAIL
 * / E2E_GOLF_PASSWORD to a seeded golf coach/player login to run these;
 * otherwise they self-skip instead of failing.
 *
 * UI: assertions target the current Fairway redesign (Wave W1 — Fairway is
 * the only dashboard tree; see src/lib/redesign/flag.ts), not the legacy
 * emerald/`bg-emerald-600` UI. Selectors use accessible roles/names rather
 * than color utility classes, which are an implementation detail that
 * changes with the design system, not the user-facing contract.
 */

const GOLF_EMAIL = process.env.E2E_GOLF_EMAIL;
const GOLF_PASSWORD = process.env.E2E_GOLF_PASSWORD;
const hasSeededAuth = Boolean(GOLF_EMAIL && GOLF_PASSWORD);

test.describe('Golf Dashboard - Player Flow', () => {
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

  test('should load dashboard successfully', async ({ page }) => {
    // Verify dashboard loaded
    await expect(page).toHaveURL(/\/golf\/dashboard/);

    // Should see dashboard heading (FairwayPlayerDashboard's ViewHeader greeting)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening)/);
  });

  test('should navigate to rounds page', async ({ page }) => {
    // Click on rounds link
    await page.click('text=My Rounds');

    // Should navigate to rounds page
    await expect(page).toHaveURL(/\/golf\/dashboard\/rounds/);

    // Should see the rounds masthead (FairwayRoundsLibrary's ViewHeader title
    // is "Your rounds." for a player, "The library." for a coach).
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/rounds/i);
  });

  test('should access new round page and see all steps', async ({ page }) => {
    // Navigate to new round page
    await page.goto('/golf/dashboard/rounds/new');

    // Step 1: Setup - Should see course setup form (FairwayNewRoundEntry's
    // cockpit band h1, not a literal "New Round" string).
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/track every shot/i);
    await expect(page.locator('#courseName')).toBeVisible();

    // Fill in course setup
    await page.fill('#courseName', 'E2E Test Course');
    await page.fill('#courseCity', 'Test City');
    await page.fill('#courseState', 'CA');

    // Manual entry (no course-library/saved-course pick) → the primary CTA
    // submits straight to hole configuration.
    const nextButton = page.getByRole('button', { name: 'Next: configure holes →' });
    await expect(nextButton).toBeVisible();

    // Click next
    await nextButton.click();

    // Step 2: Holes - Should see hole configuration form
    await expect(page.locator('text=E2E Test Course')).toBeVisible();
    await expect(page.locator('text=Total Par')).toBeVisible();

    // Should see hole configuration grid headers (FairwayHoleConfig: "Yards",
    // not the legacy "Yardage"). Exact match — "Par"/"Total Par" and
    // "Yards"/"Total Yards" both appear on this screen, so a bare substring
    // match would hit more than one element (strict-mode violation).
    await expect(page.getByText('Hole', { exact: true })).toBeVisible();
    await expect(page.getByText('Par', { exact: true })).toBeVisible();
    await expect(page.getByText('Yards', { exact: true })).toBeVisible();

    // Should see Front 9 / Back 9 segmented options (rendered as role="radio",
    // labeled "Front 9 · <par>" / "Back 9 · <par>").
    await expect(page.getByRole('radio', { name: /^Front 9/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: /^Back 9/ })).toBeVisible();

    // Should see the per-hole par selector chips (accessible name "Hole N par P").
    const parButton = page.getByRole('button', { name: /^Hole 1 par (3|4|5)$/ }).first();
    await expect(parButton).toBeVisible();

    // Should see the primary action to start tracking
    const saveButton = page.getByRole('button', { name: 'Start round →' });
    await expect(saveButton).toBeVisible();

    // Click save to proceed to shot tracking
    await saveButton.click();

    // Step 3: Shot Tracking - Should see the tracking surface for hole 1
    await expect(page.locator('text=Hole 1')).toBeVisible({ timeout: 5000 });

    // Should see the shot entry interface
    // (Note: Full shot tracking test would be more complex,
    // this just verifies the component loaded)
  });

  test('should navigate to stats page', async ({ page }) => {
    // Navigate to stats page
    await page.goto('/golf/dashboard/stats');

    // Should see stats page (FairwayPlayerStats' title is "Your stats" for a
    // player viewing their own page).
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/stats/i);

    // Should see category tabs (FairwayStatsCockpit renders these as
    // role="tab" via the Fairway Tabs/Radix primitive, not plain buttons).
    await expect(page.getByRole('tab', { name: 'Scoring' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Driving' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Approach' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Putting' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Scrambling' })).toBeVisible();
  });

  test('should keep the primary setup/holes CTAs keyboard-accessible', async ({ page }) => {
    // Go to new round page
    await page.goto('/golf/dashboard/rounds/new');

    // The primary CTA must be a real, named, focusable control — not just a
    // colored div. (This replaces the old bg-emerald-600 color-scheme check,
    // which asserted on an implementation-detail utility class rather than
    // the accessible contract.)
    const courseNameInput = page.locator('#courseName');
    await courseNameInput.click();
    await courseNameInput.fill('Accessibility Test Course');

    const nextButton = page.getByRole('button', { name: 'Next: configure holes →' });
    await expect(nextButton).toBeEnabled();

    // Navigate to holes step
    await nextButton.click();

    // Verify hole configuration loaded and its primary action is likewise a
    // real, named, focusable control.
    await expect(page.locator('text=Total Par')).toBeVisible();
    const saveButton = page.getByRole('button', { name: 'Start round →' });
    await expect(saveButton).toBeEnabled();
  });
});

test.describe('Golf Dashboard - Route Consolidation', () => {
  test('should not have player-golf routes', async ({ page }) => {
    // Attempt to access old player-golf routes
    const oldRoutes = [
      '/player-golf/rounds/new',
      '/player-golf/stats',
      '/player-golf/rounds',
    ];

    for (const route of oldRoutes) {
      const response = await page.goto(route);
      // Should get 404 or redirect
      expect(response?.status()).not.toBe(200);
    }
  });

  test('login should redirect to golf dashboard', async ({ page }) => {
    test.skip(!hasSeededAuth, 'Set E2E_GOLF_EMAIL and E2E_GOLF_PASSWORD (seeded golf coach/player) to run.');

    await page.goto('/golf/login');

    // Login
    await page.fill('input[type="email"]', GOLF_EMAIL as string);
    await page.fill('input[type="password"]', GOLF_PASSWORD as string);
    await page.click('button[type="submit"]');

    // Should redirect to golf dashboard (not player-golf)
    await page.waitForURL('**/golf/dashboard**', { timeout: 10000 });
    await expect(page).toHaveURL(/\/golf\/dashboard$/);
  });
});
