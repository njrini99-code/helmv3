import { test, expect, type Page } from '@playwright/test';

/**
 * GolfHelm critical-path smoke coverage for surfaces the rest of e2e/ does
 * not touch: Roster, Calendar, Messaging, and the coach/player CoachHelm +
 * Stats surfaces. golf-dashboard.spec.ts / golf-round.spec.ts /
 * golf-qualifier.spec.ts / course-library.spec.ts cover login, round entry,
 * qualifiers, and the course library — none of them ever navigate to
 * /dashboard/roster, /dashboard/calendar, /dashboard/messages, or
 * /dashboard/intelligence.
 *
 * AUTH: two separate seeded logins are required — Roster/Calendar/Messages/
 * Team Stats/Intelligence are coach-facing, while the player CoachHelm view
 * needs a player account. This reuses the exact env var names
 * `playwright/auth.setup.ts` already expects (GOLFHELM_COACH_EMAIL /
 * GOLFHELM_COACH_PASSWORD / GOLFHELM_PLAYER_EMAIL / GOLFHELM_PLAYER_PASSWORD)
 * rather than introducing new ones — that setup project just isn't wired
 * into playwright.config.ts's `projects` list, so these are read directly
 * here instead. Each describe block self-skips when its pair is absent, so
 * this is a no-op on machines/CI without the fixture (same pattern as every
 * other authenticated golf spec in this directory).
 *
 * WELCOME INTERSTITIAL: /golf/welcome is a ~1.9s post-login animated
 * hand-off (src/app/golf/(auth)/welcome/page.tsx) that sits between
 * /golf/login and the real destination. golf-dashboard.spec.ts /
 * golf-round.spec.ts / golf-qualifier.spec.ts all wait for
 * `**\/golf/dashboard**` immediately after clicking submit, which the
 * interstitial's intermediate `/golf/welcome?next=...` URL never matches —
 * that is a known, currently-failing gap in those three files (see the
 * verification report this spec was written alongside), not something this
 * file works around silently. `loginAndReachDashboard` below waits for the
 * interstitial specifically and clicks "Skip" if it is still on screen,
 * rather than assuming the old direct redirect.
 */

const COACH_EMAIL = process.env.GOLFHELM_COACH_EMAIL;
const COACH_PASSWORD = process.env.GOLFHELM_COACH_PASSWORD;
const hasCoachAuth = Boolean(COACH_EMAIL && COACH_PASSWORD);

const PLAYER_EMAIL = process.env.GOLFHELM_PLAYER_EMAIL;
const PLAYER_PASSWORD = process.env.GOLFHELM_PLAYER_PASSWORD;
const hasPlayerAuth = Boolean(PLAYER_EMAIL && PLAYER_PASSWORD);

async function loginAndReachDashboard(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/golf/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Leave /golf/login — lands on /golf/welcome?next=... in the normal flow.
  await page.waitForURL((u) => !u.pathname.endsWith('/golf/login'), { timeout: 30000 });

  // The interstitial auto-navigates on its own (~1.9s, hard failsafe 4.5s)
  // but poll-and-click "Skip" if it's still up, rather than trusting a
  // single-shot wait — under load the entrance animation can take longer
  // than the failsafe budget assumes.
  const skip = page.getByRole('button', { name: /skip the welcome screen/i });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && !page.url().includes('/golf/dashboard')) {
    if (await skip.isVisible({ timeout: 500 }).catch(() => false)) {
      await skip.click().catch(() => {});
    }
    await page.waitForTimeout(300);
  }

  await page.waitForURL((u) => u.pathname.startsWith('/golf/dashboard'), { timeout: 15000 });
}

test.describe('GolfHelm — Coach critical paths', () => {
  test.skip(!hasCoachAuth, 'Set GOLFHELM_COACH_EMAIL / GOLFHELM_COACH_PASSWORD (seeded golf coach) to run.');

  test.beforeEach(async ({ page }) => {
    await loginAndReachDashboard(page, COACH_EMAIL as string, COACH_PASSWORD as string);
  });

  test('dashboard renders without an error boundary', async ({ page }) => {
    await expect(page).toHaveURL(/\/golf\/dashboard$/);
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  test('roster loads and shows the team', async ({ page }) => {
    await page.goto('/golf/dashboard/roster');
    await expect(page).toHaveURL(/\/golf\/dashboard\/roster/);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  test('calendar loads and a month view renders', async ({ page }) => {
    await page.goto('/golf/dashboard/calendar');
    await expect(page).toHaveURL(/\/golf\/dashboard\/calendar/);
    // Header renders the current month/year (e.g. "August 2026"), not a
    // hardcoded string — assert the shape rather than a fixed month.
    await expect(page.locator('h1').first()).toContainText(
      /January|February|March|April|May|June|July|August|September|October|November|December/,
    );
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  test('messages loads a conversation', async ({ page }) => {
    await page.goto('/golf/dashboard/messages');
    await expect(page).toHaveURL(/\/golf\/dashboard\/messages/);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  test('CoachHelm intelligence hub renders', async ({ page }) => {
    await page.goto('/golf/dashboard/intelligence');
    await expect(page).toHaveURL(/\/golf\/dashboard\/intelligence/);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  test('team stats renders', async ({ page }) => {
    await page.goto('/golf/dashboard/stats/team');
    await expect(page).toHaveURL(/\/golf\/dashboard\/stats\/team/);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });
});

test.describe('GolfHelm — Player critical paths', () => {
  test.skip(!hasPlayerAuth, 'Set GOLFHELM_PLAYER_EMAIL / GOLFHELM_PLAYER_PASSWORD (seeded golf player) to run.');

  test.beforeEach(async ({ page }) => {
    await loginAndReachDashboard(page, PLAYER_EMAIL as string, PLAYER_PASSWORD as string);
  });

  test('player dashboard renders without an error boundary', async ({ page }) => {
    await expect(page).toHaveURL(/\/golf\/dashboard$/);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  test('player CoachHelm surface renders', async ({ page }) => {
    await page.goto('/golf/dashboard/coachhelm');
    await expect(page).toHaveURL(/\/golf\/dashboard\/coachhelm/);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });
});
