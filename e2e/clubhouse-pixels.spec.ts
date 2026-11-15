import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { GATE_SCREENS } from './clubhouse-gate/screens';

/**
 * Pixel regression on the gate screens: every phone screen in WebKit at 390 and every desktop screen in Chromium at 1440,
 * light and dark, compared pixel for pixel with baselines rendered on the same OS and browser build.
 *
 * Baselines are never committed and never made on a PR. The nightly presentation run on `main` renders them
 * (`--update-snapshots=all`) and uploads the `clubhouse-pixel-baselines` artifact; a PR run downloads the newest one and
 * compares, advisory, uploading every diff image. A Mac and a Linux runner do not render alike, so a local comparison
 * needs local baselines:
 *
 *   CH_QUALITY=1 CH_PIXELS=1 CH_VISUAL_BASELINES=<dir> CH_BASE=http://127.0.0.1:3100 \
 *     npx playwright test -c playwright.clubhouse.config.ts --project pixels-phone --project pixels-desktop [--update-snapshots=all]
 */
test.skip(process.env.CH_QUALITY !== '1' || process.env.CH_PIXELS !== '1', 'Use CH_QUALITY=1 CH_PIXELS=1 with playwright.clubhouse.config.ts.');

// Motion is stopped and the dev indicator hidden; the theme is set the way the gate sets it, so these frames are the
// same frames the presentation gate measures.
const FREEZE = 'nextjs-portal { display: none !important; } *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; caret-color: transparent !important; }';

for (const screen of GATE_SCREENS) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${screen.lane} ${screen.id} ${theme} @pixels`, async ({ page }, info) => {
      const phone = page.viewportSize()!.width <= 820;
      test.skip(phone ? !screen.phone : !screen.desktop, 'Not on this size');
      const name = `${screen.id}-${theme}.png`;
      const updating = info.config.updateSnapshots === 'all' || info.config.updateSnapshots === 'changed';
      test.skip(!updating && !existsSync(info.snapshotPath(name)), `No baseline yet for ${name}: the nightly run on main renders them.`);
      const response = await page.goto(screen.path, { waitUntil: 'load' }).catch(() => page.goto(screen.path, { waitUntil: 'load' }));
      expect(response?.status(), `${screen.path} did not render`).toBe(200);
      if (screen.tap && phone) await page.locator(screen.tap).first().click();
      await page.addStyleTag({ content: FREEZE });
      await page.evaluate((t) => document.documentElement.setAttribute('data-fw-theme', t), theme);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('[data-ui="clubhouse"]').first()).toBeVisible();
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.locator('.ch-root[data-hydrated]').first().waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {});
      await page.evaluate(() => { for (const a of document.getAnimations()) a.finish?.(); });
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      // Live clocks and "n minutes ago" read the fixture's frozen time, so a frame is stable run to run.
      await expect(page).toHaveScreenshot(name, { fullPage: true, animations: 'disabled', caret: 'hide', maxDiffPixels: 0 });
    });
  }
}
