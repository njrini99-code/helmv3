/**
 * capture-desktop-screenshots.ts
 *
 * Captures full-page desktop (1440x900) screenshots for every enabled route in
 * routes/routes.json, using up to three browser contexts (public / player /
 * coach) selected by route.role.
 *
 * Run with: tsx scripts/ui-intelligence/capture-desktop-screenshots.ts
 * (process.cwd() is expected to be the repo root.)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';

const BASE = process.env.GOLFHELM_BASE_URL || 'http://localhost:3000';

// Per-route navigation timeout (ms). Override for heavy SSR pages on a cold
// dev server, e.g. UI_GOTO_TIMEOUT=120000.
const GOTO_TIMEOUT = Number(process.env.UI_GOTO_TIMEOUT) || 45000;

const VIEWPORT = { width: 1440, height: 900 } as const;
const DEVICE_SCALE_FACTOR = 1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Role = 'public' | 'player' | 'coach' | 'unknown';
type Criticality = 'high' | 'medium' | 'low';
type RouteStatus = 'success' | 'failed' | 'redirected';

interface RouteEntry {
  route: string;
  label: string;
  role: Role;
  auth: boolean;
  category: string;
  criticality: Criticality;
  folder: string;
  enabled: boolean;
  notes: string;
  needs_confirmation: boolean;
  dynamic: boolean;
  param: string | null;
  /** When set, click this client-side tab (by accessible name within `tablist`)
   *  after navigating to `route`, before screenshotting. */
  tab?: { slug: string; name: string } | null;
  tablist?: string | null;
}

interface RouteMetadata {
  route: string;
  label: string;
  role: Role;
  category: string;
  url: string;
  viewport: string;
  screenshot: string;
  capturedAt: string;
  status: RouteStatus;
  pageTitle: string;
  finalUrl: string;
  height: number;
  notes: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
const ROUTES_JSON = path.join(ROOT, 'routes', 'routes.json');
const SCREENSHOTS_ROOT = path.join(ROOT, 'ui-intelligence', 'screenshots', 'desktop');
const REPORTS_DIR = path.join(ROOT, 'ui-intelligence', 'reports');
const FAILED_ROUTES_MD = path.join(REPORTS_DIR, 'failed-routes.md');
const PLAYER_AUTH = path.join(ROOT, 'playwright', '.auth', 'player.json');
const COACH_AUTH = path.join(ROOT, 'playwright', '.auth', 'coach.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForStablePage(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForSelector('body');
  await page.waitForTimeout(750);
}

async function freezeAnimations(page: Page): Promise<void> {
  await page
    .addStyleTag({
      content:
        '*,*::before,*::after{transition-duration:0s !important;animation-duration:0s !important;animation-delay:0s !important;}',
    })
    .catch(() => {});
}

/**
 * Many GolfHelm pages use a `100dvh`/`h-screen` shell with an INTERNAL scroll
 * container, so document.body.scrollHeight stays at the viewport height and a
 * plain fullPage screenshot is clipped to the first screen. This measures the
 * tallest WIDE scroll region, resizes the viewport to fit (capped), and
 * re-settles so the fullPage shot is genuinely top-to-bottom. Returns the
 * content height used.
 */
const MAX_PAGE_HEIGHT = 8000;
async function expandForFullPage(page: Page): Promise<number> {
  const measure = (): Promise<number> =>
    page
      .evaluate(() => {
        const vw = window.innerWidth;
        let max = Math.max(
          document.documentElement.scrollHeight,
          document.body ? document.body.scrollHeight : 0,
        );
        const all = Array.from(document.querySelectorAll<HTMLElement>('*'));
        for (const el of all) {
          const cs = getComputedStyle(el);
          const oy = cs.overflowY;
          if (
            (oy === 'auto' || oy === 'scroll') &&
            el.scrollHeight > el.clientHeight + 4 &&
            el.clientWidth > vw * 0.5
          ) {
            if (el.scrollHeight > max) max = el.scrollHeight;
          }
        }
        return Math.ceil(max);
      })
      .catch(() => 900);

  let target = Math.min(Math.max(await measure(), 900), MAX_PAGE_HEIGHT);
  if (target > 900) {
    await page.setViewportSize({ width: VIEWPORT.width, height: target });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(500);
    await freezeAnimations(page);
    // Revealing previously-offscreen (lazy/virtualized) content may grow the page.
    const grown = Math.min(Math.max(await measure(), target), MAX_PAGE_HEIGHT);
    if (grown > target + 50) {
      target = grown;
      await page.setViewportSize({ width: VIEWPORT.width, height: target });
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(400);
      await freezeAnimations(page);
    }
  }
  return target;
}

/** Best-effort dismissal of the Next.js dev overlay / cookie banners. Never throws. */
async function dismissOverlays(page: Page): Promise<void> {
  try {
    // Next.js dev tools / error overlay (rendered inside a portal/shadow host).
    await page.evaluate(() => {
      const selectors = [
        'nextjs-portal',
        '[data-nextjs-dialog-overlay]',
        '[data-nextjs-toast]',
        '#__next-build-watcher',
        '[data-next-badge-root]',
        '[data-next-badge]',
      ];
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach((el) => {
          (el as HTMLElement).style.setProperty('display', 'none', 'important');
        });
      }
    });
  } catch {
    /* ignore */
  }

  // Common cookie / consent banner accept buttons.
  const consentLabels = [/accept all/i, /accept cookies/i, /i agree/i, /got it/i, /accept/i];
  for (const label of consentLabels) {
    try {
      const btn = page.getByRole('button', { name: label });
      if (await btn.first().isVisible({ timeout: 250 }).catch(() => false)) {
        await btn.first().click({ timeout: 1000 }).catch(() => {});
        break;
      }
    } catch {
      /* ignore */
    }
  }
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function writeMetadata(dir: string, meta: RouteMetadata): void {
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify(meta, null, 2), 'utf8');
}

function ensureFailedRoutesHeader(): void {
  ensureDir(REPORTS_DIR);
  if (!fs.existsSync(FAILED_ROUTES_MD)) {
    fs.writeFileSync(
      FAILED_ROUTES_MD,
      `# Failed Routes\n\n_Generated at ${new Date().toISOString()}_\n\n`,
      'utf8',
    );
  }
}

function appendFailedRoute(entry: RouteEntry, status: RouteStatus, detail: string): void {
  ensureFailedRoutesHeader();
  const line = `- [${entry.role}] ${entry.route} — ${status} — ${detail}\n`;
  fs.appendFileSync(FAILED_ROUTES_MD, line, 'utf8');
}

function readRoutes(): RouteEntry[] {
  const raw = fs.readFileSync(ROUTES_JSON, 'utf8');
  const parsed = JSON.parse(raw) as RouteEntry[];
  if (!Array.isArray(parsed)) {
    throw new Error('routes/routes.json did not parse to an array');
  }
  // Optional iteration filter: UI_ROUTE_FILTER="a,b" captures only entries whose
  // folder contains one of the comma-separated substrings. Empty = all routes.
  const filters = (process.env.UI_ROUTE_FILTER || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parsed.filter(
    (r) =>
      r &&
      r.enabled === true &&
      (filters.length === 0 || filters.some((f) => r.folder.includes(f))),
  );
}

function contextKeyForRole(role: Role): 'public' | 'player' | 'coach' {
  if (role === 'player') return 'player';
  if (role === 'coach') return 'coach';
  // public + unknown (and any unexpected value) -> public context
  return 'public';
}

/**
 * Resolve a fallback chromium-headless-shell executable from the local
 * Playwright browser cache. Used only when chromium.launch() can't find the
 * exact browser build Playwright expects (e.g. the matching build failed to
 * install but a different complete build is present on the machine).
 *
 * Order of preference:
 *   1. PLAYWRIGHT_CHROMIUM_EXECUTABLE env var (explicit override).
 *   2. Newest installed chromium_headless_shell-* in the ms-playwright cache.
 * Returns undefined when nothing usable is found (caller then surfaces the
 * original launch error).
 */
function resolveFallbackChromium(): string | undefined {
  const override = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (override && fs.existsSync(override)) return override;

  const cacheRoot =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    path.join(
      process.env.HOME || process.env.USERPROFILE || '',
      'Library',
      'Caches',
      'ms-playwright',
    );

  let entries: string[];
  try {
    entries = fs.readdirSync(cacheRoot);
  } catch {
    return undefined;
  }

  // Prefer the highest build number of chromium_headless_shell-*.
  const shells = entries
    .filter((e) => e.startsWith('chromium_headless_shell-'))
    .map((e) => ({ name: e, build: Number(e.split('-')[1]) || 0 }))
    .sort((a, b) => b.build - a.build);

  // Candidate relative paths inside a headless-shell build dir, by platform.
  const candidates = [
    'chrome-headless-shell-mac-arm64/chrome-headless-shell',
    'chrome-headless-shell-mac-x64/chrome-headless-shell',
    'chrome-headless-shell-linux/chrome-headless-shell',
    'chrome-headless-shell-win/chrome-headless-shell.exe',
  ];

  for (const shell of shells) {
    for (const rel of candidates) {
      const exe = path.join(cacheRoot, shell.name, rel);
      if (fs.existsSync(exe)) return exe;
    }
  }
  return undefined;
}

/**
 * Launch chromium for capture, resilient to browser-build/cache mismatches.
 *
 * Strategy (first that works wins):
 *   1. System-installed Google Chrome via channel 'chrome' (default). Avoids the
 *      Playwright-bundled-browser build/cache problem entirely. Override the
 *      channel with PLAYWRIGHT_CHROMIUM_CHANNEL ('' uses the bundled browser).
 *   2. The Playwright-bundled chromium (no channel).
 *   3. A locally-cached chromium_headless_shell-* build resolved from the
 *      ms-playwright cache (or PLAYWRIGHT_CHROMIUM_EXECUTABLE).
 * Each fallback only runs if the prior attempt threw, so a healthy environment
 * launches on step 1 (or 2) and never touches the rest.
 */
async function launchChromium(): Promise<Browser> {
  const channel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL ?? 'chrome';

  // 1) System Chrome via channel (unless explicitly disabled).
  if (channel) {
    try {
      return await chromium.launch({ headless: true, channel, args: ['--no-sandbox'] });
    } catch (err) {
      const original = err instanceof Error ? err.message.split('\n')[0] : String(err);
      console.warn(`[capture] channel '${channel}' launch failed (${original}); trying bundled chromium`);
    }
  }

  // 2) Playwright-bundled chromium.
  try {
    return await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  } catch (err) {
    // 3) Cached headless-shell build fallback.
    const exe = resolveFallbackChromium();
    if (!exe) throw err;
    const original = err instanceof Error ? err.message.split('\n')[0] : String(err);
    console.warn(
      `[capture] bundled chromium launch failed (${original}); ` +
        `falling back to cached headless shell at ${exe}`,
    );
    return chromium.launch({ headless: true, executablePath: exe, args: ['--no-sandbox'] });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Read routes first so a bad routes.json surfaces clearly.
  let routes: RouteEntry[];
  try {
    routes = readRoutes();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Could not read routes/routes.json: ${msg}`);
    process.exit(1);
    return;
  }

  ensureDir(SCREENSHOTS_ROOT);
  ensureFailedRoutesHeader();

  // Use system-installed Google Chrome (channel) to avoid Playwright bundled
  // browser-build/cache mismatches, falling back to the bundled chromium and
  // then a cached headless-shell build (see launchChromium()).
  const browser: Browser = await launchChromium();

  // ---- Reachability check (the ONLY path that exits non-zero) -------------
  try {
    const probe = await browser.newContext({
      viewport: { ...VIEWPORT },
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    });
    const probePage = await probe.newPage();
    await probePage.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await probePage.close();
    await probe.close();
  } catch {
    console.error(`Dev server not reachable at ${BASE} — start it with: npm run dev`);
    await browser.close().catch(() => {});
    process.exit(1);
    return;
  }

  // ---- Build the (up to three) contexts -----------------------------------
  const contexts: Partial<Record<'public' | 'player' | 'coach', BrowserContext>> = {};

  let summaryTotal = 0;
  let summarySuccess = 0;
  let summaryRedirected = 0;
  let summaryFailed = 0;

  try {
    // public context — always available, no storage state.
    contexts.public = await browser.newContext({
      viewport: { ...VIEWPORT },
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    });

    // player context — only if its storage state file exists.
    if (fs.existsSync(PLAYER_AUTH)) {
      contexts.player = await browser.newContext({
        viewport: { ...VIEWPORT },
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
        storageState: PLAYER_AUTH,
      });
    }

    // coach context — only if its storage state file exists.
    if (fs.existsSync(COACH_AUTH)) {
      contexts.coach = await browser.newContext({
        viewport: { ...VIEWPORT },
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
        storageState: COACH_AUTH,
      });
    }

    // ---- Iterate routes sequentially --------------------------------------
    for (const entry of routes) {
      summaryTotal += 1;

      const url = BASE + entry.route;
      const dir = path.join(SCREENSHOTS_ROOT, entry.folder);
      ensureDir(dir);

      const ctxKey = contextKeyForRole(entry.role);
      const context = contexts[ctxKey];

      // Missing required auth storage state -> record failure, keep going.
      if (!context) {
        const error = 'missing auth storage state (run npm run ui:auth)';
        const meta: RouteMetadata = {
          route: entry.route,
          label: entry.label,
          role: entry.role,
          category: entry.category,
          url,
          viewport: '1440x900',
          screenshot: 'full-page.png',
          capturedAt: new Date().toISOString(),
          status: 'failed',
          pageTitle: '',
          finalUrl: '',
          height: 0,
          notes: '',
          error,
        };
        writeMetadata(dir, meta);
        appendFailedRoute(entry, 'failed', error);
        summaryFailed += 1;
        console.log(`[${entry.role}] ${entry.route} — failed (${error})`);
        continue;
      }

      const page = await context.newPage();
      try {
        await page
          .goto(url, { waitUntil: 'networkidle', timeout: GOTO_TIMEOUT })
          .catch(() => page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT }));

        await waitForStablePage(page);
        await dismissOverlays(page);
        await freezeAnimations(page);
        await page.waitForTimeout(300);

        let status: RouteStatus = 'success';
        let notes = '';

        // TAB entries: click the tab (by accessible name within its tablist)
        // before measuring/shooting. Resilient — if the tab bar isn't present
        // (e.g. an account with no stats data), record it and shoot the landing.
        if (entry.tab && entry.tablist) {
          const tablistLoc = page.getByRole('tablist', { name: entry.tablist });
          const present = await tablistLoc
            .first()
            .isVisible({ timeout: 2500 })
            .catch(() => false);
          if (present) {
            try {
              await tablistLoc
                .getByRole('tab', { name: entry.tab.name })
                .first()
                .click({ timeout: 5000 });
              await page.waitForLoadState('networkidle').catch(() => {});
              await page.waitForTimeout(800); // tab content lazy-loads on click
              await dismissOverlays(page);
              await freezeAnimations(page);
            } catch (e) {
              notes = `tab "${entry.tab.name}" click failed: ${
                e instanceof Error ? e.message : String(e)
              }`.slice(0, 200);
            }
          } else {
            status = 'redirected';
            notes = 'stats tab bar not present for this account (no data)';
          }
        }

        const finalUrl = page.url();
        if (entry.auth === true && finalUrl.includes('/golf/login')) {
          status = 'redirected';
          notes = 'redirected to login (auth/role)';
        }

        // Expand internal scroll containers so the fullPage shot is top-to-bottom.
        const height = await expandForFullPage(page);
        const pageTitle = await page.title().catch(() => '');

        await page.screenshot({ path: path.join(dir, 'full-page.png'), fullPage: true });

        const meta: RouteMetadata = {
          route: entry.route,
          label: entry.label,
          role: entry.role,
          category: entry.category,
          url,
          viewport: '1440x900',
          screenshot: 'full-page.png',
          capturedAt: new Date().toISOString(),
          status,
          pageTitle,
          finalUrl,
          height,
          notes,
        };
        writeMetadata(dir, meta);

        if (status === 'redirected') {
          summaryRedirected += 1;
          appendFailedRoute(entry, 'redirected', notes);
        } else {
          summarySuccess += 1;
        }
        console.log(`[${entry.role}] ${entry.route} — ${status}`);
      } catch (err) {
        const error = err instanceof Error ? String(err.message || err) : String(err);
        const meta: RouteMetadata = {
          route: entry.route,
          label: entry.label,
          role: entry.role,
          category: entry.category,
          url,
          viewport: '1440x900',
          screenshot: 'full-page.png',
          capturedAt: new Date().toISOString(),
          status: 'failed',
          pageTitle: '',
          finalUrl: page.url(),
          height: 0,
          notes: '',
          error,
        };
        writeMetadata(dir, meta);
        appendFailedRoute(entry, 'failed', error);
        summaryFailed += 1;
        console.log(`[${entry.role}] ${entry.route} — failed`);
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    for (const ctx of Object.values(contexts)) {
      await ctx?.close().catch(() => {});
    }
    await browser.close().catch(() => {});
  }

  console.log(
    `\nDone. total=${summaryTotal} success=${summarySuccess} redirected=${summaryRedirected} failed=${summaryFailed}`,
  );

  // Always exit 0 (except the reachability failure above) so the npm chain continues.
  process.exit(0);
}

main().catch((err) => {
  // Defensive: any unexpected top-level error should still not be a secret leak,
  // but this should be rare given per-route try/catch above.
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Unexpected error in capture-desktop-screenshots: ${msg}`);
  // Still exit 0 to keep the chain alive (reachability is the only hard failure).
  process.exit(0);
});
