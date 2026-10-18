import { defineConfig } from '@playwright/test';

// Clubhouse write journeys: the round from setup to submit (clubhouse-round.spec.ts) and the Calendar, Qualifiers, Team Hub,
// Settings and Messages writes (clubhouse-journeys.spec.ts), on Chromium and WebKit. LOCAL SUPABASE ONLY: each spec seeds its
// own users through the local service role, removes them after, and skips unless NEXT_PUBLIC_SUPABASE_URL is 127.0.0.1 or
// localhost. Nightly in CI (.github/workflows/clubhouse-journeys.yml) against a stack started on the runner.
//
// This config never loads .env.local (production keys) and never reuses a server it did not start. CH_BASE points it at a
// `next dev` already running against the local stack; without it, it starts one on 3100 from the current environment.
const baseURL = process.env.CH_BASE ?? 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['clubhouse-round.spec.ts', 'clubhouse-journeys.spec.ts'],
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 5 * 60_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results/clubhouse-journeys',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/clubhouse-journeys', open: 'never' }]],
  use: {
    baseURL,
    locale: 'en-US',
    // The seeded team's zone, so "today" in a spec is the app's today.
    timezoneId: 'America/New_York',
    viewport: { width: 1280, height: 860 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: process.env.CH_BASE
    ? undefined
    : {
        command: './node_modules/.bin/next dev --webpack --hostname 127.0.0.1 --port 3100',
        url: `${baseURL}/golf/login`,
        reuseExistingServer: false,
        timeout: 240_000,
        env: { NEXT_TELEMETRY_DISABLED: '1', HELM_DEV_KEEP_ROUTES: '1' },
      },
});
