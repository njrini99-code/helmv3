import type { Page, Response } from '@playwright/test';

/**
 * e2e/helpers/route-health.ts — shared authenticated-route health check (#373).
 *
 * Used by e2e/baseball-route-crawler.spec.ts (which discovers routes from
 * the live DOM) and e2e/baseball-smoke.spec.ts (which asserts a fixed list
 * of routes) so both agree on what "healthy" means for an authenticated
 * BaseballHelm surface: no HTTP error, no auth-guard bounce, no wrong-sport
 * redirect, no rendered error boundary, no stuck loading spinner, and no
 * near-blank page.
 */

/** A rendered Next.js/React error boundary or 5xx error page body text. */
export const ERROR_BOUNDARY_TEXT_RE = /Application error|Internal Server Error/i;

/**
 * Minimum visible body text length below which a settled page is treated as
 * "near-blank" — rendered, but with no meaningful content, as opposed to a
 * real empty state (which still renders a heading + explanatory copy).
 */
const NEAR_BLANK_TEXT_THRESHOLD = 24;

/** How long to let a page settle after load before checking for a stuck
 * loading affordance — real content should have replaced any initial
 * skeleton/spinner well before this. */
const STUCK_SPINNER_SETTLE_MS = 1500;

export type RouteFailureReason =
  | 'http-error'
  | 'guard-bounce'
  | 'wrong-sport-redirect'
  | 'error-boundary'
  | 'stuck-spinner'
  | 'near-blank';

export interface RouteHealthResult {
  route: string;
  finalUrl: string;
  status: number | null;
  ok: boolean;
  failureReason?: RouteFailureReason;
  detail?: string;
}

export interface AssessRouteHealthOptions {
  /** The sport-scoped path prefix this crawl expects to stay within, e.g.
   * '/baseball/'. A final URL that leaves this prefix (most notably landing
   * in '/golf/') is treated as a wrong-sport redirect. */
  expectedSportPrefix: string;
  /** URL substrings that indicate an auth-guard bounce. Pass `[]` to skip
   * this check entirely (e.g. when intentionally probing an anonymous
   * session against a route that is allowed to require login). */
  loginPaths?: string[];
  /** Navigation timeout in ms. */
  navigationTimeoutMs?: number;
}

/**
 * Navigate to `route` and assess whether it rendered as a healthy
 * authenticated (or, with `loginPaths: []`, public) BaseballHelm surface.
 * Never throws on a failed navigation/assertion — failures are reported in
 * the returned result so a caller can crawl many routes and collect every
 * failure instead of stopping at the first one.
 */
export async function gotoAndAssessRouteHealth(
  page: Page,
  route: string,
  opts: AssessRouteHealthOptions,
): Promise<RouteHealthResult> {
  const { expectedSportPrefix, loginPaths = ['/login'], navigationTimeoutMs = 30000 } = opts;

  let response: Response | null = null;
  try {
    response = await page.goto(route, {
      waitUntil: 'domcontentloaded',
      timeout: navigationTimeoutMs,
    });
  } catch (err) {
    return {
      route,
      finalUrl: page.url(),
      status: null,
      ok: false,
      failureReason: 'http-error',
      detail: `navigation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

  const status = response?.status() ?? null;
  const finalUrl = page.url();

  if (status !== null && status >= 400) {
    return { route, finalUrl, status, ok: false, failureReason: 'http-error', detail: `HTTP ${status}` };
  }

  if (loginPaths.some((p) => finalUrl.includes(p))) {
    return {
      route,
      finalUrl,
      status,
      ok: false,
      failureReason: 'guard-bounce',
      detail: `bounced to ${finalUrl}`,
    };
  }

  if (!finalUrl.includes(expectedSportPrefix)) {
    return {
      route,
      finalUrl,
      status,
      ok: false,
      failureReason: 'wrong-sport-redirect',
      detail: `landed on ${finalUrl} (expected to stay within ${expectedSportPrefix})`,
    };
  }

  const bodyText = await page.locator('body').innerText().catch(() => '');
  if (ERROR_BOUNDARY_TEXT_RE.test(bodyText)) {
    return {
      route,
      finalUrl,
      status,
      ok: false,
      failureReason: 'error-boundary',
      detail: 'error boundary text visible',
    };
  }

  // Settle a bit longer, then check whether a loading affordance is still
  // spinning — real content should have replaced it by now.
  await page.waitForTimeout(STUCK_SPINNER_SETTLE_MS);
  const spinnerVisible = await page
    .locator('.animate-spin, [role="status"][aria-busy="true"]')
    .first()
    .isVisible()
    .catch(() => false);
  if (spinnerVisible) {
    return {
      route,
      finalUrl,
      status,
      ok: false,
      failureReason: 'stuck-spinner',
      detail: 'loading affordance still visible after settle',
    };
  }

  const settledText = (await page.locator('body').innerText().catch(() => '')).trim();
  if (settledText.length < NEAR_BLANK_TEXT_THRESHOLD) {
    return {
      route,
      finalUrl,
      status,
      ok: false,
      failureReason: 'near-blank',
      detail: `only ${settledText.length} chars of visible body text after settle`,
    };
  }

  return { route, finalUrl, status, ok: true };
}
