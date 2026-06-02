import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

// Load environment from .env.local first (takes precedence), then .env.
config({ path: '.env.local' });
config({ path: '.env' });

const BASE = process.env.GOLFHELM_BASE_URL || 'http://localhost:3000';

/**
 * Dedicated Playwright config for the UI-intelligence auth setup.
 *
 * The repo's root playwright.config.ts uses testDir './e2e', so running the
 * auth setup against it would match nothing. This isolated config points
 * testDir at the playwright/ directory (relative to this file) and matches
 * ONLY auth.setup.ts, while auto-starting (or reusing) the Next.js dev server.
 */
export default defineConfig({
  // testDir '.' is relative to THIS config file (the playwright/ directory),
  // so it matches playwright/auth.setup.ts.
  testDir: '.',
  testMatch: /auth\.setup\.ts/,
  timeout: 120000,
  reporter: [['list']],
  use: {
    baseURL: BASE,
    ...devices['Desktop Chrome'],
    // Use the system-installed Google Chrome (channel) instead of Playwright's
    // bundled headless-shell — avoids browser-build/cache mismatches in this env.
    channel: 'chrome',
    // Spread the device first, then pin the desktop viewport so it wins.
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: 'npm run dev',
    url: BASE,
    reuseExistingServer: true,
    timeout: 180000,
  },
});
