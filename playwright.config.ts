import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use */
  reporter: [
    ['html'],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // baseball-smoke.spec.ts requires an authenticated storageState from
      // the `setup` project below — it must not also run anonymously here.
      // mobile-viewports.spec.ts runs only under the mobile-* projects.
      testIgnore: /baseball-smoke\.spec\.ts|mobile-viewports\.spec\.ts/,
    },

    // BaseballHelm mandatory smoke (#372) — durable per-role auth. `setup`
    // logs coach + player in once and persists storageState; the two
    // role-scoped projects below depend on it and consume the persisted
    // state instead of re-authenticating per test. See
    // playwright/baseball-auth.setup.ts and e2e/baseball-smoke.spec.ts.
    {
      name: 'setup',
      testDir: './playwright',
      testMatch: /baseball-auth\.setup\.ts/,
    },
    {
      name: 'baseball-coach',
      testMatch: /baseball-smoke\.spec\.ts/,
      grep: /@coach/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/baseball-coach.json',
      },
    },
    {
      name: 'baseball-player',
      testMatch: /baseball-smoke\.spec\.ts/,
      grep: /@player/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/baseball-player.json',
      },
    },

    // Mobile viewport regression suite (e2e/mobile-viewports.spec.ts) —
    // functional phone-width checks (no horizontal pan, no clipped controls,
    // no bottom-nav collisions) at 320/390/430px. The spec sets the exact
    // viewport per describe block; these projects supply auth context.
    {
      name: 'mobile-public',
      testMatch: /mobile-viewports\.spec\.ts/,
      grep: /@public/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-coach',
      testMatch: /mobile-viewports\.spec\.ts/,
      grep: /@coach/,
      dependencies: ['setup'],
      use: {
        // Plain viewport, NOT a mobile device descriptor: isMobile emulation
        // zooms out on overflow (innerWidth grows with content), which defeats
        // the horizontal-pan and clipping geometry checks.
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/baseball-coach.json',
      },
    },
    {
      name: 'mobile-player',
      testMatch: /mobile-viewports\.spec\.ts/,
      grep: /@player/,
      dependencies: ['setup'],
      use: {
        // Plain viewport, NOT a mobile device descriptor: isMobile emulation
        // zooms out on overflow (innerWidth grows with content), which defeats
        // the horizontal-pan and clipping geometry checks.
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/baseball-player.json',
      },
    },

    // Uncomment to test on other browsers
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  /* Run your local dev server before starting the tests. Skipped when
   * PLAYWRIGHT_BASE_URL points at an external deployment — there is nothing
   * to boot locally in that case. */
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },
});
