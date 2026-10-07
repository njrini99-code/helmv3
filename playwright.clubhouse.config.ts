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
    url: `${baseURL}/clubhouse-preview/popup-lab`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-presentation-fixture-only',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-presentation-fixture-only',
    },
  },
});
