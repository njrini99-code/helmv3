import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import {
  localSupabase,
  removeSeed,
  removeTeamSeed,
  seedClubhouseCoach,
  seedClubhousePlayer,
  seedClubhouseTeam,
  type SeededPlayer,
  type SeededTeam,
} from './helpers/clubhouse-local-seed';
import { signIn, warmRoutes } from './helpers/clubhouse-journey';

/**
 * Evidence screenshots of every Clubhouse page on its real route, with seeded data on a LOCAL Supabase: each page at 390px (an
 * iPhone-sized WebKit) and 1280px, as a coach and as a player where the page has that role, plus one empty state (a coach whose
 * team has no players, a player with no rounds) and, where a page writes, one failure state (the write's server action refused).
 * Server reads run in the Next server, so a read failure cannot be forced from the browser on a real route; pages that only read
 * have no failure capture here.
 *
 * Files are named and filed by scripts/clubhouse/shots.mjs (`name --phase evidence`, then `record`); `clubhouse:shots -- log --page
 * P### --write` adds the VERIFY rows. Off unless CH_ROUTE_SHOTS=1, WebKit only (what Helm's users run):
 *
 *   CH_ROUTE_SHOTS=1 CH_BASE=http://127.0.0.1:3100 npx playwright test --config playwright.clubhouse-journeys.config.ts \
 *     e2e/clubhouse-route-shots.spec.ts --project=webkit
 */

test.skip(process.env.CH_ROUTE_SHOTS !== '1', 'Evidence capture: set CH_ROUTE_SHOTS=1');
test.skip(!localSupabase(), 'Route screenshots seed users: local Supabase only');
test.skip(({ browserName }) => browserName !== 'webkit', 'Captured in WebKit');
test.describe.configure({ mode: 'serial' });

type Role = 'coach' | 'player' | 'none';
interface Who {
  email: string;
  password: string;
}

// The commit the captures are taken on; CH_SHOTS_SHA names it where git cannot read the checkout (a browser container).
const SHA = process.env.CH_SHOTS_SHA ?? execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim();
const WIDTHS = [390, 1280] as const;

let team: SeededTeam;
let emptyCoach: SeededTeam;
let emptyPlayer: SeededPlayer;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(30 * 60_000);
  team = await seedClubhouseTeam({ players: 8, roundsPerPlayer: 12, seed: 20261016 });
  emptyCoach = await seedClubhouseCoach();
  emptyPlayer = await seedClubhousePlayer();
  await warmRoutes(browser, team.coach, Object.values(coachRoutes()).map(([, path]) => path));
  await warmRoutes(browser, team.players[0]!, Object.values(playerRoutes()).map(([, path]) => path));
});

test.afterAll(async () => {
  test.setTimeout(5 * 60_000);
  if (team) await removeTeamSeed(team);
  if (emptyCoach) await removeTeamSeed(emptyCoach);
  if (emptyPlayer) await removeSeed(emptyPlayer);
});

/** Page id → [surface, route] for a coach on the seeded team. */
function coachRoutes(): Record<string, [string, string]> {
  return {
    P002: ['home', '/golf/dashboard'],
    P003: ['roster', '/golf/dashboard/roster'],
    P004: ['team-stats', '/golf/dashboard/stats'],
    P005: ['player-stats', `/golf/dashboard/stats?player=${team.players[0]!.playerId}`],
    P006: ['calendar', '/golf/dashboard/calendar'],
    P007: ['messages', '/golf/dashboard/messages'],
    P008: ['settings', '/golf/dashboard/settings'],
    P009: ['qualifiers', '/golf/dashboard/qualifiers'],
    P010: ['team-hub', '/golf/dashboard/team-hub'],
    P011: ['round-review', `/golf/dashboard/rounds/${team.roundIds[0]}`],
    P013: ['coachhelm', '/golf/dashboard/coachhelm'],
    P014: ['recruiting', '/golf/dashboard/recruiting'],
  };
}

/** Page id → [surface, route] for a player on the seeded team. */
function playerRoutes(): Record<string, [string, string]> {
  return {
    P002: ['home', '/golf/dashboard'],
    P003: ['roster', '/golf/dashboard/roster'],
    P005: ['my-stats', '/golf/dashboard/stats'],
    P006: ['calendar', '/golf/dashboard/calendar'],
    P007: ['messages', '/golf/dashboard/messages'],
    P008: ['settings', '/golf/dashboard/settings'],
    P009: ['qualifiers', '/golf/dashboard/qualifiers'],
    P010: ['team-hub', '/golf/dashboard/team-hub'],
    P011: ['rounds', '/golf/dashboard/rounds'],
    P012: ['classes', '/golf/dashboard/classes'],
    P013: ['coachhelm', '/golf/dashboard/coachhelm'],
  };
}

async function context(browser: Browser, width: number): Promise<BrowserContext> {
  const use = test.info().project.use;
  const phone = width < 600;
  return browser.newContext({
    baseURL: use.baseURL,
    locale: use.locale,
    timezoneId: use.timezoneId,
    viewport: phone ? { width, height: 844 } : { width, height: 900 },
    deviceScaleFactor: phone ? 3 : 2,
    isMobile: phone,
    hasTouch: phone,
    // Resting screens: no crossfade or sheet caught halfway.
    reducedMotion: 'reduce',
  });
}

/** Waits for the page to settle: the Clubhouse root, no requests in flight, fonts. */
async function settle(page: Page) {
  await expect(page.locator('.ch-root').first()).toBeVisible({ timeout: 120_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
}

async function open(page: Page, path: string) {
  await expect(async () => {
    await page.goto(path, { timeout: 180_000 });
    await settle(page);
  }).toPass({ timeout: 6 * 60_000 });
}

/** Saves the viewport under its clubhouse:shots name and records it in the page's manifest. */
async function shot(page: Page, f: { page: string; surface: string; role: Role; state: string; route: string; note: string }) {
  const viewport = String(page.viewportSize()!.width);
  const file = execFileSync('node', ['scripts/clubhouse/shots.mjs', 'name', '--page', f.page, '--surface', f.surface, '--role', f.role, '--viewport', viewport, '--state', f.state, '--phase', 'evidence', '--sha', SHA], {
    encoding: 'utf8',
  }).trim();
  await page.screenshot({ path: file });
  const engine = page.context().browser();
  execFileSync('node', ['scripts/clubhouse/shots.mjs', 'record', file, '--route', f.route, '--browser', `webkit ${engine?.version() ?? ''}`.trim(), '--note', f.note]);
}

async function pages(browser: Browser, who: Who, role: 'coach' | 'player', routes: Record<string, [string, string]>, state: string, note: string) {
  for (const width of WIDTHS) {
    const ctx = await context(browser, width);
    const page = await ctx.newPage();
    try {
      await expect(async () => signIn(page, who)).toPass({ timeout: 10 * 60_000 });
      for (const [id, [surface, path]] of Object.entries(routes)) {
        await open(page, path);
        await shot(page, { page: id, surface, role, state, route: path.split('?')[0]!, note });
      }
    } finally {
      await ctx.close();
    }
  }
}

test('every page as a coach, seeded team', async ({ browser }) => {
  test.setTimeout(40 * 60_000);
  await pages(browser, team.coach, 'coach', coachRoutes(), 'populated', `real route; local stack; seeded team (8 players, 12+ rounds each); ${SHA}`);
});

test('every page as a player, seeded team', async ({ browser }) => {
  test.setTimeout(40 * 60_000);
  await pages(browser, team.players[0]!, 'player', playerRoutes(), 'populated', `real route; local stack; seeded team, first player; ${SHA}`);
});

test('empty states: a coach with no players, a player with no rounds', async ({ browser }) => {
  test.setTimeout(40 * 60_000);
  const coach = coachRoutes();
  const player = playerRoutes();
  const emptyCoachRoutes = Object.fromEntries(['P002', 'P003', 'P004', 'P006', 'P007', 'P009', 'P010', 'P013', 'P014'].map((id) => [id, coach[id]!]));
  const emptyPlayerRoutes = Object.fromEntries(['P005', 'P011', 'P012'].map((id) => [id, player[id]!]));
  await pages(browser, emptyCoach.coach, 'coach', emptyCoachRoutes, 'empty', `real route; local stack; a head coach whose team has no players or data; ${SHA}`);
  await pages(browser, emptyPlayer, 'player', emptyPlayerRoutes, 'empty', `real route; local stack; a player with no rounds on a team with no coach; ${SHA}`);
});
