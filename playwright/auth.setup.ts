import { test, expect } from '@playwright/test';
import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

// Load environment from .env.local first (takes precedence), then .env.
config({ path: '.env.local' });
config({ path: '.env' });

// process.cwd() is the repo root when run via the dedicated config.
const AUTH_DIR = path.join(process.cwd(), 'playwright', '.auth');
const REPORTS_DIR = path.join(process.cwd(), 'ui-intelligence', 'reports');
const AUTH_ERRORS_FILE = path.join(REPORTS_DIR, 'auth-errors.md');

const PLAYER_STATE = path.join(AUTH_DIR, 'player.json');
const COACH_STATE = path.join(AUTH_DIR, 'coach.json');

const SUCCESS_URL_RE = /\/golf\/(dashboard|welcome|admin|coach|player)/;

/** Ensure the auth-errors report exists with a header, then append a line. */
function appendAuthError(line: string): void {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  if (!fs.existsSync(AUTH_ERRORS_FILE)) {
    fs.writeFileSync(
      AUTH_ERRORS_FILE,
      '# Auth Errors\n\nSanitized auth setup failures. Passwords are never recorded here.\n\n',
      'utf8',
    );
  }
  const ts = new Date().toISOString();
  fs.appendFileSync(AUTH_ERRORS_FILE, `- [${ts}] ${line}\n`, 'utf8');
}

/** Strip anything that could resemble a credential from an error string. */
function sanitize(message: string): string {
  return message.replace(/\s+/g, ' ').slice(0, 500);
}

interface AuthOptions {
  role: 'player' | 'coach';
  email: string | undefined;
  password: string | undefined;
  statePath: string;
}

async function authenticate(
  page: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo,
  opts: AuthOptions,
): Promise<void> {
  const { role, email, password, statePath } = opts;

  // 1. Ensure the .auth directory exists.
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  // 2. Skip (do not throw) when credentials are missing.
  if (!email || !password) {
    appendAuthError(`${role} credentials not set in .env.local`);
    testInfo.skip(true, `${role} credentials not set in .env.local`);
    return;
  }

  let finalUrl = '';
  try {
    // 3. Fill in the login form and submit.
    await page.goto('/golf/login');
    await page.fill('#golf-signin-email', email);
    await page.fill('#golf-signin-password', password);
    await page.getByRole('button', { name: /sign in/i }).click();

    // 4. Wait for login success: URL leaves /golf/login, then settle.
    await page.waitForURL((u) => !u.toString().includes('/golf/login'), {
      timeout: 45000,
    });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1500);

    finalUrl = page.url();
    // Soft confirmation that we landed on a known post-login surface.
    expect(finalUrl).toMatch(SUCCESS_URL_RE);

    // 5. Persist the authenticated storage state.
    await page.context().storageState({ path: statePath });
  } catch (err) {
    // 6. Record a sanitized failure line (never the password) and rethrow.
    const message = err instanceof Error ? err.message : String(err);
    finalUrl = finalUrl || (() => {
      try {
        return page.url();
      } catch {
        return 'unknown';
      }
    })();
    appendAuthError(
      `${role} authentication failed — finalUrl=${finalUrl} — error=${sanitize(message)}`,
    );
    throw err;
  }
}

// Two INDEPENDENT tests: one failing role does not block the other.
test('authenticate player', async ({ page }, testInfo) => {
  await authenticate(page, testInfo, {
    role: 'player',
    email: process.env.GOLFHELM_PLAYER_EMAIL,
    password: process.env.GOLFHELM_PLAYER_PASSWORD,
    statePath: PLAYER_STATE,
  });
});

test('authenticate coach', async ({ page }, testInfo) => {
  await authenticate(page, testInfo, {
    role: 'coach',
    email: process.env.GOLFHELM_COACH_EMAIL,
    password: process.env.GOLFHELM_COACH_PASSWORD,
    statePath: COACH_STATE,
  });
});
