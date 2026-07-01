import { Page } from '@playwright/test';

/**
 * Test user credentials.
 *
 * Credential-driven (#382): reads from env vars so this same helper can
 * authenticate as the seeded Rini University Baseball demo accounts
 * (scripts/seed-rini-baseball-demo.ts — njrini99@gmail.com / rinin376@gmail.com)
 * in a real seeded environment, while falling back to the original
 * placeholder values for environments with no seeded fixture (existing specs
 * that call loginAsCoach/loginAsPlayer continue to self-skip via their own
 * try/catch — see baseball-phase1.spec.ts's tryLogin pattern).
 *
 * Required env vars for the seeded smoke lane (e2e/baseball-stats-smoke.spec.ts):
 *   E2E_BASEBALL_COACH_EMAIL / E2E_BASEBALL_COACH_PASSWORD
 *   E2E_BASEBALL_PLAYER_EMAIL / E2E_BASEBALL_PLAYER_PASSWORD
 */
export const TEST_USERS = {
  coach: {
    email: process.env.E2E_BASEBALL_COACH_EMAIL || 'testcoach@helm.test',
    password: process.env.E2E_BASEBALL_COACH_PASSWORD || 'TestCoach123!',
  },
  player: {
    email: process.env.E2E_BASEBALL_PLAYER_EMAIL || 'testplayer@helm.test',
    password: process.env.E2E_BASEBALL_PLAYER_PASSWORD || 'TestPlayer123!',
  },
};

/**
 * Helper to log in as a coach
 */
export async function loginAsCoach(page: Page) {
  await page.goto('/baseball/login');

  await page.fill('input[name="email"]', TEST_USERS.coach.email);
  await page.fill('input[name="password"]', TEST_USERS.coach.password);
  await page.click('button[type="submit"]');

  // Wait for navigation to dashboard
  await page.waitForURL('**/dashboard/**');
}

/**
 * Helper to log in as a player
 */
export async function loginAsPlayer(page: Page) {
  await page.goto('/baseball/login');

  await page.fill('input[name="email"]', TEST_USERS.player.email);
  await page.fill('input[name="password"]', TEST_USERS.player.password);
  await page.click('button[type="submit"]');

  // Wait for navigation to dashboard
  await page.waitForURL('**/dashboard/**');
}

/**
 * Helper to log out
 */
export async function logout(page: Page) {
  // Click user menu
  await page.click('[data-testid="user-menu"]');

  // Click logout button
  await page.click('[data-testid="logout-button"]');

  // Wait for redirect to login page
  await page.waitForURL('**/login');
}

/**
 * Helper to check if user is authenticated
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  const url = page.url();
  return !url.includes('/login') && !url.includes('/signup');
}
