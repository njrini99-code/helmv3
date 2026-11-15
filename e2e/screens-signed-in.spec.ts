import { test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { localSupabase, removeTeamSeed, seedClubhouseTeam, type SeededTeam } from './helpers/clubhouse-local-seed';
import { assertGone, journeyRows, signIn } from './helpers/clubhouse-journey';
import { main as sweep } from '../scripts/screens/sweep.mjs';

/**
 * Every signed-in GolfHelm screen, as a coach and as a player, on a team seeded for this run (local Supabase only): the
 * screen sweep (`scripts/screens/sweep.mjs`) in WebKit at phone size and Chromium at desk size, light and dark, into one
 * gallery. The seed, every row the pages write on open, and the sessions are removed after, and checked gone.
 *
 * Opt-in (CH_SCREENS=1), run by `clubhouse-journeys.yml` when dispatched with `screens: true`:
 *   CH_SCREENS=1 CH_BASE=http://127.0.0.1:3100 npx playwright test -c playwright.clubhouse-journeys.config.ts screens-signed-in --project webkit
 * The screenshots are synthetic seed data, so the gallery is safe to upload as an artifact.
 */
test.skip(!localSupabase(), 'The signed-in sweep runs only against a local Supabase');
test.skip(process.env.CH_SCREENS !== '1', 'Opt-in: CH_SCREENS=1');

let team: SeededTeam;

test.beforeAll(async () => {
  test.setTimeout(20 * 60_000);
  team = await seedClubhouseTeam({ players: 6, roundsPerPlayer: 3, seed: 7 });
});

test.afterAll(async () => {
  test.setTimeout(5 * 60_000);
  if (!team) return;
  const made = await journeyRows(team);
  await removeTeamSeed(team);
  await assertGone(made);
});

test('every signed-in GolfHelm screen, coach and player', async ({ browser, baseURL }) => {
  test.setTimeout(90 * 60_000);
  const out = path.resolve(process.env.CH_SCREENS_OUT ?? 'test-results/screens-signed-in');
  await mkdir(out, { recursive: true });
  const states: Record<string, string> = {};
  for (const [role, who] of [['coach', team.coach], ['player', team.players[0]!]] as const) {
    const ctx = await browser.newContext({ baseURL });
    const page = await ctx.newPage();
    await signIn(page, who);
    states[role] = path.join(out, `.state-${role}.json`);
    await ctx.storageState({ path: states[role] });
    await ctx.close();
  }
  const code = await sweep([
    '--base', baseURL!,
    '--products', 'golf',
    '--access', 'signed-in',
    '--session', `golf:coach=${states.coach}`,
    '--session', `golf:player=${states.player}`,
    '--out', out,
  ]);
  test.info().annotations.push({ type: 'gallery', description: path.join(out, 'index.html') });
  if (code !== 0) throw new Error(`the sweep exited ${code}`);
});
