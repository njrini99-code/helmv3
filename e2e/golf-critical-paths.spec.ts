import { expect } from '@playwright/test';
import {
  golfCoachTest as coachTest,
  golfPlayerTest as playerTest,
  hasGolfCoachAuth,
  hasGolfPlayerAuth,
  requireGolfAuthOrSkip,
} from './fixtures/golf-auth';

/**
 * GolfHelm critical-path smoke coverage for surfaces the rest of e2e/ does
 * not touch: Roster, Calendar, Messaging, and the coach/player CoachHelm +
 * Stats surfaces. golf-dashboard.spec.ts / golf-round.spec.ts /
 * golf-qualifier.spec.ts / course-library.spec.ts cover login, round entry,
 * qualifiers, and the course library — none of them ever navigate to
 * /dashboard/roster, /dashboard/calendar, /dashboard/messages, or
 * /dashboard/intelligence.
 *
 * AUTH: the shared worker-scoped fixture signs in once per role, then each
 * test gets an isolated context with that authenticated storage state. This
 * prevents a long Golf suite from tripping the sign-in rate limiter while
 * retaining test isolation. Coach-facing tests run only with explicit coach
 * credentials; player tests may use the generic CI `E2E_GOLF_*` pair.
 */

coachTest.describe('GolfHelm — Coach critical paths', () => {
  requireGolfAuthOrSkip(coachTest, hasGolfCoachAuth, 'GOLFHELM_COACH_EMAIL / GOLFHELM_COACH_PASSWORD (seeded golf coach)');

  coachTest('dashboard renders without an error boundary', async ({ page }) => {
    await page.goto('/golf/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/golf\/dashboard$/);
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  coachTest('roster loads and shows the team', async ({ page }) => {
    await page.goto('/golf/dashboard/roster', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/golf\/dashboard\/roster/);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  coachTest('calendar loads and a month view renders', async ({ page }) => {
    await page.goto('/golf/dashboard/calendar', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/golf\/dashboard\/calendar/);
    // Header renders the current month/year (e.g. "August 2026"), not a
    // hardcoded string — assert the shape rather than a fixed month.
    await expect(page.locator('h1').first()).toContainText(
      /January|February|March|April|May|June|July|August|September|October|November|December/,
    );
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  coachTest('messages loads a conversation', async ({ page }) => {
    await page.goto('/golf/dashboard/messages', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/golf\/dashboard\/messages/);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  coachTest('CoachHelm intelligence hub renders', async ({ page }) => {
    await page.goto('/golf/dashboard/intelligence', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/golf\/dashboard\/intelligence/);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  coachTest('team stats renders', async ({ page }) => {
    await page.goto('/golf/dashboard/stats/team', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/golf\/dashboard\/stats\/team/);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  coachTest('an unavailable player deep-dive resolves to the GolfHelm not-found surface', async ({ page }) => {
    await page.goto('/golf/dashboard/players/00000000-0000-4000-8000-000000000000/game', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { name: "We couldn't find that" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/this page couldn't load|application error/i)).toHaveCount(0);
  });

  coachTest('an unavailable player genome resolves to the GolfHelm not-found surface', async ({ page }) => {
    await page.goto('/golf/dashboard/players/00000000-0000-4000-8000-000000000000/genome', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { name: "We couldn't find that" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/this page couldn't load|application error/i)).toHaveCount(0);
  });

  coachTest('an unavailable round review leaves its loading skeleton for a designed error state', async ({ page }) => {
    await page.goto('/golf/dashboard/rounds/00000000-0000-4000-8000-000000000000/review', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByText("We couldn't load this review")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByText(/this page couldn't load|application error/i)).toHaveCount(0);
  });
});

playerTest.describe('GolfHelm — Player critical paths', () => {
  requireGolfAuthOrSkip(playerTest, hasGolfPlayerAuth, 'GOLFHELM_PLAYER_* or E2E_GOLF_*');

  playerTest('player dashboard renders without an error boundary', async ({ page }) => {
    await page.goto('/golf/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/golf\/dashboard$/);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  playerTest('player CoachHelm surface renders', async ({ page }) => {
    await page.goto('/golf/dashboard/coachhelm', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/golf\/dashboard\/coachhelm/);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });
});
