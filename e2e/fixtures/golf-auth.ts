import { test as base, expect, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

type GolfRole = 'player' | 'coach';
type WorkerFixtures = { golfStorageState: string | undefined };

function credentialsFor(role: GolfRole): { email?: string; password?: string } {
  if (role === 'coach') {
    return {
      email: process.env.GOLFHELM_COACH_EMAIL,
      password: process.env.GOLFHELM_COACH_PASSWORD,
    };
  }

  return {
    email: process.env.GOLFHELM_PLAYER_EMAIL ?? process.env.E2E_GOLF_EMAIL,
    password: process.env.GOLFHELM_PLAYER_PASSWORD ?? process.env.E2E_GOLF_PASSWORD,
  };
}

async function authenticate(
  browser: Browser,
  baseURL: string | undefined,
  role: GolfRole,
  statePath: string,
): Promise<string | undefined> {
  const { email, password } = credentialsFor(role);
  if (!email || !password) return undefined;

  const context = await browser.newContext({ baseURL });
  const page: Page = await context.newPage();

  try {
    await page.goto('/golf/login');
    await page.locator('#golf-signin-email').fill(email);
    await page.locator('#golf-signin-password').fill(password);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(
      (url) => url.pathname.startsWith('/golf/') && !url.pathname.endsWith('/login'),
      { timeout: 45000 },
    );

    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    await context.storageState({ path: statePath });
    return statePath;
  } finally {
    await context.close();
  }
}

function golfTestFor(role: GolfRole) {
  return base.extend<Record<never, never>, WorkerFixtures>({
    golfStorageState: [
      async ({ browser }, provideState, workerInfo) => {
        const statePath = path.join(
          process.cwd(),
          'test-results',
          '.auth',
          `golf-${role}-${workerInfo.workerIndex}.json`,
        );
        const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
        await provideState(await authenticate(browser, baseURL, role, statePath));
      },
      { scope: 'worker' },
    ],
    storageState: async ({ golfStorageState }, provideState) => {
      await provideState(golfStorageState);
    },
  });
}

export const golfPlayerTest = golfTestFor('player');
export const golfCoachTest = golfTestFor('coach');
export const hasGolfPlayerAuth = Boolean(
  (process.env.GOLFHELM_PLAYER_EMAIL ?? process.env.E2E_GOLF_EMAIL) &&
    (process.env.GOLFHELM_PLAYER_PASSWORD ?? process.env.E2E_GOLF_PASSWORD),
);
export const hasGolfCoachAuth = Boolean(
  process.env.GOLFHELM_COACH_EMAIL && process.env.GOLFHELM_COACH_PASSWORD,
);

/**
 * Gate a describe block on golf auth credentials being available.
 *
 * Locally, missing credentials is an ordinary, visible Playwright skip — most
 * contributors don't have the seeded golf account and were never meant to
 * need it for unrelated work. In CI, silently skipping is exactly the failure
 * mode this exists to close: playwright.config.ts loads `.env.local` into
 * this process before any spec is collected, so if the credential is STILL
 * missing once CI runs, it genuinely was not configured for this run, and a
 * suite gating surfaces nothing else in e2e/ covers should report that loudly
 * rather than as a permanently green "skipped".
 */
export function requireGolfAuthOrSkip(
  gate: { skip(condition: boolean, description?: string): void },
  hasAuth: boolean,
  envHint: string,
): void {
  if (!hasAuth && process.env.CI) {
    throw new Error(
      `Golf e2e credentials missing in CI (${envHint}) — refusing to silently skip. ` +
        'Set the secret(s) in the CI environment, or in .env.local for a local run.',
    );
  }
  gate.skip(!hasAuth, `Set ${envHint} to run.`);
}
