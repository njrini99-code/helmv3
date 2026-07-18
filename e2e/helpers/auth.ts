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
 * Post-login success URL contract for BaseballHelm. Mirrors
 * playwright/baseball-auth.setup.ts's SUCCESS_URL_RE exactly: coaches land
 * on /baseball/dashboard/*, players land on /baseball/player/* — NEITHER
 * is a bare '/dashboard/' substring, which is why the old
 * `waitForURL('**\/dashboard/**')` here silently hung for the player login
 * (a player never visits a URL containing "/dashboard/").
 */
const SUCCESS_URL_RE = /\/baseball\/(dashboard|player)/;

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

  // Players land on /baseball/player/*, not /baseball/dashboard/* — use the
  // real post-login URL contract instead of the coach-only '/dashboard/' glob.
  await page.waitForURL(SUCCESS_URL_RE);
}

/**
 * The dedicated #375 e2e-fixture accounts.
 *
 * scripts/seed-baseball-e2e.ts seeds a self-contained team ("E2E Test
 * University Baseball") owned by these HARD-CODED accounts and force-resets
 * their passwords every run — the box-score / pipeline / camps specs assert
 * that team's deterministic fixtures (Riverside/Eastview games, the "Jordan
 * Hayes" pipeline candidate, the "E2E Prospect Camp").
 *
 * WHY THIS EXISTS (do not fold back into TEST_USERS): the seeded-smoke lane
 * (#382) repoints `TEST_USERS` at the Rini University Baseball DEMO coach via
 * E2E_BASEBALL_COACH_EMAIL. When that env var is set (as it is in CI),
 * `loginAsCoach`/`loginAsPlayer` log into the Rini demo team — NOT the
 * "E2E Test University" team the #375 fixtures live on — so every #375-fixture
 * assertion saw an empty/foreign team and failed (pipeline board empty,
 * seeded games absent). These credential-pinned helpers keep the #375 lane
 * pointed at its own seeded team regardless of the demo-lane env override.
 * Keep the values in sync with COACH_EMAIL/PASSWORD + PLAYER_EMAIL/PASSWORD in
 * scripts/seed-baseball-e2e.ts.
 */
export const E2E_FIXTURE_USERS = {
  coach: { email: 'testcoach@helm.test', password: 'TestCoach123!' },
  player: { email: 'testplayer@helm.test', password: 'TestPlayer123!' },
} as const;

/** Log in as the #375 seed's dedicated fixture COACH (testcoach@helm.test). */
export async function loginAsFixtureCoach(page: Page) {
  await page.goto('/baseball/login');
  await page.fill('input[name="email"]', E2E_FIXTURE_USERS.coach.email);
  await page.fill('input[name="password"]', E2E_FIXTURE_USERS.coach.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard/**');
}

/** Log in as the #375 seed's dedicated fixture PLAYER (testplayer@helm.test). */
export async function loginAsFixturePlayer(page: Page) {
  await page.goto('/baseball/login');
  await page.fill('input[name="email"]', E2E_FIXTURE_USERS.player.email);
  await page.fill('input[name="password"]', E2E_FIXTURE_USERS.player.password);
  await page.click('button[type="submit"]');
  // Players land on /baseball/player/*, coaches on /baseball/dashboard/* — use
  // the shared post-login URL contract (mirrors loginAsPlayer above).
  await page.waitForURL(SUCCESS_URL_RE);
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
