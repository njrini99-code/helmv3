import { expect } from '@playwright/test';
import { golfPlayerTest as test, hasGolfPlayerAuth, requireGolfAuthOrSkip } from './fixtures/golf-auth';

/**
 * Course picker flicker (MOT-21). The unit tests in
 * src/components/fairway/pages/rounds-new/__tests__/ pin the contract with a
 * mocked drawer; this checks it in a real browser:
 *
 *  - reopening the picker shows the cached library, never a skeleton;
 *  - while the sheet slides away its title does not fall back to
 *    "Choose a course" mid-exit.
 *
 * Read-only: it opens and closes the picker, and never picks a tee or starts
 * a round.
 */

test.describe('Golf course picker flicker', () => {
  requireGolfAuthOrSkip(test, hasGolfPlayerAuth, 'GOLFHELM_PLAYER_* or E2E_GOLF_*');
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('reopening shows the cached library without a skeleton', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/golf/dashboard/rounds/new');
    const browse = page.getByRole('button', { name: 'Browse course library' }).first();
    test.skip(!(await browse.isVisible().catch(() => false)), 'No course library entry point on this account');

    await browse.click();
    const picker = page.locator('[data-slot="course-picker"]');
    await expect(picker).toBeVisible();
    const scroll = picker.locator('[data-slot="course-picker-scroll"]');
    // First open may load; wait for the library to settle.
    await expect(scroll.locator('[role="status"][aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 });

    await picker.getByRole('button', { name: 'Close' }).click();
    await expect(picker).toBeHidden();

    // Watch the second open from its first frame: a skeleton must never mount.
    await page.evaluate(() => {
      (window as unknown as { __sawSkeleton: boolean }).__sawSkeleton = false;
      new MutationObserver(() => {
        if (document.querySelector('[data-slot="course-picker-scroll"] [role="status"][aria-busy="true"]')) {
          (window as unknown as { __sawSkeleton: boolean }).__sawSkeleton = true;
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
    await browse.click();
    await expect(picker).toBeVisible();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => (window as unknown as { __sawSkeleton: boolean }).__sawSkeleton)).toBe(false);
  });
});
