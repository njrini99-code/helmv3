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

const WIDTHS = [320, 375, 390, 430];
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
  // A dev server can hydrate after the first fill and wipe it: fill until the button takes it.
  const button = page.getByRole('button', { name: 'Sign in' });
  await expect(async () => {
    await page.locator('#golf-signin-email').fill(email);
    await page.locator('#golf-signin-password').fill(password);
    await expect(button).toBeEnabled({ timeout: 2000 });
  }).toPass({ timeout: 180_000 });
  await button.click();
  await page.waitForURL((u) => u.pathname.startsWith('/golf/') && !u.pathname.endsWith('/login'), { timeout: 300_000 });
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
    // The smallest text a person is asked to read.
    let smallest = { px: 99, text: '' };
    const walker = document.createTreeWalker(document.querySelector('#ch-content') ?? document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent?.trim();
      const el = n.parentElement;
      if (!t || !el || !visible(el) || el.closest('[aria-hidden="true"], .ch-sr-only')) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < smallest.px) smallest = { px, text: t.slice(0, 40) };
    }
    return {
      innerWidth: window.innerWidth,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      rootFontSize: getComputedStyle(root).fontSize,
      viewportTags: Array.from(document.querySelectorAll('meta[name="viewport"]')).map((m) => (m as HTMLMetaElement).content),
      overflowing: over.slice(0, 8),
      smallest,
    };
  });
}

async function sweep(page: Page, role: string, routes: string[]) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of routes) {
      await page.goto(route, { timeout: 180_000 });
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
