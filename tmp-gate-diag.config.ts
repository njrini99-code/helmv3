// TEMPORARY (remove before merge): reads why the presentation gate flags each finding, in CI's own browsers.
import base from './playwright.clubhouse.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...base,
  testMatch: ['tmp-gate-diag.spec.ts'],
  reporter: [['list']],
  timeout: 25 * 60_000,
  projects: [
    { name: 'diag-phone', use: { browserName: 'webkit' as const, viewport: { width: 390, height: 844 } } },
    { name: 'diag-desktop', use: { browserName: 'chromium' as const, viewport: { width: 1440, height: 900 } } },
  ],
});
