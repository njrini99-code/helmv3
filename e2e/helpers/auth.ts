import { Page } from '@playwright/test';

/**
 * Test user credentials
 * NOTE: These should be set up in your test database
 */
export const TEST_USERS = {
  coach: {
    email: 'testcoach@helm.test',
    password: 'TestCoach123!',
  },
  player: {
    email: 'testplayer@helm.test',
    password: 'TestPlayer123!',
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
