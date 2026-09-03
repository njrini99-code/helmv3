/**
 * e2e/fixtures/sentry-snapshot-helpers.ts — shared capture plumbing for
 * e2e/sentry-snapshots.spec.ts (public + golf player) and
 * e2e/sentry-snapshots-baseball.spec.ts (baseball coach + player).
 *
 * Deliberately NOT a new screenshot renderer. Every piece here is lifted
 * from, or is the smallest possible generalization of, code already shipped
 * in this repo:
 *   - VIEWPORTS: e2e/visual-audit.spec.ts's phone/desktop pair.
 *   - freezeAnimations: the CSS override from
 *     scripts/ui-intelligence/capture-desktop-screenshots.ts (that pipeline
 *     itself is NOT invoked here — its route list, routes/routes.json, is
 *     gitignored and absent from a fresh checkout, and it is desktop-only).
 *   - settleAndCapture: visual-audit.spec.ts's settleForCapture, generalized
 *     to a named (not index-based) output file. Filenames are the diff key
 *     Sentry Snapshots uses to match head against base — see
 *     docs/observability/SENTRY_SNAPSHOTS.md — so every call site passes a
 *     stable, hand-written name, never a loop index or discovered route.
 *
 * DATA CAPTURE, NOT ASSERTIONS, same contract as visual-audit.spec.ts:
 * settleAndCapture never throws on a slow or partially-broken page — a
 * genuinely broken route still produces the best screenshot it can, because
 * the alternative (a hard assertion per page) would need a hand-verified
 * content landmark for every one of ~15 routes across two products, and a
 * landmark that drifts (a renamed heading, a moved aria-label) would fail
 * this whole advisory job instead of just producing a screenshot a human
 * diff review catches. The two callers still gate on their own login/entry
 * checks (baseball via storageState + this repo's fail-loud
 * playwright/baseball-auth.setup.ts under CI; golf via `golfPlayerTest`'s
 * `hasGolfPlayerAuth` skip) — this file only owns per-route capture.
 *
 * STRICTLY READ-ONLY: callers must only navigate and screenshot. Nothing in
 * this file clicks a submit/send/start/resume control.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

export const OUTPUT_DIR = path.join(process.cwd(), 'test-results', 'sentry-snapshots');

export const VIEWPORTS = [
  { name: 'mobile', size: { width: 390, height: 844 } },
  { name: 'desktop', size: { width: 1440, height: 900 } },
] as const;
export type ViewportName = (typeof VIEWPORTS)[number]['name'];

const NAV_TIMEOUT_MS = 30_000;
/** Settle window after navigation, before the shot — long enough for this
 * codebase's entrance glide/settle motion to finish under freezeAnimations
 * (which kills the RUNNING transition, not a delay the app itself applies
 * before mounting content) and for a first data fetch to land. Mirrors
 * visual-audit.spec.ts's ENTRANCE_SETTLE_MS, widened slightly because these
 * routes are hit cold (no prior warm navigation in the same test). */
const SETTLE_MS = 900;

/**
 * Force every CSS transition/animation to zero duration. Lifted verbatim
 * (comment aside) from scripts/ui-intelligence/capture-desktop-screenshots.ts
 * freezeAnimations — the one existing helper in this repo that guarantees a
 * motion-free frame regardless of whether a given component happens to gate
 * its animation on `prefers-reduced-motion`. Used ALONGSIDE, not instead of,
 * `page.emulateMedia({ reducedMotion: 'reduce' })`: the media query still
 * matters for JS that branches on `matchMedia('(prefers-reduced-motion)')`
 * rather than relying on CSS duration alone (see e2e/mobile-viewports.spec.ts
 * and e2e/accessibility.spec.ts for that same pairing convention).
 */
export async function freezeAnimations(page: Page): Promise<void> {
  await page
    .addStyleTag({
      content:
        '*,*::before,*::after{transition-duration:0s !important;animation-duration:0s !important;animation-delay:0s !important;}',
    })
    .catch(() => {});
}

/**
 * Best-effort masking of anything that looks like a live clock/timestamp, so
 * a snapshot taken at 09:14 doesn't diff against one taken at 09:15 on pure
 * text drift. Deliberately broad and deliberately allowed to match zero
 * elements on a given page (Playwright's `mask` accepts an empty-result
 * locator without error) — this is a cheap net, not a per-page audit of
 * every dynamic field. Real content drift from mutable account data (see
 * docs/observability/SENTRY_SNAPSHOTS.md "Determinism rules") is the
 * documented residual risk this does not close.
 */
export function dynamicContentMask(page: Page) {
  return page.locator('time, [datetime], [data-live-clock], [data-testid*="relative-time"]');
}

/** Navigate to `route`, settle deterministically, and save a full-page
 * screenshot to `<OUTPUT_DIR>/<name>-<viewport>.png`. Never throws — see
 * file header "DATA CAPTURE, NOT ASSERTIONS". Returns whether the shot was
 * produced, so a caller can log a soft warning without failing the job. */
export async function settleAndCapture(
  page: Page,
  route: string,
  name: string,
  viewport: (typeof VIEWPORTS)[number],
): Promise<{ captured: boolean; error?: string }> {
  await page.setViewportSize(viewport.size);
  await page.emulateMedia({ reducedMotion: 'reduce' }).catch(() => {});

  try {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
  } catch (err) {
    return { captured: false, error: err instanceof Error ? err.message : String(err) };
  }

  await freezeAnimations(page);
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page
    .evaluate(() => (document.fonts ? document.fonts.ready.then(() => undefined) : undefined))
    .catch(() => {});
  await page.waitForTimeout(SETTLE_MS);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const filePath = path.join(OUTPUT_DIR, `${name}-${viewport.name}.png`);
  try {
    await page.screenshot({
      path: filePath,
      fullPage: true,
      mask: [dynamicContentMask(page)],
    });
    return { captured: true };
  } catch (err) {
    return { captured: false, error: err instanceof Error ? err.message : String(err) };
  }
}
