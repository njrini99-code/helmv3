/**
 * e2e/visual-audit.spec.ts — production visual-audit screenshot crawl.
 *
 * Runs under the same `baseball-coach` / `baseball-player` Playwright
 * projects (see playwright.config.ts) that e2e/baseball-route-crawler.spec.ts
 * uses — this is NOT a new auth mechanism. It reuses that spec's proven
 * discovery pattern (visible `<nav> a[href]` links from the LIVE RENDERED
 * DOM — covers both FairwaySidebar's `aria-label="Main navigation"` rail,
 * whose link list itself renders inside a nested `<nav aria-label="Sections">`,
 * and any hub-sub-nav strip, e.g.
 * src/app/baseball/(dashboard)/_components/hub-sub-nav.tsx, since both are
 * real `<Link>`s inside a `<nav>` element — never nav-registry source) and
 * its best-effort public-sample-link discovery, but instead of asserting
 * route health it captures full-page screenshots of every discovered route
 * at two viewports (390x844 phone, 1440x900 desktop) plus a manifest of
 * per-route capture metadata.
 *
 * THIS IS DATA CAPTURE, NOT ASSERTIONS. A route that renders an error
 * boundary, a stuck spinner, or a near-blank page still gets a screenshot
 * and a manifest entry — that is the whole point of a visual audit, a human
 * (or a follow-up review pass) looks at the images. The spec only fails the
 * build on:
 *   1. LOGIN FAILURE — the authenticated storageState didn't actually hold
 *      (entry route bounces to /login), or the session dies mid-crawl
 *      (any subsequent route bounces to /login).
 *   2. TOTAL NAVIGATION FAILURE — the entry route itself couldn't be
 *      reached at all, no nav links were discoverable at all (the shell
 *      never rendered), or every single discovered route failed to
 *      navigate (0 screenshots produced out of N attempts).
 * Anything short of that — a single broken route, console errors, a slow
 * load — is recorded in the manifest and the crawl keeps going.
 *
 * GATED behind `VISUAL_AUDIT=1` (test.skip otherwise) so this never runs in
 * the normal e2e lane — see playwright.config.ts's `chromium` project
 * testIgnore and the `baseball-coach`/`baseball-player` projects' testMatch,
 * and .github/workflows/visual-audit.yml (the only place this is invoked).
 *
 * Output layout (see writeManifest / captureRouteAllViewports below):
 *   test-results/visual-audit/<role>/<viewport>/<NNN>-<route-slug>.png
 *   test-results/visual-audit/<role>/manifest.json
 * `<role>` is 'coach' or 'player'; the signed-out public/publics capture
 * (/baseball, /baseball/login, + up to 3 best-effort public sample links
 * discovered from that role's authenticated crawl) is appended to the SAME
 * role's file set and manifest, continuing the index sequence, matching
 * baseball-route-crawler.spec.ts's per-role anonymous-verify structure.
 */
import { test, type Page, type Response, type ConsoleMessage } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const REPORT_DIR = path.join(process.cwd(), 'test-results', 'visual-audit');

/** Cap on how many best-effort public sample routes to capture per role —
 * mirrors baseball-route-crawler.spec.ts's MAX_PUBLIC_SAMPLES; this is a
 * representative sample, not an exhaustive crawl of every public profile. */
const MAX_PUBLIC_SAMPLES = 3;

const PUBLIC_SAMPLE_RE = /^\/baseball\/(player|team|program)\/[^/?#]+$|^\/baseball\/packet\/[^/?#]+$/;

/** Always captured signed-out, regardless of what a given crawl discovers. */
const ALWAYS_PUBLIC_ROUTES = ['/baseball', '/baseball/login'] as const;

const VIEWPORTS = [
  { name: 'phone', size: { width: 390, height: 844 } },
  { name: 'desktop', size: { width: 1440, height: 900 } },
] as const;
type ViewportName = (typeof VIEWPORTS)[number]['name'];

/** Settle window after navigation before the fullPage shot — long enough for
 * entrance transitions (this codebase's cinematic glide/settle motion, see
 * design-system-living-annual.md) to finish, short enough to keep a
 * many-route crawl tractable in CI. */
const ENTRANCE_SETTLE_MS = 600;
/** Settle window after each scroll step (bottom, then back to top) — gives
 * IntersectionObserver-gated lazy content a chance to mount before the shot. */
const SCROLL_SETTLE_MS = 400;
const NAV_TIMEOUT_MS = 30000;

interface RouteCapture {
  index: number;
  route: string;
  authRequired: boolean;
  files: Partial<Record<ViewportName, string>>;
  status: Partial<Record<ViewportName, number | null>>;
  loadMs: Partial<Record<ViewportName, number>>;
  navError: Partial<Record<ViewportName, string>>;
  consoleErrorCount: number;
}

/** Total-navigation-failure signal for the whole crawl (not a single route). */
class VisualAuditFailure extends Error {}

function slugifyRoute(route: string): string {
  const cleaned = route.replace(/[#?].*$/, '').replace(/^\//, '');
  const slug = cleaned
    .toLowerCase()
    .replace(/\//g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'root';
}

/** Visible `<nav>` links, deduped, same-origin, baseball-scoped. Excludes
 * hash-only fragments, query strings, and sign-out/logout controls (which
 * would end the session mid-crawl). Identical discovery contract to
 * baseball-route-crawler.spec.ts's discoverVisibleNavLinks. */
async function discoverVisibleNavLinks(page: Page): Promise<string[]> {
  const hrefs = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('nav a[href]')) as HTMLAnchorElement[];
    return anchors
      .filter((a) => {
        const style = getComputedStyle(a);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const r = a.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((a) => a.getAttribute('href') || '');
  });

  const seen = new Set<string>();
  const routes: string[] = [];
  for (const href of hrefs) {
    if (!href.startsWith('/baseball/')) continue;
    if (/sign-?out|logout/i.test(href)) continue;
    const clean = href.replace(/[#?].*$/, '');
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    routes.push(clean);
  }
  return routes;
}

/** Any anchor anywhere on the page (not just <nav>) matching a public
 * player/team/program/packet route shape. Identical contract to
 * baseball-route-crawler.spec.ts's discoverPublicSampleLinks. */
async function discoverPublicSampleLinks(page: Page): Promise<string[]> {
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).map(
      (a) => (a as HTMLAnchorElement).getAttribute('href') || '',
    ),
  );
  return [...new Set(hrefs.filter((h) => PUBLIC_SAMPLE_RE.test(h)))];
}

/** Wait for network settle + web fonts + a short entrance-animation settle
 * delay, then scroll to the bottom and back to the top to trigger any
 * lazy/IntersectionObserver-gated content before the full-page shot. Never
 * throws — a slow/odd page still gets the best screenshot we can take. */
async function settleForCapture(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page
    .evaluate(() => (document.fonts ? document.fonts.ready.then(() => undefined) : undefined))
    .catch(() => {});
  await page.waitForTimeout(ENTRANCE_SETTLE_MS);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
  await page.waitForTimeout(SCROLL_SETTLE_MS);
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.waitForTimeout(SCROLL_SETTLE_MS);
}

/**
 * Navigate to `route` at each viewport in turn (setViewportSize BEFORE
 * navigating, so entrance transitions animate straight to the correct
 * layout instead of replaying on a post-mount resize), settle, and save a
 * full-page screenshot. Returns capture metadata; never throws — a failed
 * navigation for ONE route is recorded (navError) and the crawl continues,
 * per this spec's "data capture, not assertions" contract.
 */
async function captureRouteAllViewports(
  page: Page,
  route: string,
  index: number,
  role: 'coach' | 'player',
  authRequired: boolean,
): Promise<RouteCapture> {
  const slug = slugifyRoute(route);
  const nnn = String(index).padStart(3, '0');
  const capture: RouteCapture = {
    index,
    route,
    authRequired,
    files: {},
    status: {},
    loadMs: {},
    navError: {},
    consoleErrorCount: 0,
  };

  let errorCount = 0;
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errorCount++;
  };
  const onPageError = () => {
    errorCount++;
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  try {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize(vp.size);

      const started = Date.now();
      let response: Response | null = null;
      try {
        response = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      } catch (err) {
        capture.loadMs[vp.name] = Date.now() - started;
        capture.navError[vp.name] = err instanceof Error ? err.message : String(err);
        continue; // can't screenshot a page that failed to navigate
      }
      capture.loadMs[vp.name] = Date.now() - started;
      capture.status[vp.name] = response?.status() ?? null;

      await settleForCapture(page);

      const dir = path.join(REPORT_DIR, role, vp.name);
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, `${nnn}-${slug}.png`);
      try {
        await page.screenshot({ path: filePath, fullPage: true });
        capture.files[vp.name] = path.relative(REPORT_DIR, filePath);
      } catch (err) {
        capture.navError[vp.name] = `screenshot failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  }

  capture.consoleErrorCount = errorCount;
  return capture;
}

/**
 * Discover every visible nav route from `entryRoute` (BFS, growing the
 * frontier as newly-visited hubs reveal their own hub-subnav links — not
 * all mounted from the entry route alone) and capture both viewports for
 * each. Pushes into the caller-owned `captures` array so partial progress
 * survives a thrown VisualAuditFailure (the caller writes whatever landed
 * in `captures` to the manifest either way).
 *
 * Throws VisualAuditFailure for the two conditions this spec is allowed to
 * fail on: a login bounce (entry or mid-crawl), or a total navigation
 * failure (entry route unreachable, zero nav links discovered, or every
 * discovered route failed to produce a single screenshot).
 */
async function crawlAuthenticatedRole(
  page: Page,
  role: 'coach' | 'player',
  entryRoute: string,
  captures: RouteCapture[],
): Promise<{ publicSamples: string[] }> {
  try {
    await page.goto(entryRoute, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
  } catch (err) {
    throw new VisualAuditFailure(
      `visual-audit(${role}): total navigation failure — could not load entry route ${entryRoute}: ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
  }
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

  if (page.url().includes('/login')) {
    throw new VisualAuditFailure(
      `visual-audit(${role}): login failure — entry route ${entryRoute} bounced to ${page.url()} ` +
        '(authenticated storageState did not hold)',
    );
  }

  const visited = new Set<string>();
  const publicSamples = new Set<string>();
  const frontier = await discoverVisibleNavLinks(page);
  for (const link of await discoverPublicSampleLinks(page)) publicSamples.add(link);

  if (frontier.length === 0) {
    throw new VisualAuditFailure(
      `visual-audit(${role}): total navigation failure — no visible nav links discovered from ` +
        `${entryRoute}; the authenticated shell may not have rendered`,
    );
  }

  for (let i = 0; i < frontier.length; i++) {
    const route = frontier[i];
    if (!route || visited.has(route)) continue;
    visited.add(route);

    const capture = await captureRouteAllViewports(page, route, captures.length + 1, role, true);
    captures.push(capture);

    const navigatedOk = VIEWPORTS.some((vp) => capture.files[vp.name]);
    if (!navigatedOk) continue; // this one route failed — data-capture only, keep crawling.

    for (const nested of await discoverVisibleNavLinks(page)) {
      if (!visited.has(nested) && !frontier.includes(nested)) frontier.push(nested);
    }
    for (const link of await discoverPublicSampleLinks(page)) publicSamples.add(link);

    if (page.url().includes('/login')) {
      throw new VisualAuditFailure(
        `visual-audit(${role}): login failure — session bounced to ${page.url()} while crawling ${route}`,
      );
    }
  }

  const anySucceeded = captures.some((c) => VIEWPORTS.some((vp) => c.files[vp.name]));
  if (!anySucceeded) {
    throw new VisualAuditFailure(
      `visual-audit(${role}): total navigation failure — 0/${captures.length} discovered routes ` +
        'produced a screenshot',
    );
  }

  return { publicSamples: [...publicSamples].slice(0, MAX_PUBLIC_SAMPLES) };
}

/**
 * Capture /baseball, /baseball/login, and up to MAX_PUBLIC_SAMPLES
 * best-effort public sample routes discovered during the authenticated
 * crawl, in a FRESH unauthenticated browser context — a public profile
 * route must render for an anonymous visitor, not just for the
 * already-authenticated crawl page. Mirrors
 * baseball-route-crawler.spec.ts's verifyPublicSamplesAnonymously, but
 * captures screenshots instead of asserting health. Pushes into the
 * caller-owned `captures` array, continuing its index sequence.
 */
async function captureSignedOutRoutes(
  page: Page,
  role: 'coach' | 'player',
  publicSamples: string[],
  captures: RouteCapture[],
): Promise<void> {
  const browser = page.context().browser();
  if (!browser) return;

  const routes = [...new Set([...ALWAYS_PUBLIC_ROUTES, ...publicSamples])];
  const anonContext = await browser.newContext();
  try {
    const anonPage = await anonContext.newPage();
    for (const route of routes) {
      const capture = await captureRouteAllViewports(anonPage, route, captures.length + 1, role, false);
      captures.push(capture);
    }
  } finally {
    await anonContext.close();
  }
}

function writeManifest(role: 'coach' | 'player', captures: RouteCapture[]): void {
  const dir = path.join(REPORT_DIR, role);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(captures, null, 2));
}

async function runRoleVisualAudit(
  page: Page,
  role: 'coach' | 'player',
  entryRoute: string,
): Promise<void> {
  const captures: RouteCapture[] = [];
  try {
    const { publicSamples } = await crawlAuthenticatedRole(page, role, entryRoute, captures);
    await captureSignedOutRoutes(page, role, publicSamples, captures);
  } finally {
    // Written even on a thrown VisualAuditFailure — whatever screenshots
    // DID land before the failure are still useful CI artifact data.
    writeManifest(role, captures);
  }
}

test.describe('Visual audit — coach', { tag: '@coach' }, () => {
  test('screenshot every discovered coach route at phone + desktop viewports', async ({ page }) => {
    test.skip(process.env.VISUAL_AUDIT !== '1', 'Gated behind VISUAL_AUDIT=1 — see visual-audit.yml');
    await runRoleVisualAudit(page, 'coach', '/baseball/dashboard/command-center');
  });
});

test.describe('Visual audit — player', { tag: '@player' }, () => {
  test('screenshot every discovered player route at phone + desktop viewports', async ({ page }) => {
    test.skip(process.env.VISUAL_AUDIT !== '1', 'Gated behind VISUAL_AUDIT=1 — see visual-audit.yml');
    await runRoleVisualAudit(page, 'player', '/baseball/player/today');
  });
});
