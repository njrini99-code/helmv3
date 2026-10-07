import { expect, type Page } from '@playwright/test';
import { golfPlayerTest as test, hasGolfPlayerAuth, requireGolfAuthOrSkip } from './fixtures/golf-auth';

/**
 * Motion stillness (MOT-21). Two contracts from the golf motion rules:
 *
 *  1. Data renders final on mount: numbers never count up and charts never
 *     draw on, so the visible text of a data screen is identical right after
 *     load and a beat later.
 *  2. Reduced motion is honoured: with `prefers-reduced-motion: reduce`, no
 *     running animation on the page lasts longer than a hairline.
 */

const ROUTES = [
  '/golf/dashboard',
  '/golf/dashboard/stats',
  '/golf/dashboard/coachhelm',
  '/golf/dashboard/rounds',
  '/golf/dashboard/calendar',
];

/** Visible text of every element that looks like a data value (digits). */
async function numericText(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('main *'))
      .filter((el) => el.children.length === 0 && /\d/.test(el.textContent ?? ''))
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => (el.textContent ?? '').trim()),
  );
}

test.describe('Golf motion stillness', () => {
  requireGolfAuthOrSkip(test, hasGolfPlayerAuth, 'GOLFHELM_PLAYER_* or E2E_GOLF_*');
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  for (const route of ROUTES) {
    test(`${route}: numbers are final on mount`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto(route);
      await page.locator('main').first().waitFor();
      await page.waitForLoadState('networkidle');
      const first = await numericText(page);
      await page.waitForTimeout(800);
      expect(await numericText(page)).toEqual(first);
    });

    test(`${route}: reduced motion leaves no long-running animation`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(route);
      await page.locator('main').first().waitFor();
      await page.waitForLoadState('networkidle');
      const long = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.playState === 'running')
          .map((a) => {
            const t = a.effect?.getComputedTiming();
            const duration = typeof t?.duration === 'number' ? t.duration : 0;
            const target = (a.effect as KeyframeEffect | null)?.target as Element | null;
            return { duration, iterations: t?.iterations ?? 1, target: target?.getAttribute('data-slot') ?? target?.tagName ?? '?' };
          })
          // Skeleton shimmer is allowed to run only while data is loading, and
          // rests under reduced motion; anything else over 50ms is motion.
          .filter((a) => a.duration > 50 || a.iterations === Infinity),
      );
      expect(long).toEqual([]);
    });
  }
});
