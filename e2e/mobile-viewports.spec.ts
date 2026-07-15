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

type MobileFitState = {
  scrollWidth: number;
  innerWidth: number;
  clipped: string[];
  bottomNavFound: boolean;
  collisions: string[];
};

// Single evaluate pass shared by all three checks below. The bottom-nav
// element is detected ONCE here and reused both as an extra container to
// scan for clipped controls and as the collision-check target, so a plain
// fixed wrapper (no <nav>/role="navigation") is treated identically by both
// checks instead of only being recognized by one of them.
async function collectMobileFitState(page: Page): Promise<MobileFitState> {
  return page.evaluate(() => {
    const fixedEls: Element[] = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const style = getComputedStyle(el);
      if (style.position !== 'fixed') continue;
      if (style.pointerEvents === 'none') continue; // toast portals, inset-0 wrappers
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      fixedEls.push(el);
    }
    // A bottom nav is either semantically marked (nav / role=navigation) OR
    // merely tab-bar SHAPED: bottom-pinned, near-full-width, with 2+
    // interactive children. The shape fallback keeps this check alive if the
    // app shell ever renders the bar as a plain fixed wrapper.
    const bottomNav =
      fixedEls.find((el) => {
        const r = el.getBoundingClientRect();
        const bottomPinned = r.top > window.innerHeight - 140 && r.bottom >= window.innerHeight - 40;
        const wide = r.width > window.innerWidth * 0.6;
        if (!bottomPinned || !wide) return false;
        const semantic =
          el.tagName === 'NAV' || el.getAttribute('role') === 'navigation' || el.querySelector('nav') !== null;
        const tabBarShaped = el.querySelectorAll('a, button, [role="button"], [role="tab"]').length >= 2;
        return semantic || tabBarShaped;
      }) ?? null;

    // --- clipped header/nav/toolbar controls -----------------------------
    const containers = new Set<Element>(
      document.querySelectorAll('header, nav, [role="navigation"], [role="toolbar"]'),
    );
    // A plain fixed bottom-nav wrapper (recognized only via the shape
    // heuristic above, not <nav>/role) is otherwise invisible to this scan —
    // include it so a clipped control inside it is still caught.
    if (bottomNav) containers.add(bottomNav);

    const clipped: string[] = [];
    const seen = new Set<Element>();
    for (const container of containers) {
      // [role="tab"] included: the bottom-nav shape heuristic above counts
      // tabs as controls, so the clipping scan must see them too — a
      // partially clipped tab strip is exactly the regression this catches.
      for (const el of Array.from(container.querySelectorAll('a, button, [role="button"], [role="tab"]'))) {
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
          clipped.push(`"${label}" [left ${Math.round(r.left)}, right ${Math.round(r.right)}] vs viewport ${window.innerWidth}`);
        }
      }
    }

    // --- bottom-nav collision ---------------------------------------------
    const collisions: string[] = [];
    if (bottomNav) {
      const navRect = bottomNav.getBoundingClientRect();
      for (const el of fixedEls) {
        if (el === bottomNav || bottomNav.contains(el) || el.contains(bottomNav)) continue;
        const r = el.getBoundingClientRect();
        const overlapX = Math.min(r.right, navRect.right) - Math.max(r.left, navRect.left);
        const overlapY = Math.min(r.bottom, navRect.bottom) - Math.max(r.top, navRect.top);
        if (overlapX > 8 && overlapY > 8) {
          const label = (el.getAttribute('aria-label') || el.textContent || el.className.toString())
            .trim()
            .slice(0, 40);
          collisions.push(`"${label}" overlaps bottom nav by ${Math.round(overlapX)}×${Math.round(overlapY)}px`);
        }
      }
    }

    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      clipped,
      bottomNavFound: bottomNav !== null,
      collisions,
    };
  });
}

function assertNoHorizontalPan(state: MobileFitState, route: string): void {
  expect
    .soft(
      state.scrollWidth,
      `${route}: page pans horizontally (scrollWidth ${state.scrollWidth} > viewport ${state.innerWidth})`,
    )
    .toBeLessThanOrEqual(state.innerWidth + 1);
}

function assertNoClippedControls(state: MobileFitState, route: string): void {
  expect.soft(state.clipped, `${route}: header/nav controls clipped at viewport edge`).toEqual([]);
}

function assertNoBottomNavCollision(
  state: MobileFitState,
  route: string,
  opts: { expectBottomNav?: boolean } = {},
): void {
  if (opts.expectBottomNav) {
    // Authenticated dashboard surfaces carry a bottom nav at phone widths
    // (docs/MOBILE_DOCTRINE.md). Without this assertion, a missed/renamed
    // bottom nav would silently skip the collision check entirely.
    expect
      .soft(state.bottomNavFound, `${route}: no bottom navigation found at phone width (expected per MOBILE_DOCTRINE)`)
      .toBe(true);
  }
  expect.soft(state.collisions, `${route}: fixed element collides with bottom navigation`).toEqual([]);
}

async function expectMobileFit(
  page: Page,
  route: string,
  opts: { expectBottomNav?: boolean } = {},
): Promise<void> {
  await gotoSettled(page, route);
  const state = await collectMobileFitState(page);
  assertNoHorizontalPan(state, route);
  assertNoClippedControls(state, route);
  assertNoBottomNavCollision(state, route, opts);
}

for (const viewport of VIEWPORTS) {
  test.describe(`public routes @ ${viewport.width}px`, { tag: '@public' }, () => {
    test.use({ viewport });
    for (const route of PUBLIC_ROUTES) {
      test(`${route} fits ${viewport.width}px`, async ({ page }) => {
        await expectMobileFit(page, route);
        // Same final-pathname assertion the coach/player blocks make — a
        // public route that bounced to login/an error page must not pass by
        // measuring the wrong page.
        expect(new URL(page.url()).pathname, `expected ${route} to render`).toBe(route);
      });
    }
  });

  test.describe(`baseball coach routes @ ${viewport.width}px`, { tag: '@coach' }, () => {
    test.use({ viewport });
    for (const route of COACH_ROUTES) {
      test(`${route} fits ${viewport.width}px (coach)`, async ({ page }) => {
        await expectMobileFit(page, route, { expectBottomNav: true });
        // Assert the FINAL pathname, not just "didn't bounce to /login" — a
        // server route guard (src/lib/baseball/server-route-guards.ts) can
        // redirect an authed-but-unauthorized coach to a different dashboard
        // route entirely, which the old /login-only check would miss.
        expect(new URL(page.url()).pathname, `expected ${route} to render`).toBe(route);
      });
    }
  });

  test.describe(`baseball player routes @ ${viewport.width}px`, { tag: '@player' }, () => {
    test.use({ viewport });
    for (const route of PLAYER_ROUTES) {
      test(`${route} fits ${viewport.width}px (player)`, async ({ page }) => {
        await expectMobileFit(page, route, { expectBottomNav: true });
        // Same rationale as the coach block above: assert the FINAL
        // pathname rather than only rejecting /login.
        expect(new URL(page.url()).pathname, `expected ${route} to render`).toBe(route);
      });
    }
  });
}
