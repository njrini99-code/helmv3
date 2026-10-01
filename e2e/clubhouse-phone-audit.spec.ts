import { expect, test, type Page } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { localSupabase, removeTeamSeed, seedClubhouseTeam, type SeededTeam } from './helpers/clubhouse-local-seed';

/**
 * The owner's iPhone brief (2026-10-01): measurements, not opinions. For each phone width and route, as a coach and as a
 * player: horizontal overflow, the smallest text on screen, and (on Stats) how a metric's label compares with its value.
 * The night welcome is checked with the clock at 22:00. Results are written to test-results/phone-audit.json and
 * screenshots to test-results/phone-audit/, so a fix can be compared at the same width and state.
 *
 * Emulation, not a phone: safe-area insets are zero, there is no WKWebView, and the browser is Chromium unless the
 * WebKit project is used. A real-device check stays the owner's.
 *
 * LOCAL ONLY, like the other Clubhouse specs.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test e2e/clubhouse-phone-audit.spec.ts --project=chromium
 */

test.skip(!localSupabase(), 'Clubhouse phone audit runs only against a local Supabase');
test.describe.configure({ mode: 'serial' });

const WIDTHS = (process.env.PHONE_AUDIT_WIDTHS ?? '320,375,390,430').split(',').map(Number);
const COACH_ROUTES = ['/golf/dashboard', '/golf/dashboard/stats', '/golf/dashboard/calendar', '/golf/dashboard/roster', '/golf/dashboard/messages', '/golf/dashboard/rounds'];
const PLAYER_ROUTES = ['/golf/dashboard', '/golf/dashboard/stats', '/golf/dashboard/classes', '/golf/dashboard/calendar', '/golf/dashboard/rounds'];
const OUT = 'test-results/phone-audit';

let team: SeededTeam;
const results: Record<string, unknown>[] = [];

test.beforeAll(async () => {
  test.setTimeout(5 * 60_000);
  team = await seedClubhouseTeam({ players: 4, roundsPerPlayer: 12, seed: 7 });
  mkdirSync(OUT, { recursive: true });
});

test.afterAll(async () => {
  writeFileSync('test-results/phone-audit.json', JSON.stringify(results, null, 2));
  if (team) await removeTeamSeed(team);
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/golf/login', { timeout: 180_000 });
  // A dev server can hydrate after the first fill and wipe it, or reload the page for a recompile after the click: repeat
  // the whole sign-in until the page leaves the login screen.
  const button = page.getByRole('button', { name: 'Sign in' });
  await expect(async () => {
    if (!new URL(page.url()).pathname.endsWith('/login')) return;
    await page.locator('#golf-signin-email').fill(email);
    await page.locator('#golf-signin-password').fill(password);
    await expect(button).toBeEnabled({ timeout: 2000 });
    await button.click();
    await page.waitForURL((u) => u.pathname.startsWith('/golf/') && !u.pathname.endsWith('/login'), { timeout: 90_000 });
  }).toPass({ timeout: 480_000 });
}

/** Geometry and type on the settled page. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
    };
    // Elements wider than the viewport, or sticking out past its right edge (the usual cause of a sideways page).
    const over: string[] = [];
    for (const el of Array.from(document.querySelectorAll('#ch-content *'))) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > root.clientWidth + 1 && getComputedStyle(el).position !== 'fixed') {
        const scroller = el.closest('[class*="scroll"], [style*="overflow"]');
        if (!scroller || scroller === el) over.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} → ${Math.round(r.right)}`);
      }
    }
    // The smallest text a person is asked to read, and every text under the phone floor (13px, the caption token)
    // grouped by class. SVG text is sized in viewBox units, so its size on screen is the font size times the
    // element's screen scale.
    let smallest = { px: 99, text: '' };
    const under: Record<string, number> = {};
    const walker = document.createTreeWalker(document.querySelector('#ch-content') ?? document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent?.trim();
      const el = n.parentElement;
      if (!t || !el || !visible(el) || el.closest('[aria-hidden="true"], .ch-sr-only')) continue;
      let px = parseFloat(getComputedStyle(el).fontSize);
      if (el instanceof SVGGraphicsElement) px *= el.getScreenCTM()?.a ?? 1;
      px = Math.round(px * 10) / 10;
      if (px < smallest.px) smallest = { px, text: t.slice(0, 40) };
      if (px < 13) {
        const key = `${px}px ${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').split(' ')[0]}`;
        under[key] = (under[key] ?? 0) + 1;
      }
    }
    // Touch targets (audit §11): under 24px fails WCAG 2.2's minimum; under 44px misses the phone target.
    const small: string[] = [];
    let under44 = 0;
    let controls = 0;
    for (const el of Array.from(document.querySelectorAll('#ch-content button, #ch-content a[href], #ch-content [role="button"], #ch-content [role="tab"], #ch-content input, #ch-content select'))) {
      if (!visible(el)) continue;
      controls += 1;
      // A field inside its label is hit through the label's whole box.
      const r = (el.tagName === 'INPUT' && el.closest('label') ? el.closest('label')! : el).getBoundingClientRect();
      if (Math.min(r.width, r.height) < 44) under44 += 1;
      if (Math.min(r.width, r.height) < 24) small.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return {
      targets: { controls, under44, under24: small.length, under24List: small.slice(0, 10) },
      innerWidth: window.innerWidth,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      rootFontSize: getComputedStyle(root).fontSize,
      viewportTags: Array.from(document.querySelectorAll('meta[name="viewport"]')).map((m) => (m as HTMLMetaElement).content),
      overflowing: over.slice(0, 8),
      smallest,
      underFloor: under,
    };
  });
}

async function sweep(page: Page, role: string, routes: string[]) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of routes) {
      // A dev server compiles a route on its first visit; that can take minutes.
      await page.goto(route, { timeout: 420_000 });
      await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined);
      await page.waitForTimeout(800);
      const m = await measure(page);
      results.push({ role, width, route, ...m });
      await page.screenshot({ path: `${OUT}/${role}-${width}-${route.split('/').pop() || 'home'}.png`, fullPage: true });
      expect.soft(m.scrollWidth, `${role} ${route} at ${width}px scrolls sideways`).toBeLessThanOrEqual(m.clientWidth);
    }
  }
}

test('coach routes at phone widths', async ({ page }) => {
  test.setTimeout(20 * 60_000);
  await signIn(page, team.coach.email, team.coach.password);
  await sweep(page, 'coach', COACH_ROUTES);
});

test('player routes at phone widths, and the night welcome', async ({ page }) => {
  test.setTimeout(20 * 60_000);
  await signIn(page, team.players[0]!.email, team.players[0]!.password);
  await sweep(page, 'player', PLAYER_ROUTES);

  await page.setViewportSize({ width: 390, height: 844 });
  const night = new Date();
  night.setHours(22, 0, 0, 0);
  await page.clock.setFixedTime(night);
  await page.goto('/golf/welcome', { timeout: 180_000 });
  const main = page.getByRole('main', { name: 'Welcome' });
  await expect(main).toHaveAttribute('data-dark', '', { timeout: 30_000 });
  await page.waitForTimeout(2500);
  const greeting = await page.evaluate(() => {
    const lum = (rgb: string) => {
      const [r, g, b] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const parts = ['.ch-au-wl-l1', '.ch-au-wl-l2 > span'].map((s) => {
      const el = document.querySelector(s);
      const c = el ? getComputedStyle(el).color : '';
      return { selector: s, color: c, luminance: c ? Number(lum(c).toFixed(3)) : null, text: el?.textContent ?? null };
    });
    return parts;
  });
  results.push({ role: 'player', route: '/golf/welcome (22:00)', greeting });
  await page.screenshot({ path: `${OUT}/player-390-welcome-night.png` });
  // Ivory and gold read on the night sky; ink does not. Both lines must be light (luminance well above the sky's).
  for (const part of greeting) expect.soft(part.luminance ?? 0, `${part.selector} is dark on the night sky`).toBeGreaterThan(0.5);
});
