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

  test('continue round keeps the type editor and scorecard below the phone safe area', async ({
    page,
    context,
    browserName,
  }) => {
    test.setTimeout(90_000);
    test.skip(
      browserName !== 'chromium',
      'Safe-area emulation uses Chromium CDP.',
    );
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', {
      insets: { top: 47, bottom: 34 },
    });

    for (const viewport of [
      { width: 390, height: 844 },
      { width: 320, height: 694 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/golf/dashboard/rounds', {
        waitUntil: 'domcontentloaded',
      });

      // The authenticated QA player owns an unfinished round. Discover its
      // real id through the product flow so this test never invents or writes
      // a round record.
      const continueButton = page
        .getByRole('button', { name: 'Continue', exact: true })
        .first();
      await expect(continueButton).toBeVisible({ timeout: 15_000 });
      await Promise.all([
        page.waitForURL(/\/golf\/dashboard\/rounds\/continue\/[^/]+/, {
          timeout: 20_000,
        }),
        continueButton.click(),
      ]);

      await expect(
        page.getByRole('heading', { name: /^Hole \d+$/ }),
      ).toBeVisible({ timeout: 15_000 });
      const typeButton = page.getByRole('button', {
        name: 'Change round type',
        exact: true,
      });
      const contextHeader = page.getByTestId('continue-round-context');
      const scorecard = page.getByTestId('round-scorecard-header');
      const prevButton = page.getByRole('button', { name: /Prev/ }).first();
      await expect(typeButton).toBeVisible();
      await expect(contextHeader).toBeVisible();
      await expect(scorecard).toBeVisible();
      await expect(prevButton).toBeVisible();

      const typeBox = await typeButton.boundingBox();
      const contextBox = await contextHeader.boundingBox();
      const scorecardBox = await scorecard.boundingBox();
      const prevBox = await prevButton.boundingBox();
      expect(typeBox).not.toBeNull();
      expect(contextBox).not.toBeNull();
      expect(scorecardBox).not.toBeNull();
      expect(prevBox).not.toBeNull();
      expect(typeBox!.y).toBeGreaterThanOrEqual(47);
      // The scorecard follows the context directly. A second 47px safe-area
      // pad would produce the reported large blank band before Prev/Exit.
      expect(
        prevBox!.y - (contextBox!.y + contextBox!.height),
      ).toBeLessThanOrEqual(16);
      expect(
        await page.evaluate(() =>
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ),
        ),
      ).toBeLessThanOrEqual(viewport.width);

      const mutations: string[] = [];
      const onRequest = (request: import('@playwright/test').Request) => {
        // Only Next server-action POSTs can mutate this round. Ignore
        // analytics/telemetry requests emitted by the shell during the check.
        if (request.method() === 'POST' && request.headers()['next-action'])
          mutations.push(request.url());
      };
      page.on('request', onRequest);
      await typeButton.click();
      await expect(
        page.getByRole('heading', { name: 'Change round type', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(typeButton).toBeVisible();
      expect(mutations).toEqual([]);
      page.off('request', onRequest);

      await page.evaluate(() => window.scrollTo(0, 500));
      await expect
        .poll(async () => (await scorecard.boundingBox())?.y ?? -Infinity)
        .toBeGreaterThanOrEqual(46);
      await expect
        .poll(async () => (await scorecard.boundingBox())?.y ?? Infinity)
        .toBeLessThanOrEqual(48);
      await expect
        .poll(async () => (await prevButton.boundingBox())?.y ?? -Infinity)
        .toBeGreaterThanOrEqual(47);
      await expect
        .poll(async () => (await prevButton.boundingBox())?.y ?? Infinity)
        .toBeLessThanOrEqual(64);
      expect(
        await page.evaluate(() =>
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ),
        ),
      ).toBeLessThanOrEqual(viewport.width);
    }
  });

  test('holding a message opens anchored reactions without native text selection', async ({ page, context, browserName }) => {
    test.setTimeout(90_000);
    test.skip(browserName !== 'chromium', 'Touch hold uses Chromium CDP.');
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34 } });
    await page.goto('/golf/dashboard/messages');
    await page.getByRole('navigation', { name: 'Conversations' }).getByRole('button').first().click();
    const thread = page.getByRole('region', { name: 'Conversation' });
    await expect(thread.getByRole('textbox')).toBeVisible();
    const bubble = thread.locator('[data-message-bubble]').last();
    const popup = page.getByRole('dialog', { name: 'Message actions' });

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await bubble.scrollIntoViewIfNeeded();
      const target = await bubble.boundingBox();
      expect(target).not.toBeNull();
      const point = { x: target!.x + target!.width / 2, y: target!.y + target!.height / 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      // Deliberate dwell: this is the physical long-press gesture under test.
      await page.waitForTimeout(650);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(popup).toBeVisible();
      expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
      const bounds = await popup.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(8);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 8);
      expect(bounds!.y).toBeGreaterThanOrEqual(47);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844 - 34);
      await expect(popup.getByRole('button', { name: 'Copy message', exact: true })).toBeVisible();
      for (const reaction of await popup.locator('[aria-label="React to message"] button').all()) {
        await expect.poll(async () => (await reaction.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(44);
        await expect.poll(async () => (await reaction.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);

      await bubble.scrollIntoViewIfNeeded();
      const movedTarget = await bubble.boundingBox();
      const start = { x: movedTarget!.x + movedTarget!.width / 2, y: movedTarget!.y + movedTarget!.height / 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...start, y: start.y - 40 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(650);
      await expect(popup).toHaveCount(0);
    }
  });

});
