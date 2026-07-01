/**
 * e2e/baseball-smoke.spec.ts — BaseballHelm mandatory smoke suite (#372).
 *
 * Unlike baseball-phase1.spec.ts, this spec is NEVER self-skipping: it does
 * not check `PLAYWRIGHT_BASEBALL_SEEDED` and has no `test.skip()` escape
 * hatch. It relies entirely on the `baseball-coach` / `baseball-player`
 * Playwright projects (see playwright.config.ts), which depend on the
 * `setup` project (playwright/baseball-auth.setup.ts) for a persisted,
 * authenticated storageState.
 *
 * If seeded auth is missing in CI, `baseball-auth.setup.ts` THROWS — failing
 * the whole job loudly — rather than this spec quietly skipping to a false
 * green. Locally (no `CI` / `PLAYWRIGHT_BASEBALL_REQUIRED`), the setup
 * project may skip when credentials are unset, and these projects then have
 * no tests to run for that role.
 *
 * Required env vars (see e2e/README.md "BaseballHelm mandatory smoke"):
 *   E2E_BASEBALL_COACH_EMAIL    / E2E_BASEBALL_COACH_PASSWORD
 *   E2E_BASEBALL_PLAYER_EMAIL   / E2E_BASEBALL_PLAYER_PASSWORD
 *
 * Tests are tagged `@coach` / `@player` so the matching Playwright project
 * (which carries the matching role's storageState) grep-selects only its own
 * describe block — a player-context test must never run with coach
 * storageState and vice versa.
 */
import { test, expect, type Page } from '@playwright/test';
import { waitForPageLoad } from './helpers/common';

interface RenderOptions {
  /** Asserted via getByRole('heading', { name }) — use when the route has a
   * stable, non-dynamic heading. Omit for routes whose heading is dynamic
   * (e.g. a player's name) and fall back to "any heading is visible". */
  headingPattern?: RegExp;
  /** Asserted via expect(page).toHaveTitle() — useful for routes (like
   * Calendar) that don't render a top-level <h1>/<h2> at all. */
  titlePattern?: RegExp;
}

/** Navigate to `route` and assert it rendered as an authenticated surface:
 * no bounce to /login, no hard error, and the expected heading/title. */
async function expectAuthenticatedSurface(
  page: Page,
  route: string,
  opts: RenderOptions = {},
): Promise<void> {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await waitForPageLoad(page).catch(() => {});

  expect(page.url(), `expected ${route} to render without bouncing to /login`).not.toContain(
    '/login',
  );
  await expect(page.locator('body')).not.toContainText(
    /Application error|Internal Server Error/i,
  );

  if (opts.titlePattern) {
    await expect(page).toHaveTitle(opts.titlePattern);
  }

  const heading = opts.headingPattern
    ? page.getByRole('heading', { name: opts.headingPattern })
    : page.locator('h1, h2, [role="heading"]').first();
  await expect(heading.first()).toBeVisible({ timeout: 15000 });
}

test.describe('BaseballHelm mandatory smoke — coach context', { tag: '@coach' }, () => {
  test('Command Center renders for the coach', async ({ page }) => {
    await expectAuthenticatedSurface(page, '/baseball/dashboard/command-center', {
      headingPattern: /Command Center/i,
    });
  });

  test('Calendar renders for the coach', async ({ page }) => {
    await expectAuthenticatedSurface(page, '/baseball/dashboard/calendar', {
      titlePattern: /Calendar/i,
    });
  });

  test('Roster renders for the coach', async ({ page }) => {
    await expectAuthenticatedSurface(page, '/baseball/dashboard/roster', {
      headingPattern: /Team Roster/i,
    });
  });

  test('Stats Center renders for the coach', async ({ page }) => {
    await expectAuthenticatedSurface(page, '/baseball/dashboard/stats-center', {
      headingPattern: /Stats Center/i,
    });
  });

  // NOTE: the Performance route additionally requires can_manage_lifting OR
  // can_view_readiness on the active team (else it redirects coaches to
  // Command Center) — the head-coach role seeded by seed-baseball-demo.ts is
  // expected to hold these by default. If a future role-preset change
  // revokes them, this test will start failing the heading assertion instead
  // of silently passing, which is the desired "fail loud" behavior.
  test('Performance (staff lift surface) renders for the coach', async ({ page }) => {
    await expectAuthenticatedSurface(page, '/baseball/dashboard/performance', {
      headingPattern: /Performance/i,
    });
  });

  test('Settings renders for the coach', async ({ page }) => {
    await expectAuthenticatedSurface(page, '/baseball/dashboard/settings', {
      headingPattern: /Settings/i,
    });
  });
});

test.describe('BaseballHelm mandatory smoke — player context', { tag: '@player' }, () => {
  test('Player Today renders for the player', async ({ page }) => {
    await expectAuthenticatedSurface(page, '/baseball/player/today');
  });

  test('Calendar renders read-only for the player', async ({ page }) => {
    await expectAuthenticatedSurface(page, '/baseball/dashboard/calendar', {
      titlePattern: /Calendar/i,
    });
  });

  test('Roster renders for the player', async ({ page }) => {
    await expectAuthenticatedSurface(page, '/baseball/dashboard/roster', {
      headingPattern: /Team Roster/i,
    });
  });

  test('My Stats renders for the player', async ({ page }) => {
    await expectAuthenticatedSurface(page, '/baseball/dashboard/my-stats');
  });

  test('Player Lift surface renders for the player', async ({ page }) => {
    await expectAuthenticatedSurface(page, '/baseball/dashboard/lift', {
      headingPattern: /Lift/i,
    });
  });

  test('Settings renders for the player', async ({ page }) => {
    await expectAuthenticatedSurface(page, '/baseball/dashboard/settings', {
      headingPattern: /Settings/i,
    });
  });

  // Denied-capability assertion: Command Center is coach-only
  // (src/app/baseball/(dashboard)/dashboard/command-center/page.tsx redirects
  // any session without a `coach` profile straight to Player Today). A
  // player landing on Command Center — instead of being bounced — would be a
  // real authorization regression, so this must fail loudly, not skip.
  test('player is denied the coach-only Command Center and redirected to Player Today', async ({
    page,
  }) => {
    await page.goto('/baseball/dashboard/command-center', { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page).catch(() => {});
    await expect(page).toHaveURL(/\/baseball\/player\/today/);
  });
});
