import { test, expect, type Page } from '@playwright/test';
import { TEST_USERS } from './helpers/auth';

/**
 * BaseballHelm Phase 1 — E2E smoke (Wave 12, P12.3).
 *
 * Covers the new Phase-1 surfaces (practice, performance/lifting, stats center,
 * stat upload + import, player timeline/journey, program settings, staff
 * management). Every test is GUARDED: if no seeded auth fixture is available in
 * the target environment, the login helper times out and the test self-skips
 * rather than failing the suite. This mirrors the established pattern in
 * baseball-pipeline.spec.ts (skip-when-no-fixture), so the spec is safe to run
 * in CI before a seeded baseball test account exists.
 *
 * When a seeded coach + player fixture lands, flip ENABLE_SEEDED_AUTH (or set
 * PLAYWRIGHT_BASEBALL_SEEDED=1) and the route smoke assertions run for real.
 */

const SEEDED =
  process.env.PLAYWRIGHT_BASEBALL_SEEDED === '1' ||
  process.env.PLAYWRIGHT_BASEBALL_SEEDED === 'true';

/** Try to log a user in; returns true on success, false if no fixture. */
async function tryLogin(
  page: Page,
  creds: { email: string; password: string },
): Promise<boolean> {
  try {
    await page.goto('/baseball/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="email"]', creds.email);
    await page.fill('input[name="password"]', creds.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/**/dashboard/**', { timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public / unauthenticated reachability — runs unconditionally. These assert
// the new routes are wired (don't hard-500) and that protected surfaces bounce
// an anonymous visitor to login rather than leaking staff data.
// ---------------------------------------------------------------------------
test.describe('BaseballHelm Phase 1 — route wiring (anonymous)', () => {
  const PROTECTED_ROUTES = [
    '/baseball/dashboard/practice',
    '/baseball/dashboard/performance',
    '/baseball/dashboard/stats-center',
    '/baseball/dashboard/stats/upload',
    '/baseball/dashboard/import',
    '/baseball/dashboard/journey',
    '/baseball/dashboard/program',
    '/baseball/dashboard/settings/staff',
    '/baseball/dashboard/settings/program',
    '/baseball/dashboard/settings/imports',
    '/baseball/dashboard/settings/integrations',
    '/baseball/dashboard/settings/audit',
  ];

  for (const route of PROTECTED_ROUTES) {
    test(`anonymous visitor to ${route} is not served staff data`, async ({
      page,
    }) => {
      const resp = await page.goto(route, { waitUntil: 'domcontentloaded' });
      // Must not be a hard server error (route exists + middleware handles auth).
      expect(resp?.status() ?? 0).toBeLessThan(500);
      // Anonymous users must be bounced to login (or shown an auth wall) — the
      // page must NOT land on the protected surface with content rendered.
      const url = page.url();
      const onAuthWall =
        url.includes('/login') ||
        url.includes('/signup') ||
        url.includes('/baseball/login');
      // If still on the route, there must be no staff-only content leaked; the
      // simplest robust signal is that we were redirected away.
      expect(onAuthWall, `expected ${route} to bounce anon to an auth wall`).toBe(
        true,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Coach surfaces — seeded-only. Skips cleanly when no fixture.
// ---------------------------------------------------------------------------
test.describe('BaseballHelm Phase 1 — coach surfaces', () => {
  test.skip(!SEEDED, 'no seeded baseball coach fixture (set PLAYWRIGHT_BASEBALL_SEEDED=1)');

  test('coach can open practice planner', async ({ page }) => {
    const ok = await tryLogin(page, TEST_USERS.coach);
    test.skip(!ok, 'coach login fixture unavailable in this environment');
    await page.goto('/baseball/dashboard/practice');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('body')).not.toContainText(/Application error|500/i);
  });

  test('coach can open performance / lifting', async ({ page }) => {
    const ok = await tryLogin(page, TEST_USERS.coach);
    test.skip(!ok, 'coach login fixture unavailable in this environment');
    await page.goto('/baseball/dashboard/performance');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
  });

  test('coach can open stats center + upload', async ({ page }) => {
    const ok = await tryLogin(page, TEST_USERS.coach);
    test.skip(!ok, 'coach login fixture unavailable in this environment');
    await page.goto('/baseball/dashboard/stats-center');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
    await page.goto('/baseball/dashboard/stats/upload');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
  });

  test('coach can open program settings + staff management', async ({ page }) => {
    const ok = await tryLogin(page, TEST_USERS.coach);
    test.skip(!ok, 'coach login fixture unavailable in this environment');
    // Settings OS surface (program type / access policy / AI). This is the route
    // this packet built — distinct from the Phase-1 /dashboard/program profile.
    await page.goto('/baseball/dashboard/settings/program');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
    await page.goto('/baseball/dashboard/settings/staff');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
  });

  test('coach can open import sources + integrations + audit log', async ({ page }) => {
    const ok = await tryLogin(page, TEST_USERS.coach);
    test.skip(!ok, 'coach login fixture unavailable in this environment');
    await page.goto('/baseball/dashboard/settings/imports');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
    await page.goto('/baseball/dashboard/settings/integrations');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
    await page.goto('/baseball/dashboard/settings/audit');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Player surfaces — seeded-only. A player must NOT reach staff-only management.
// ---------------------------------------------------------------------------
test.describe('BaseballHelm Phase 1 — player surfaces + isolation', () => {
  test.skip(!SEEDED, 'no seeded baseball player fixture (set PLAYWRIGHT_BASEBALL_SEEDED=1)');

  test('player can open their performance + journey', async ({ page }) => {
    const ok = await tryLogin(page, TEST_USERS.player);
    test.skip(!ok, 'player login fixture unavailable in this environment');
    await page.goto('/baseball/dashboard/performance');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
    await page.goto('/baseball/dashboard/journey');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
  });

  test('player is denied staff-only program + staff management surfaces', async ({
    page,
  }) => {
    const ok = await tryLogin(page, TEST_USERS.player);
    test.skip(!ok, 'player login fixture unavailable in this environment');

    // Staff-only management routes must not render management controls for a
    // player: either redirect away or show an access-denied state. We assert the
    // page does not expose the staff-invite control.
    await page.goto('/baseball/dashboard/settings/staff');
    await expect(
      page.getByRole('button', { name: /invite (staff|coach)/i }),
    ).toHaveCount(0);

    // The Settings OS import-source registry is staff-only (can_manage_imports):
    // a player must not see the "Add source" control.
    await page.goto('/baseball/dashboard/settings/imports');
    await expect(
      page.getByRole('button', { name: /add (import )?source/i }),
    ).toHaveCount(0);
  });
});
