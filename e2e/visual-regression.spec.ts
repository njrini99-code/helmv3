import { test, expect } from '@playwright/test';

/**
 * Visual regression — anchored on the Fairway design system.
 *
 * `docs/v3-testing-standards.md` deferred visual regression "until a separate
 * tooling decision." This IS that decision: Playwright's built-in
 * `toHaveScreenshot` — zero cost, no external service.
 *
 * ADVISORY. These run inside the `chromium` project, which the Playwright
 * workflow invokes with a `|| echo` shim, so a diff never blocks a merge. It
 * surfaces intended-vs-unintended visual change in the PR report; a real diff
 * is either a regression (fix it) or an intended change (regenerate baselines).
 *
 * Baselines are OS/browser-specific and MUST be generated on the Linux CI
 * runner, never committed from macOS. Generate them with the one-click
 * "Generate visual baselines" workflow (.github/workflows/visual-baselines.yml),
 * or locally via the Playwright Docker image: `npm run test:visual:update`.
 *
 * PRIMARY target: `/fairway-preview` — the standalone, no-auth gallery of every
 * Fairway primitive. Guarding this one page guards the whole design system: any
 * change to a Fairway component or token shows up here. Golf is the reference
 * implementation; baseball must conform to the same system.
 */

interface VisualTarget {
  path: string;
  label: string;
  /** Full-page shot (true) vs. viewport only (false). */
  fullPage: boolean;
}

const TARGETS: VisualTarget[] = [
  // The design-system contract. Full page — capture every primitive/state.
  { path: '/fairway-preview', label: 'fairway-design-system-gallery', fullPage: true },
  // App-shell entry points (static forms, no auth) as secondary anchors.
  { path: '/golf/login', label: 'golf-login', fullPage: false },
  { path: '/baseball/login', label: 'baseball-login', fullPage: false },
];

test.describe('visual regression (Fairway)', () => {
  for (const target of TARGETS) {
    test(`visual — ${target.label} (${target.path})`, async ({ page }) => {
      await page.goto(target.path);

      // Let fonts/tokens/layout settle; networkidle is more reliable than a
      // hard sleep but capped so the test can't hang on analytics polling.
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      // Fonts must be ready or text metrics shift the snapshot.
      await page.evaluate(() => (document as Document & { fonts?: FontFaceSet }).fonts?.ready).catch(() => {});

      await expect(page).toHaveScreenshot(`${target.label}.png`, {
        fullPage: target.fullPage,
        // Disable CSS animations/transitions/caret so the shot is deterministic.
        animations: 'disabled',
        caret: 'hide',
        // Small tolerance for sub-pixel AA differences across runs.
        maxDiffPixelRatio: 0.02,
        // Mask third-party overlays we don't control (dev toolbar, Sentry).
        mask: [
          page.locator('[data-vercel-toolbar]'),
          page.locator('#sentry-feedback'),
          page.locator('vercel-live-feedback'),
        ],
      });
    });
  }
});
