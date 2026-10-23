import { defineConfig } from '@playwright/test';
import path from 'node:path';

// Presentation fixtures require development mode and never authenticate or seed data.
// CH_BASE allows a separately started next dev server. It is not a production audit.
const baseURL = process.env.CH_BASE ?? 'http://127.0.0.1:3100';
const visual = process.env.CH_VISUAL === '1';
if (process.env.CH_CAPTURE_DIR && (process.env.CI || visual)) {
  throw new Error('CH_CAPTURE_DIR is for local candidate review only; cannot be combined with CI or visual comparison.');
}
if (visual && !process.env.CH_VISUAL_BASELINES) {
  throw new Error('CH_VISUAL=1 requires CH_VISUAL_BASELINES: a reviewed baseline directory for this OS and browser version. Screenshots are not committed.');
}
export default defineConfig({
  testDir: './e2e',
  testMatch: ['clubhouse-quality.spec.ts', 'clubhouse-playground.spec.ts'],
  // Compiles every route the suite opens before the first test (see the setup file); the server keeps them compiled.
  globalSetup: './e2e/clubhouse-quality.setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000, toHaveScreenshot: { animations: 'disabled', maxDiffPixels: 0 } },
  updateSnapshots: 'none',
  snapshotPathTemplate: path.resolve(process.env.CH_VISUAL_BASELINES ?? '.helm/screenshots/clubhouse/quality-baselines', '{projectName}', '{arg}{ext}'),
  outputDir: 'test-results/clubhouse-quality',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/clubhouse-quality', open: 'never' }]],
  use: {
    baseURL,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: ['chromium', 'webkit'].flatMap((browserName) =>
    (['no-preference', 'reduce'] as const).map((reducedMotion) => ({
      name: `${browserName}-${reducedMotion}`,
      use: { browserName: browserName as 'chromium' | 'webkit', reducedMotion },
    })),
  ),
  webServer: process.env.CH_BASE ? undefined : {
    command: './node_modules/.bin/next dev --webpack --hostname 127.0.0.1 --port 3100',
    // Ready means "the server answers", not "the popup lab has compiled": a static file answers in about 50 ms once the
    // server is up, while the popup lab's first request compiles the app (101 s on two cores, over 180 s on a CI runner on
    // 2026-10-22, which timed this wait out). The setup file compiles the routes, with a timeout and retries of its own.
    url: `${baseURL}/manifest.json`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      HELM_DEV_KEEP_ROUTES: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-presentation-fixture-only',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-presentation-fixture-only',
    },
  },
});
