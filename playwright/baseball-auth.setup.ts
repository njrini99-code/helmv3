/**
 * playwright/baseball-auth.setup.ts — BaseballHelm auth setup (#372).
 *
 * Mirrors playwright/auth.setup.ts (Golf): logs each role in once against the
 * real login form and persists the authenticated storageState so the
 * `baseball-coach` / `baseball-player` Playwright projects (see
 * playwright.config.ts) can reuse it via `dependencies: ['setup']` instead of
 * re-logging-in for every test.
 *
 * Required env vars (see e2e/README.md "BaseballHelm mandatory smoke"):
 *   E2E_BASEBALL_COACH_EMAIL    / E2E_BASEBALL_COACH_PASSWORD
 *   E2E_BASEBALL_PLAYER_EMAIL   / E2E_BASEBALL_PLAYER_PASSWORD
 * Run `npm run seed:baseball:ci` first so these accounts actually exist (the
 * shipped demo seed creates demo-coach@baseballhelmdemo.com /
 * demo-player@baseballhelmdemo.com / BaseballDemo2026 — see
 * scripts/seed-baseball-demo.ts).
 *
 * FAIL-LOUD BEHAVIOR (diverges from Golf's graceful skip): the whole point of
 * #372 is that the mandatory baseball smoke suite can no longer be silently
 * no-op'd in CI. So when `CI` is set, or `PLAYWRIGHT_BASEBALL_REQUIRED` is
 * truthy, missing credentials or a failed login THROW — failing the build —
 * instead of skipping. Locally, without those flags, missing creds skip
 * gracefully so a dev without the baseball seed can still run the rest of
 * `npm run test:e2e`.
 */
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

// Load environment from .env.local first (takes precedence), then .env.
config({ path: '.env.local' });
config({ path: '.env' });

// process.cwd() is the repo root when run via the root playwright.config.ts.
const AUTH_DIR = path.join(process.cwd(), 'playwright', '.auth');
const COACH_STATE = path.join(AUTH_DIR, 'baseball-coach.json');
const PLAYER_STATE = path.join(AUTH_DIR, 'baseball-player.json');

const SUCCESS_URL_RE = /\/baseball\/(dashboard|player)/;

const REQUIRED =
  !!process.env.CI || /^(1|true)$/i.test(process.env.PLAYWRIGHT_BASEBALL_REQUIRED ?? '');

interface AuthOptions {
  role: 'coach' | 'player';
  email: string | undefined;
  password: string | undefined;
  statePath: string;
}

function missingCredsMessage(role: 'coach' | 'player'): string {
  const upper = role.toUpperCase();
  return (
    `Baseball seeded auth missing — set E2E_BASEBALL_${upper}_EMAIL / ` +
    `E2E_BASEBALL_${upper}_PASSWORD and run \`npm run seed:baseball:ci\`.`
  );
}

async function authenticate(
  page: Page,
  testInfo: TestInfo,
  opts: AuthOptions,
): Promise<void> {
  const { role, email, password, statePath } = opts;

  fs.mkdirSync(AUTH_DIR, { recursive: true });

  // Missing credentials: fail loudly in CI / when explicitly required,
  // otherwise skip so local devs without the baseball seed are not blocked.
  if (!email || !password) {
    const message = missingCredsMessage(role);
    if (REQUIRED) throw new Error(message);
    testInfo.skip(true, message);
    return;
  }

  await page.goto('/baseball/login');
  await page.fill('#baseball-signin-email', email);
  await page.fill('#baseball-signin-password', password);
  await page.getByRole('button', { name: /sign in/i }).click();

  try {
    // Wait for login success: URL leaves /baseball/login, then settle.
    await page.waitForURL((u) => !u.toString().includes('/baseball/login'), {
      timeout: 45000,
    });
    await page.waitForLoadState('networkidle').catch(() => {});

    const finalUrl = page.url();
    expect(
      finalUrl,
      `expected ${role} login to land on an authenticated baseball surface`,
    ).toMatch(SUCCESS_URL_RE);

    // Persist the authenticated storage state for the dependent projects.
    await page.context().storageState({ path: statePath });
  } catch (err) {
    // A login FAILURE (as opposed to missing creds, handled above) always
    // throws — even locally — since it points at a real regression rather
    // than "no seed configured on this machine".
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Baseball ${role} login failed at finalUrl=${page.url()}: ${detail}`,
    );
  }
}

// Two INDEPENDENT tests: one failing role does not block the other.
test('authenticate baseball coach', async ({ page }, testInfo) => {
  await authenticate(page, testInfo, {
    role: 'coach',
    email: process.env.E2E_BASEBALL_COACH_EMAIL,
    password: process.env.E2E_BASEBALL_COACH_PASSWORD,
    statePath: COACH_STATE,
  });
});

test('authenticate baseball player', async ({ page }, testInfo) => {
  await authenticate(page, testInfo, {
    role: 'player',
    email: process.env.E2E_BASEBALL_PLAYER_EMAIL,
    password: process.env.E2E_BASEBALL_PLAYER_PASSWORD,
    statePath: PLAYER_STATE,
  });
});
