/**
 * e2e/baseball-route-crawler.spec.ts — authenticated Baseball route crawler
 * (#373).
 *
 * Replaces scripts/route-crawler-baseball.mjs, which POSTed credentials to a
 * `/api/auth/login` REST endpoint that does not exist in this repo (only
 * src/app/api/golf/auth/login/route.ts exists, and it is Golf-specific) —
 * BaseballHelm auth is a client-side Supabase form flow, not a JSON login
 * API, so that script's signIn() always failed and `main()` exited 0
 * ("No baseball coach credentials — skipping") regardless of whether CI
 * secrets were actually configured. It was also never wired into any
 * workflow.
 *
 * This spec runs under the existing `baseball-coach` / `baseball-player`
 * Playwright projects (see playwright.config.ts) — the same storageState-
 * based auth e2e/baseball-smoke.spec.ts already uses, so there is no new
 * login mechanism to build or maintain.
 *
 * For each role it:
 *   1. Discovers VISIBLE `<nav>` links from the LIVE RENDERED DOM (not
 *      statically parsed from src/lib/baseball/nav-registry.ts source,
 *      which can tell you what SHOULD render, not what actually did) —
 *      covering both the main sidebar (FairwaySidebar, aria-label="Main
 *      navigation") and any hub-subnav strip (e.g.
 *      src/app/baseball/(dashboard)/_components/hub-sub-nav.tsx), since
 *      both are real Next <Link>s inside a <nav> element.
 *   2. Navigates every discovered route and asserts, via
 *      e2e/helpers/route-health.ts (shared with baseball-smoke.spec.ts),
 *      that none of them: return a 4xx/5xx, bounce to /login (guard
 *      bounce), redirect into /golf/ (wrong-sport redirect), render a
 *      React/Next error boundary, get stuck on a loading spinner, or
 *      render a near-blank page.
 *   3. Best-effort discovers PUBLIC sample routes (player/team/program
 *      profile or packet links) surfaced anywhere on an authenticated page
 *      — not guessed IDs — and re-checks each one in a fresh, unauthenticated
 *      browser context to confirm it renders without requiring login. This
 *      only probes routes that are actually linked from real, current data,
 *      so it stays safe against seed/demo-data drift; if none are linked, it
 *      is skipped rather than failing.
 *
 * A per-role JSON report is written to test-results/ for CI artifact upload.
 *
 * NOT wired into the #372 hard PR gate (ci.yml's `baseball-auth-smoke` job).
 * DOM-driven visible-link discovery + the stuck-spinner/near-blank
 * heuristics are new, unproven surface area — bundling them into an
 * already-required gate would compound flake risk before this has run
 * cleanly on `main` a few times. It runs as its own step inside
 * playwright.yml's advisory `e2e` job for now; promote once proven stable.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { gotoAndAssessRouteHealth, type RouteHealthResult } from './helpers/route-health';

const REPORT_DIR = path.join(process.cwd(), 'test-results');

/** Cap on how many best-effort public sample routes to verify per role —
 * this is a smoke check, not an exhaustive crawl of every public profile. */
const MAX_PUBLIC_SAMPLES = 3;

const PUBLIC_SAMPLE_RE = /^\/baseball\/(player|team|program)\/[^/?#]+$|^\/baseball\/packet\/[^/?#]+$/;

/** Visible `<nav>` links, deduped, same-origin, baseball-scoped. Excludes
 * hash-only fragments, query strings, and sign-out/logout controls (which
 * would end the session mid-crawl). */
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
 * player/team/program/packet route shape — these are surfaced as "share" /
 * "view public profile" style links outside the main nav. */
async function discoverPublicSampleLinks(page: Page): Promise<string[]> {
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).map(
      (a) => (a as HTMLAnchorElement).getAttribute('href') || '',
    ),
  );
  return [...new Set(hrefs.filter((h) => PUBLIC_SAMPLE_RE.test(h)))];
}

async function crawlAuthenticatedRole(
  page: Page,
  entryRoute: string,
): Promise<{ results: RouteHealthResult[]; publicSamples: string[] }> {
  await page.goto(entryRoute, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

  const results: RouteHealthResult[] = [];
  const visited = new Set<string>();
  const publicSamples = new Set<string>();

  // Frontier grows as newly-visited hubs reveal their own hub-subnav links —
  // those are not all mounted from the entry route alone.
  const frontier = await discoverVisibleNavLinks(page);
  for (const link of await discoverPublicSampleLinks(page)) publicSamples.add(link);

  for (let i = 0; i < frontier.length; i++) {
    const route = frontier[i];
    if (!route || visited.has(route)) continue;
    visited.add(route);

    const result = await gotoAndAssessRouteHealth(page, route, {
      expectedSportPrefix: '/baseball/',
    });
    results.push(result);

    if (result.ok) {
      for (const nested of await discoverVisibleNavLinks(page)) {
        if (!visited.has(nested) && !frontier.includes(nested)) frontier.push(nested);
      }
      for (const link of await discoverPublicSampleLinks(page)) publicSamples.add(link);
    }
  }

  return { results, publicSamples: [...publicSamples].slice(0, MAX_PUBLIC_SAMPLES) };
}

/** Re-verify best-effort-discovered public sample routes in a fresh,
 * unauthenticated context — a public profile/packet route must render for
 * an anonymous visitor, not just for the already-authenticated crawl page. */
async function verifyPublicSamplesAnonymously(
  page: Page,
  routes: string[],
): Promise<RouteHealthResult[]> {
  if (routes.length === 0) return [];

  const browser = page.context().browser();
  if (!browser) return [];

  const anonContext = await browser.newContext();
  try {
    const anonPage = await anonContext.newPage();
    const results: RouteHealthResult[] = [];
    for (const route of routes) {
      results.push(
        await gotoAndAssessRouteHealth(anonPage, route, { expectedSportPrefix: '/baseball/' }),
      );
    }
    return results;
  } finally {
    await anonContext.close();
  }
}

function writeReport(role: 'coach' | 'player', results: RouteHealthResult[]): void {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(REPORT_DIR, `baseball-route-crawler-${role}-report.json`),
    JSON.stringify(results, null, 2),
  );
}

function failureSummary(results: RouteHealthResult[]): string {
  return results
    .filter((r) => !r.ok)
    .map((r) => `  - ${r.route} → ${r.failureReason}: ${r.detail}`)
    .join('\n');
}

test.describe('BaseballHelm authenticated route crawler — coach', { tag: '@coach' }, () => {
  test('every visible coach nav link renders a healthy authenticated surface', async ({
    page,
  }) => {
    const { results, publicSamples } = await crawlAuthenticatedRole(
      page,
      '/baseball/dashboard/command-center',
    );
    const publicResults = await verifyPublicSamplesAnonymously(page, publicSamples);
    const all = [...results, ...publicResults];
    writeReport('coach', all);

    const failures = all.filter((r) => !r.ok);
    expect(failures.length, `Route crawler failures (coach):\n${failureSummary(all)}`).toBe(0);
  });
});

test.describe('BaseballHelm authenticated route crawler — player', { tag: '@player' }, () => {
  test('every visible player nav link renders a healthy authenticated surface', async ({
    page,
  }) => {
    const { results, publicSamples } = await crawlAuthenticatedRole(page, '/baseball/player/today');
    const publicResults = await verifyPublicSamplesAnonymously(page, publicSamples);
    const all = [...results, ...publicResults];
    writeReport('player', all);

    const failures = all.filter((r) => !r.ok);
    expect(failures.length, `Route crawler failures (player):\n${failureSummary(all)}`).toBe(0);
  });
});
