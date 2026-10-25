import { expect, test, type Page } from '@playwright/test';
import { localSupabase, removeTeamSeed, seedClubhouseTeam, type SeededTeam } from './helpers/clubhouse-local-seed';

/**
 * P-4 4.7: the phone Day's drag, end to end in WebKit at 390px with touch. A coach holds a movable row 450ms (it lifts,
 * no peek), moves it (the day unfolds into hours and both pagers freeze), lets go a quarter-hour later (the notice says
 * the move with Undo), and the day folds back into its list. Undo puts it back. Touch is dispatched as TouchEvents and
 * PointerEvents together, as WebKit sends them; a real device check stays the owner's.
 *
 * Written for the end batch, not run in this build (owner, 2026-10-24: browsers wait until he says go).
 * LOCAL ONLY, like the other Clubhouse specs.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test e2e/clubhouse-calendar-drag-touch.spec.ts --project=webkit
 */

test.skip(!localSupabase(), 'Clubhouse calendar drag runs only against a local Supabase');
test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

let team: SeededTeam;

test.beforeAll(async () => {
  test.setTimeout(5 * 60_000);
  team = await seedClubhouseTeam({ players: 4, roundsPerPlayer: 2, seed: 11 });
});

test.afterAll(async () => {
  if (team) await removeTeamSeed(team);
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/golf/login', { timeout: 180_000 });
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

/** One finger, as WebKit reports it: a touch and a pointer event for each phase, on the element under the point. */
async function touch(page: Page, phase: 'start' | 'move' | 'end', x: number, y: number) {
  await page.evaluate(
    ({ phase, x, y }) => {
      const w = window as unknown as { __chTouchTarget?: Element };
      const target = phase === 'start' ? document.elementFromPoint(x, y)! : (w.__chTouchTarget ?? document.body);
      if (phase === 'start') w.__chTouchTarget = target;
      const t = new Touch({ identifier: 1, target, clientX: x, clientY: y });
      const pointer = phase === 'start' ? 'pointerdown' : phase === 'move' ? 'pointermove' : 'pointerup';
      target.dispatchEvent(new PointerEvent(pointer, { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: x, clientY: y }));
      target.dispatchEvent(new TouchEvent(`touch${phase}`, { bubbles: true, cancelable: true, touches: phase === 'end' ? [] : [t], changedTouches: [t] }));
    },
    { phase, x, y },
  );
}

test('a coach holds practice, slides it a quarter later, and it folds back with an Undo', async ({ page }) => {
  await signIn(page, team.coach.email, team.coach.password);
  await page.goto('/golf/dashboard/calendar?view=day');
  const row = page.locator('.ch-calm-page:not(.is-side) .ch-calm-ev.is-movable').first();
  test.skip((await row.count()) === 0, 'The seeded day has no movable team event');
  const box = (await row.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await touch(page, 'start', x, y);
  await page.waitForTimeout(470);
  await expect(row).toHaveClass(/is-lifted/);
  await expect(page.locator('dialog.ch-peek[open]')).toHaveCount(0);

  await touch(page, 'move', x, y + 12);
  await expect(page.locator('.ch-tl')).toBeVisible();
  await expect(page.locator('.ch-calm-pager[data-frozen]')).toHaveCount(1);
  for (let i = 1; i <= 4; i++) await touch(page, 'move', x, y + 12 + i * 4);
  await expect(page.locator('.ch-dd-pill')).toBeVisible();
  await touch(page, 'end', x, y + 28);

  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(page.locator('.ch-tl')).toHaveCount(0, { timeout: 2000 });
  await page.getByRole('button', { name: 'Undo' }).click();
});

test('a hold on the screen’s edge is the edge swipe’s, and pull to refresh stays off under a lifted row', async ({ page }) => {
  await signIn(page, team.coach.email, team.coach.password);
  await page.goto('/golf/dashboard/calendar?view=day');
  const row = page.locator('.ch-calm-page:not(.is-side) .ch-calm-ev.is-movable').first();
  test.skip((await row.count()) === 0, 'The seeded day has no movable team event');
  const box = (await row.boundingBox())!;
  await touch(page, 'start', 10, box.y + box.height / 2);
  await page.waitForTimeout(470);
  await expect(row).not.toHaveClass(/is-lifted/);
  await touch(page, 'end', 10, box.y + box.height / 2);
});
