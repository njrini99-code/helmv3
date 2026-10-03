import { expect, test } from '@playwright/test';
import pg from 'pg';
import { localSupabase, removeTeamSeed, seedClubhouseTeam, type SeededTeam } from './helpers/clubhouse-local-seed';

/**
 * PAGE_PERFORMANCE.md rule 8: a team switch never shows the old team's page under the new team's name. The refresh
 * payload is held back for three seconds, the way a slow phone network would; while it is held, the old team's page
 * must be faded out and take no taps, and once it lands the new team's roster is the one on screen.
 *
 * LOCAL ONLY, like the round spec: it skips unless NEXT_PUBLIC_SUPABASE_URL is 127.0.0.1 or localhost, seeds two
 * teams through the local service role, staffs the first team's head coach on the second, and deletes all of it after.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test e2e/clubhouse-team-switch.spec.ts --project=chromium
 */

test.skip(!localSupabase(), 'Clubhouse team switch e2e runs only against a local Supabase');
test.describe.configure({ mode: 'serial' });

let first: SeededTeam;
let second: SeededTeam;

test.beforeAll(async () => {
  test.setTimeout(5 * 60_000);
  first = await seedClubhouseTeam({ players: 4, roundsPerPlayer: 1, seed: 1 });
  second = await seedClubhouseTeam({ players: 6, roundsPerPlayer: 1, seed: 2 });
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
  try {
    await db.query(`insert into public.golf_team_coach_staff (team_id, coach_id, role, is_primary) values ($1, $2, 'head_coach', false)`, [second.teamId, first.coach.coachId]);
  } finally {
    await db.end();
  }
});

test.afterAll(async () => {
  if (second) await removeTeamSeed(second);
  if (first) await removeTeamSeed(first);
});

test('switching teams fades the old team out until the new team\'s page lands', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  page.setDefaultTimeout(30_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  // Only on the second team: shown after the switch, and never before.
  const onlySecond = second.players[5]!;
  const secondOnlyName = `${onlySecond.firstName} ${onlySecond.lastName}`;

  // A dev server compiles each route on its first request.
  await page.goto('/golf/login', { timeout: 180_000 });
  await page.locator('#golf-signin-email').fill(first.coach.email);
  await page.locator('#golf-signin-password').fill(first.coach.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/golf/') && !u.pathname.endsWith('/login'), { timeout: 90_000 });

  await page.goto('/golf/dashboard/roster', { timeout: 180_000 });
  const trigger = page.getByRole('button', { name: /Switch team$/ });
  await expect(trigger).toHaveAttribute('aria-label', `GolfHelm, ${first.teamName}. Switch team`, { timeout: 90_000 });
  await expect(page.locator('#ch-content').getByText(secondOnlyName)).toHaveCount(0);

  // Hold back the refreshed page (an RSC request that is not the server action itself) for three seconds.
  let held = 0;
  await page.route('**/golf/dashboard/roster**', async (route) => {
    const h = route.request().headers();
    if (h['rsc'] === '1' && !h['next-action']) {
      held += 1;
      await new Promise((r) => setTimeout(r, 3000));
    }
    await route.continue();
  });

  await trigger.click();
  await page.getByRole('option', { name: second.teamName }).click();

  // The tap shows at once; the old team's page is faded and takes no taps while the payload is held.
  await expect(trigger).toHaveAttribute('aria-label', `GolfHelm, ${second.teamName}. Switch team`);
  const root = page.locator('.ch-root');
  await expect(root).toHaveAttribute('data-ch-switching', '');
  await expect.poll(() => page.locator('#ch-content').evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(0);
  expect(await page.locator('#ch-content').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');

  // It lands: the mark lifts and the new team's roster is the page.
  await expect(page.locator('#ch-content').getByText(secondOnlyName).first()).toBeVisible({ timeout: 60_000 });
  await expect(root).not.toHaveAttribute('data-ch-switching', '');
  expect(await page.locator('#ch-content').evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
  expect(held).toBeGreaterThan(0);
});
