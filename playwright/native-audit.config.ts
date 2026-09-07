import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

/**
 * ============================================================================
 * iOS native-experience audit — additive WebKit lane
 * ----------------------------------------------------------------------------
 * Separate from `playwright.config.ts` on purpose. The main config's mobile
 * projects run Chromium geometry with BaseballHelm storage state; neither is
 * evidence about GolfHelm in an iPhone WebView. This lane is WebKit, GolfHelm,
 * and signed-out only.
 *
 * It is browser evidence, not shell evidence: WebKit here is not WKWebView
 * inside Capacitor, and it does not carry the `HelmSportsLabsApp` UA marker
 * that `src/proxy.ts` keys the native-route block on.
 * ========================================================================== */

const baseURL = process.env.HELM_AUDIT_BASE_URL;
const evidenceDir = process.env.HELM_AUDIT_DIR;

if (!baseURL || !evidenceDir) {
  throw new Error('Set HELM_AUDIT_BASE_URL and HELM_AUDIT_DIR explicitly.');
}

const target = new URL(baseURL);
if (!['http:', 'https:'].includes(target.protocol)) {
  throw new Error('The audit target must use HTTP or HTTPS.');
}
if (target.username || target.password) {
  throw new Error('Do not put credentials in the audit URL.');
}

export default defineConfig({
  testDir: './native-audit',
  testMatch: /(login-audit|journeys)\.spec\.ts|signed-in\.setup\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  outputDir: path.join(evidenceDir, 'webkit', 'artifacts'),
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(evidenceDir, 'webkit', 'html'), open: 'never' }],
    ['json', { outputFile: path.join(evidenceDir, 'webkit', 'results.json') }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'webkit-phone-light',
      testMatch: /login-audit\.spec\.ts/,
      use: { ...devices['iPhone 13'], browserName: 'webkit', colorScheme: 'light' },
    },
    {
      name: 'webkit-phone-dark',
      testMatch: /login-audit\.spec\.ts/,
      use: { ...devices['iPhone 13'], browserName: 'webkit', colorScheme: 'dark' },
    },
    {
      name: 'signed-in-setup',
      testMatch: /signed-in\.setup\.ts/,
      use: { ...devices['iPhone 13'], browserName: 'webkit' },
    },
    {
      // Signed-in sweep. Read-only: navigations, scrolls and measurements only.
      name: 'webkit-phone-signed-in',
      testMatch: /journeys\.spec\.ts/,
      dependencies: ['signed-in-setup'],
      use: {
        ...devices['iPhone 13'],
        browserName: 'webkit',
        colorScheme: 'light',
        storageState: process.env.HELM_AUDIT_STATE,
      },
    },
    {
      name: 'webkit-phone-reduced-motion',
      testMatch: /login-audit\.spec\.ts/,
      use: {
        ...devices['iPhone 13'],
        browserName: 'webkit',
        colorScheme: 'light',
        // The repo's spelling (e2e/accessibility.spec.ts): reducedMotion rides
        // on contextOptions here, not directly on `use`.
        contextOptions: { reducedMotion: 'reduce' },
      },
    },
  ],
});
