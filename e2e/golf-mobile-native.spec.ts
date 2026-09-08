import { expect } from '@playwright/test';
import { golfPlayerTest as test, hasGolfPlayerAuth, requireGolfAuthOrSkip } from './fixtures/golf-auth';

test.describe('Golf mobile native layout', () => {
  requireGolfAuthOrSkip(test, hasGolfPlayerAuth, 'GOLFHELM_PLAYER_* or E2E_GOLF_*');
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('active navigation labels and selected calendar days remain usable at 320px', async ({ page, context, browserName }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    if (browserName === 'chromium') {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34 } });
    }
    await page.goto('/golf/dashboard/rounds');
    const nav = page.getByRole('navigation', { name: 'Primary', exact: true });
    await expect(nav).toBeVisible();
    await page.setViewportSize({ width: 320, height: 694 });
    for (const control of await nav.locator('a,button').all()) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    }
    const label = nav.getByRole('link', { name: 'Rounds', exact: true }).getByText('Rounds', { exact: true });
    expect(await label.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/golf/dashboard/calendar');
    const rail = page.getByRole('group', { name: 'Week navigator' });
    await expect(rail).toBeVisible();
    await rail.getByRole('button').last().click();
    await page.setViewportSize({ width: 320, height: 694 });
    await expect.poll(async () => rail.evaluate(el => {
      const selected = el.querySelector('[aria-pressed="true"]')!;
      const target = selected.getBoundingClientRect();
      const bounds = el.getBoundingClientRect();
      return target.left >= bounds.left - 1 && target.right <= bounds.right + 1;
    })).toBe(true);
    for (const day of await rail.getByRole('button').all()) {
      expect((await day.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });

  test('phone drill views prioritize selected content and settings actions stay contained', async ({ page }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 320, height: 694 });
    await page.goto('/golf/dashboard/coachhelm?view=development');
    const heading = page.locator('[data-slot="drill"]').getByText('Development', { exact: true });
    await expect(heading).toBeVisible();
    expect((await heading.boundingBox())!.y).toBeLessThan(320);
    await expect(page.getByRole('link', { name: 'Log round', exact: true })).toBeHidden();

    await page.goto('/golf/dashboard/stats');
    const title = page.getByRole('heading', { name: 'Your stats', exact: true });
    await expect(title).toBeVisible();
    expect((await title.boundingBox())!.x).toBe(16);

    await page.goto('/golf/dashboard/settings');
    const upload = page.getByRole('button', { name: /^(Change Photo|Upload Photo)$/ });
    await expect(upload).toBeVisible();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const controls = page.getByRole('button', { name: /^(Change Photo|Upload Photo|Remove)$/ });
      for (const control of await controls.all()) {
        const box = await control.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(16);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width - 16);
      }
    }
  });
});
