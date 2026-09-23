import { expect } from '@playwright/test';
import {
  golfCoachTest as coachTest,
  golfPlayerTest as playerTest,
  hasGolfCoachAuth,
  hasGolfPlayerAuth,
  requireGolfAuthOrSkip,
} from './fixtures/golf-auth';

/**
 * GolfHelm critical-path smoke coverage for surfaces the rest of e2e/ does
 * not touch: Roster, Calendar, Messaging, and the coach/player CoachHelm +
 * Stats surfaces. golf-dashboard.spec.ts / golf-round.spec.ts /
 * golf-qualifier.spec.ts / course-library.spec.ts cover login, round entry,
 * qualifiers, and the course library — none of them ever navigate to
 * /dashboard/roster, /dashboard/calendar, /dashboard/messages, or
 * /dashboard/intelligence.
 *
 * AUTH: the shared worker-scoped fixture signs in once per role, then each
 * test gets an isolated context with that authenticated storage state. This
 * prevents a long Golf suite from tripping the sign-in rate limiter while
 * retaining test isolation. Coach-facing tests run only with explicit coach
 * credentials; player tests may use the generic CI `E2E_GOLF_*` pair.
 */

coachTest.describe('GolfHelm — Coach critical paths', () => {
  requireGolfAuthOrSkip(coachTest, hasGolfCoachAuth, 'GOLFHELM_COACH_EMAIL / GOLFHELM_COACH_PASSWORD (seeded golf coach)');

  coachTest('dashboard renders without an error boundary', async ({ page }) => {
    await page.goto('/golf/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/golf\/dashboard$/);
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  coachTest('roster loads and shows the team', async ({ page }) => {
    await page.goto('/golf/dashboard/roster', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/golf\/dashboard\/roster/);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  coachTest('calendar loads and a month view renders', async ({ page }) => {
    await page.goto('/golf/dashboard/calendar', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/golf\/dashboard\/calendar/);
    // Header renders the current month/year (e.g. "August 2026"), not a
    // hardcoded string — assert the shape rather than a fixed month.
    await expect(page.locator('h1').first()).toContainText(
      /January|February|March|April|May|June|July|August|September|October|November|December/,
    );
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  coachTest('messages loads a conversation', async ({ page }) => {
    await page.goto('/golf/dashboard/messages', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/golf\/dashboard\/messages/);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  coachTest('CoachHelm intelligence hub renders', async ({ page }) => {
    await page.goto('/golf/dashboard/intelligence', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/golf\/dashboard\/intelligence/);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  coachTest('team stats renders', async ({ page }) => {
    await page.goto('/golf/dashboard/stats/team', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/golf\/dashboard\/stats\/team/);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  coachTest('an unavailable player deep-dive resolves to the GolfHelm not-found surface', async ({ page }) => {
    await page.goto('/golf/dashboard/players/00000000-0000-4000-8000-000000000000/game', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { name: "We couldn't find that" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/this page couldn't load|application error/i)).toHaveCount(0);
  });

  coachTest('an unavailable player genome resolves to the GolfHelm not-found surface', async ({ page }) => {
    await page.goto('/golf/dashboard/players/00000000-0000-4000-8000-000000000000/genome', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { name: "We couldn't find that" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/this page couldn't load|application error/i)).toHaveCount(0);
  });

  coachTest('an unavailable round review leaves its loading skeleton for a designed error state', async ({ page }) => {
    await page.goto('/golf/dashboard/rounds/00000000-0000-4000-8000-000000000000/review', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByText("We couldn't load this review")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByText(/this page couldn't load|application error/i)).toHaveCount(0);
  });
});

playerTest.describe('GolfHelm — Player critical paths', () => {
  requireGolfAuthOrSkip(playerTest, hasGolfPlayerAuth, 'GOLFHELM_PLAYER_* or E2E_GOLF_*');

  playerTest('player dashboard renders without an error boundary', async ({ page }) => {
    await page.goto('/golf/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/golf\/dashboard$/);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  playerTest('player CoachHelm surface renders', async ({ page }) => {
    await page.goto('/golf/dashboard/coachhelm', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/golf\/dashboard\/coachhelm/);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
  });

  playerTest('messages fills the desktop workspace and keeps actions beside the message', async ({ page }) => {
    for (const viewport of [{ width: 810, height: 1080 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(viewport);
      await page.goto('/golf/dashboard/messages', { waitUntil: 'domcontentloaded' });
      const rail = page.getByRole('navigation', { name: 'Conversations' });
      await expect(rail).toBeVisible({ timeout: 15_000 });
      await rail.getByRole('button').first().click();
      const thread = page.getByRole('region', { name: 'Conversation' });
      await expect(thread.getByRole('textbox')).toBeVisible({ timeout: 15_000 });
      await expect.poll(async () => {
        const box = await thread.boundingBox();
        return box ? Math.max(Math.abs(box.y), Math.abs(box.x + box.width - viewport.width), Math.abs(box.y + box.height - viewport.height)) : Infinity;
      }).toBeLessThanOrEqual(4);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      const action = thread.getByRole('button', { name: 'Message actions', exact: true }).last();
      await action.focus();
      await expect(action).toBeFocused();
      await page.keyboard.press('Enter');
      const popup = page.getByRole('dialog', { name: 'Message actions' });
      await expect(popup).toBeVisible();
      const box = await popup.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);
      await expect(action).toBeFocused();
    }
  });

  playerTest('mobile navigation and round picker respect phone safe areas', async ({ page, context, browserName }) => {
    playerTest.skip(browserName !== 'chromium', 'Safe-area emulation uses Chromium CDP.');
    await page.setViewportSize({ width: 320, height: 694 });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34 } });
    await page.goto('/golf/dashboard/messages', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('navigation', { name: 'Conversations', exact: true })).toBeVisible({ timeout: 15_000 });
    // Inbox entry must not select and mark an unseen conversation read.
    await expect(page.getByRole('region', { name: 'Conversation', exact: true })).toBeHidden();
    const nav = page.getByRole('navigation', { name: 'Primary', exact: true });
    for (const target of await nav.locator('a,button').all()) {
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(320);
      expect(box!.y + box!.height).toBeLessThanOrEqual(694 - 34);
    }
    await nav.getByRole('button', { name: 'More', exact: true }).click();
    const more = page.getByRole('dialog', { name: 'More', exact: true });
    await expect(more).toBeVisible();
    await more.getByRole('link', { name: 'Messages', exact: true }).click();
    await expect(more).toHaveCount(0);

    await page.goto('/golf/dashboard/rounds/new', { waitUntil: 'domcontentloaded' });
    const picker = page.locator('[data-slot="course-picker"]');
    await expect(picker).toBeVisible();
    const heading = picker.getByRole('heading', { level: 1 });
    const close = picker.getByRole('button', { name: 'Close', exact: true });
    for (const control of [heading, close]) {
      expect((await control.boundingBox())!.y).toBeGreaterThanOrEqual(47);
    }
    const course = picker.getByRole('button', { name: /^Open / }).first();
    await expect(course).toBeVisible({ timeout: 15_000 });
    await course.click();
    await expect(picker.getByRole('button', { name: 'Back to courses' })).toBeVisible();
    await expect.poll(async () => picker.locator('[data-slot="course-picker-scroll"]').evaluate(el => el.scrollTop)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await close.click();
    await expect(picker).toHaveCount(0);
    // This flow only inspects the tee picker; it never starts or writes a round.
  });

  playerTest('messages composer stays above the simulated keyboard', async ({ page }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 320, height: 694 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/golf/dashboard/messages', { waitUntil: 'domcontentloaded' });

      // The rail is a named navigation landmark (the conversation list), and
      // its first seeded row is the stable conversation this smoke test opens.
      const conversations = page.getByRole('navigation', { name: 'Conversations' });
      await expect(conversations).toBeVisible({ timeout: 15_000 });
      const firstConversation = conversations.getByRole('button').first();
      await expect(firstConversation).toBeVisible({ timeout: 15_000 });
      await firstConversation.click();

      const thread = page.getByRole('region', { name: 'Conversation' });
      const textbox = thread.getByRole('textbox');
      const composer = thread.locator('form').filter({ has: page.getByRole('textbox') });
      await expect(thread).toBeVisible({ timeout: 15_000 });
      await expect(textbox).toBeVisible({ timeout: 15_000 });
      await expect(composer).toBeVisible();

      const restingBottom = viewport.height;
      await expect.poll(async () => {
        const box = await composer.boundingBox();
        return box ? Math.abs(box.y + box.height - restingBottom) : Number.POSITIVE_INFINITY;
      }).toBeLessThanOrEqual(4);

      await page.evaluate(() => {
        document.documentElement.style.setProperty('--keyboard-height', '300px');
        document.body.classList.add('keyboard-open');
      });

      const keyboardBottom = viewport.height - 300;
      await expect.poll(async () => {
        const box = await composer.boundingBox();
        return box ? Math.abs(box.y + box.height - keyboardBottom) : Number.POSITIVE_INFINITY;
      }).toBeLessThanOrEqual(4);
      await expect(textbox).toBeVisible();
      const textboxBox = await textbox.boundingBox();
      expect(textboxBox).not.toBeNull();
      expect(textboxBox!.y).toBeGreaterThanOrEqual(0);
      expect(textboxBox!.y + textboxBox!.height).toBeLessThanOrEqual(keyboardBottom + 4);
      expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth))).toBeLessThanOrEqual(viewport.width);

      await page.evaluate(() => {
        document.documentElement.style.removeProperty('--keyboard-height');
        document.body.classList.remove('keyboard-open');
      });
      await expect.poll(async () => {
        const box = await composer.boundingBox();
        return box ? Math.abs(box.y + box.height - restingBottom) : Number.POSITIVE_INFINITY;
      }).toBeLessThanOrEqual(4);
    }
  });
});
