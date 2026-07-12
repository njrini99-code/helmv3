import { test, expect, type Page } from '@playwright/test';

/**
 * Mobile viewport regression suite.
 *
 * Encodes the phone-width defect classes that have repeatedly shipped and
 * been fixed by hand (PR #799 FAB/bottom-nav collisions, PR #806 calendar
 * "Today" pill clipped at 390px) as functional assertions at real device
 * widths, per docs/MOBILE_DOCTRINE.md:
 *
 *   1. No horizontal page pan — the page never scrolls sideways.
 *   2. No partially-clipped header/nav controls — a control that is visible
 *      but cut off by the viewport edge (the #806 class). Fully off-screen
 *      elements are ignored: closed drawers/sheets legitimately park at
 *      translateX(100%).
 *   3. No fixed element overlapping the bottom navigation (the #799 class).
 *
 * Projects (see playwright.config.ts): `mobile-public` runs unauthenticated;
 * `mobile-coach` / `mobile-player` reuse the CI-seeded baseball storageState
 * from the `setup` project, same as the mandatory smoke suite.
 */

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;

const PUBLIC_ROUTES = ['/', '/golf/login', '/baseball/login'];

const COACH_ROUTES = [
  '/baseball/dashboard/command-center',
  '/baseball/dashboard/calendar',
  '/baseball/dashboard/roster',
  '/baseball/dashboard/stats-center',
  '/baseball/dashboard/settings',
];

const PLAYER_ROUTES = [
  '/baseball/player/today',
  '/baseball/dashboard/calendar',
  '/baseball/dashboard/roster',
  '/baseball/dashboard/my-stats',
];

async function gotoSettled(page: Page, route: string): Promise<void> {
  // Reduced motion stabilizes geometry: entrance animations otherwise leave
  // elements mid-transform when we measure.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(250);
}

async function expectNoHorizontalPan(page: Page, route: string): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect
    .soft(scrollWidth, `${route}: page pans horizontally (scrollWidth ${scrollWidth} > viewport ${innerWidth})`)
    .toBeLessThanOrEqual(innerWidth + 1);
}

async function expectNoClippedControls(page: Page, route: string): Promise<void> {
  const clipped = await page.evaluate(() => {
    const offenders: string[] = [];
    const containers = Array.from(
      document.querySelectorAll('header, nav, [role="navigation"], [role="toolbar"]'),
    );
    const seen = new Set<Element>();
    for (const container of containers) {
      for (const el of Array.from(container.querySelectorAll('a, button, [role="button"]'))) {
        if (seen.has(el)) continue;
        seen.add(el);
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.bottom < 0 || r.top > window.innerHeight) continue;
        // Only flag PARTIAL clipping: visible in the viewport but cut off at
        // an edge. Fully off-screen = intentional off-canvas UI, not a bug.
        const partiallyVisible = r.left < window.innerWidth && r.right > 0;
        const cutRight = r.right > window.innerWidth + 1 && r.left < window.innerWidth - 8;
        const cutLeft = r.left < -1 && r.right > 8;
        if (partiallyVisible && (cutRight || cutLeft)) {
          const label = (el.textContent || el.getAttribute('aria-label') || el.tagName)
            .trim()
            .slice(0, 40);
          offenders.push(`"${label}" [left ${Math.round(r.left)}, right ${Math.round(r.right)}] vs viewport ${window.innerWidth}`);
        }
      }
    }
    return offenders;
  });
  expect.soft(clipped, `${route}: header/nav controls clipped at viewport edge`).toEqual([]);
}

async function expectNoBottomNavCollision(page: Page, route: string): Promise<void> {
  const collisions = await page.evaluate(() => {
    const fixedEls: Element[] = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const style = getComputedStyle(el);
      if (style.position !== 'fixed') continue;
      if (style.pointerEvents === 'none') continue; // toast portals, inset-0 wrappers
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      fixedEls.push(el);
    }
    const bottomNav = fixedEls.find((el) => {
      const isNav = el.tagName === 'NAV' || el.getAttribute('role') === 'navigation' || el.querySelector('nav') !== null;
      const r = el.getBoundingClientRect();
      return isNav && r.top > window.innerHeight - 140 && r.width > window.innerWidth * 0.6;
    });
    if (!bottomNav) return [];
    const navRect = bottomNav.getBoundingClientRect();
    const offenders: string[] = [];
    for (const el of fixedEls) {
      if (el === bottomNav || bottomNav.contains(el) || el.contains(bottomNav)) continue;
      const r = el.getBoundingClientRect();
      const overlapX = Math.min(r.right, navRect.right) - Math.max(r.left, navRect.left);
      const overlapY = Math.min(r.bottom, navRect.bottom) - Math.max(r.top, navRect.top);
      if (overlapX > 8 && overlapY > 8) {
        const label = (el.getAttribute('aria-label') || el.textContent || el.className.toString())
          .trim()
          .slice(0, 40);
        offenders.push(`"${label}" overlaps bottom nav by ${Math.round(overlapX)}×${Math.round(overlapY)}px`);
      }
    }
    return offenders;
  });
  expect.soft(collisions, `${route}: fixed element collides with bottom navigation`).toEqual([]);
}

async function expectMobileFit(page: Page, route: string): Promise<void> {
  await gotoSettled(page, route);
  await expectNoHorizontalPan(page, route);
  await expectNoClippedControls(page, route);
  await expectNoBottomNavCollision(page, route);
}

for (const viewport of VIEWPORTS) {
  test.describe(`public routes @ ${viewport.width}px`, { tag: '@public' }, () => {
    test.use({ viewport });
    for (const route of PUBLIC_ROUTES) {
      test(`${route} fits ${viewport.width}px`, async ({ page }) => {
        await expectMobileFit(page, route);
      });
    }
  });

  test.describe(`baseball coach routes @ ${viewport.width}px`, { tag: '@coach' }, () => {
    test.use({ viewport });
    for (const route of COACH_ROUTES) {
      test(`${route} fits ${viewport.width}px (coach)`, async ({ page }) => {
        await expectMobileFit(page, route);
        expect(page.url(), `expected ${route} to render without bouncing to /login`).not.toContain('/login');
      });
    }
  });

  test.describe(`baseball player routes @ ${viewport.width}px`, { tag: '@player' }, () => {
    test.use({ viewport });
    for (const route of PLAYER_ROUTES) {
      test(`${route} fits ${viewport.width}px (player)`, async ({ page }) => {
        await expectMobileFit(page, route);
        expect(page.url(), `expected ${route} to render without bouncing to /login`).not.toContain('/login');
      });
    }
  });
}
