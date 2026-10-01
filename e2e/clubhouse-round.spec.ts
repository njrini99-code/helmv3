import { expect, test, type Page } from '@playwright/test';
import { localSupabase, removeSeed, scoredHoles, seedClubhousePlayer, seededRounds, type SeededPlayer } from './helpers/clubhouse-local-seed';

/**
 * Swap audit F-06: a Clubhouse round from setup to submit, through the screens a player uses, against a real server and
 * database. `golf-round.spec.ts` drives Fairway's controls and writes to whatever project its env points at.
 *
 * LOCAL ONLY. The spec skips unless NEXT_PUBLIC_SUPABASE_URL is 127.0.0.1 or localhost: it creates a user, a team, a
 * course and rounds, and there is no staging project (production has collected e2e rounds before). It seeds its own
 * player through the local service role and deletes everything it created afterwards, rounds included.
 *
 * Run (a local stack and a dev server pointed at it; see e2e/README.md):
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test e2e/clubhouse-round.spec.ts --project=chromium
 */

test.skip(!localSupabase(), 'Clubhouse round e2e runs only against a local Supabase (F-06)');
test.describe.configure({ mode: 'serial' });

let seed: SeededPlayer;

test.beforeAll(async () => {
  seed = await seedClubhousePlayer();
});

test.afterAll(async () => {
  if (seed) await removeSeed(seed);
});

/** Plays the current hole as a par-4 birdie: driver to the fairway, approach to 10 ft, one putt. */
async function birdie(page: Page, hole: number) {
  const region = page.getByRole('region', { name: `Hole ${hole}`, exact: true });
  // The next hole opens once the last one's save lands ("Saving hole N…"); a dev server can take seconds.
  await expect(region).toBeVisible({ timeout: 20_000 });
  await page.getByRole('radiogroup', { name: 'Club off tee' }).getByRole('radio', { name: 'Driver', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Shot result' }).getByRole('radio', { name: 'Fairway', exact: true }).click();
  await page.getByRole('group', { name: 'Quick distances' }).getByRole('button', { name: '140', exact: true }).click();
  await page.getByRole('button', { name: 'Record next shot' }).click();
  await page.getByRole('radiogroup', { name: 'Shot result' }).getByRole('radio', { name: /^Green/ }).click();
  await page.getByRole('group', { name: 'Quick distances' }).getByRole('button', { name: '10', exact: true }).click();
  await page.getByRole('button', { name: 'Record next shot' }).click();
  await page.getByRole('radiogroup', { name: 'Putt result' }).getByRole('radio', { name: 'Holed', exact: true }).click();
  await page.getByRole('button', { name: 'Complete hole with score 3' }).click();
}

test('a player sets up a round, saves it for later, continues it and submits all 18 holes', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  page.setDefaultTimeout(30_000);

  await test.step('sign in', async () => {
    await page.goto('/golf/login');
    await page.locator('#golf-signin-email').fill(seed.email);
    await page.locator('#golf-signin-password').fill(seed.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((u) => u.pathname.startsWith('/golf/') && !u.pathname.endsWith('/login'), { timeout: 90_000 });
  });

  await test.step('set up the round on Clubhouse', async () => {
    await page.goto('/golf/dashboard/rounds/new');
    await expect(page.getByRole('heading', { name: 'Track every shot of this round.' })).toBeVisible({ timeout: 90_000 });
    await page.getByRole('button', { name: 'Browse courses' }).click();
    await page.getByRole('dialog', { name: 'Where are you playing?' }).getByRole('button', { name: new RegExp(seed.courseName) }).click();
    await page.getByRole('button', { name: 'Play the White tees' }).click();
    await page.getByRole('button', { name: 'Start round' }).click();
  });

  await test.step('play hole 1; the round exists in progress', async () => {
    await birdie(page, 1);
    await expect(page.getByText('Thru 1')).toBeVisible();
    await expect.poll(async () => (await seededRounds(seed.playerId)).map((r) => r.status)).toEqual(['in_progress']);
  });

  await test.step('save for later, then continue it from Rounds', async () => {
    await page.getByRole('button', { name: 'Exit' }).click();
    await page.getByRole('dialog', { name: 'Exit round' }).getByRole('button', { name: /Save for later/ }).click();
    await page.waitForURL(/\/golf\/dashboard\/rounds(\?|$)/, { timeout: 60_000 });
    await expect(page.getByText(seed.courseName)).toBeVisible();
    // Tapped as soon as it shows: a Save for later that refreshed the library after navigating there used to pull a
    // quick Continue back to it (swap audit F-59).
    await page.getByRole('link', { name: 'Continue at hole 2' }).click();
    await page.waitForURL(/\/rounds\/continue\//, { timeout: 60_000 });
    await expect(page.getByRole('region', { name: 'Hole 2' })).toBeVisible({ timeout: 60_000 });
  });

  await test.step('play holes 2 to 18 and submit', async () => {
    for (let hole = 2; hole <= 18; hole++) await birdie(page, hole);
    await page.getByRole('button', { name: /^Submit/ }).click();
  });

  await test.step('the database holds a completed round with 18 scored holes', async () => {
    await expect.poll(async () => (await seededRounds(seed.playerId)).map((r) => r.status), { timeout: 60_000 }).toEqual(['completed']);
    const [round] = await seededRounds(seed.playerId);
    if (!round) throw new Error('no round');
    expect(round.total_score).toBe(54);
    expect(await scoredHoles(round.id)).toBe(18);
  });
});
