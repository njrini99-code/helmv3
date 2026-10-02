import { expect, test, type Page } from '@playwright/test';
import {
  localSupabase,
  removeSeed,
  roundSnapshot,
  seedClubhousePlayer,
  seededRounds,
  type RoundSnapshot,
  type SeededPlayer,
} from './helpers/clubhouse-local-seed';
import { signInAs } from './helpers/clubhouse-signin';
import { captureEvidence } from './helpers/ui-audit-evidence';

/**
 * UI audit pass 1 (GolfHelm_Free_UI_UX_Testing_and_Audit_Chain section 7, "Highest-priority persistence scenario"):
 * does a round's shot data survive leaving, reloading and reopening, and does one tap produce one round?
 *
 * The contract under test is the one the product states: "Save for later" keeps the round on the server and Continue
 * reopens it at the next hole (`clubhouse-round.spec.ts`, F-06). What is new here is the comparison. Every check reads
 * the database with the service role (an authoritative read, never the app's own display) and compares the round id,
 * the holes' values, and each shot's values and count, before and after each way out and back in.
 *
 * Hole and shot row ids are NOT compared: `save_partial_round_atomic` deletes and re-inserts every hole and shot of a
 * round on each save, so only `golf_rounds.id` is stable. Values and counts are the record.
 *
 * LOCAL ONLY. It skips unless NEXT_PUBLIC_SUPABASE_URL is 127.0.0.1 or localhost (there is no staging project). Each
 * test seeds its own player and `afterEach` deletes it, rounds included. Run, in one shell that has the local stack's
 * variables (see e2e/README.md):
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test e2e/clubhouse-shot-persistence.spec.ts --project=chromium --workers=1
 */

test.skip(!localSupabase(), 'Clubhouse shot persistence runs only against a local Supabase');
test.describe.configure({ mode: 'serial' });

let seed: SeededPlayer | null = null;

test.beforeEach(async () => {
  seed = await seedClubhousePlayer();
});

test.afterEach(async () => {
  if (seed) await removeSeed(seed);
  seed = null;
});

const SHOTS_PER_HOLE = 3; // tee shot, approach, one putt: see `birdie`

/** Plays the current hole as a par-4 birdie: driver to the fairway, approach to 10 ft, one putt. */
async function birdie(page: Page, hole: number) {
  const region = page.getByRole('region', { name: `Hole ${hole}`, exact: true });
  await expect(region).toBeVisible({ timeout: 30_000 });
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

/**
 * Baseline evidence of the screen the player is on, at the two audit widths (390 and 1440). The viewport goes back to
 * the desktop size afterwards: the steps that follow drive the desktop layout.
 */
async function captureBothWidths(page: Page, route: string, state: string, note?: string) {
  for (const [width, height] of [[1440, 900], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(1200);
    await captureEvidence(page, { role: 'player', route, state, width, note });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(600);
}

/**
 * Takes the "Recover unsaved progress" dialog's Restore round, until the round's own page opens. A click that lands
 * before the page has hydrated does nothing, and a dev server compiles the Continue route on its first visit, so the
 * click is repeated while the dialog is still up.
 */
async function restoreRound(page: Page) {
  await expect(async () => {
    if (/\/rounds\/continue\//.test(page.url())) return;
    const restore = page.getByRole('dialog').getByRole('button', { name: /Restore round/ });
    if (await restore.isVisible().catch(() => false)) await restore.click({ timeout: 5_000 });
    await page.waitForURL(/\/rounds\/continue\//, { timeout: 20_000 });
  }).toPass({ timeout: 300_000, intervals: [1_000] });
}

/**
 * A dev server compiles a route on its first visit and, when that finishes, can reload the page it is on; a Restore or
 * Continue that is the first visit to the Continue route then ends on the old page. Visiting the routes once up front
 * (a made-up round id: the page shows its not-found state) keeps that out of the steps that follow. A production
 * server has nothing to compile.
 */
async function warmRoundRoutes(page: Page) {
  for (const path of ['/golf/dashboard/rounds', '/golf/dashboard/rounds/continue/00000000-0000-4000-8000-000000000000']) {
    await page.goto(path, { timeout: 240_000 }).catch(() => undefined);
    await page.waitForLoadState('load').catch(() => undefined);
  }
}

async function openSetup(page: Page, player: SeededPlayer) {
  await page.goto('/golf/dashboard/rounds/new', { timeout: 180_000 });
  await expect(page.getByRole('heading', { name: 'Track every shot of this round.' })).toBeVisible({ timeout: 120_000 });
  // The heading is server-rendered: a click before hydration does nothing, so the dialog is asked for until it opens.
  const picker = page.getByRole('dialog', { name: 'Where are you playing?' });
  await expect(async () => {
    if (!(await picker.isVisible())) await page.getByRole('button', { name: 'Browse courses' }).click({ timeout: 10_000 });
    await expect(picker).toBeVisible({ timeout: 8_000 });
  }).toPass({ timeout: 180_000 });
  await picker.getByRole('button', { name: new RegExp(player.courseName) }).click({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Play the White tees' }).click({ timeout: 60_000 });
}

/** Waits until the database holds `holes` scored holes and `shots` shots for the round, then returns the snapshot. */
async function settledSnapshot(roundId: string, holes: number, shots: number): Promise<RoundSnapshot> {
  await expect
    .poll(
      async () => {
        const s = await roundSnapshot(roundId);
        return [s.holes.filter((h) => h.score != null).length, s.shots.length];
      },
      { timeout: 60_000, message: 'the database should hold the played holes and every shot' },
    )
    .toEqual([holes, shots]);
  return roundSnapshot(roundId);
}

/** The values a round is made of, with the ids and timestamps that change on every save left out. */
function record(s: RoundSnapshot) {
  return {
    roundId: s.round.id,
    currentHole: s.round.current_hole,
    holes: s.holes,
    shots: s.shots,
    counts: { holes: s.holes.length, scoredHoles: s.holes.filter((h) => h.score != null).length, shots: s.shots.length },
  };
}

test('shots survive a reload, Save for later and a fresh browser session; values and counts never change', async ({ page, browser }) => {
  test.setTimeout(10 * 60_000);
  page.setDefaultTimeout(30_000);
  const player = seed!;

  await signInAs(page, player.email, player.password);
  await warmRoundRoutes(page);

  await test.step('set up a round and play holes 1 and 2', async () => {
    await openSetup(page, player);
    await page.getByRole('button', { name: 'Start round' }).click();
    await expect(page.getByRole('region', { name: 'Hole 1', exact: true })).toBeVisible({ timeout: 60_000 });
    await captureBothWidths(page, '/golf/dashboard/rounds/new', 'tracking-hole-1-tee-shot', 'the round is up at hole 1; no shot recorded yet');
    await birdie(page, 1);
    await birdie(page, 2);
    await expect(page.getByRole('region', { name: 'Hole 3' })).toBeVisible({ timeout: 30_000 });
  });

  const [round] = await seededRounds(player.playerId);
  if (!round) throw new Error('no round was created');
  expect(await seededRounds(player.playerId)).toHaveLength(1);

  const before = await settledSnapshot(round.id, 2, 2 * SHOTS_PER_HOLE);
  const recordA = record(before);
  let recordD: ReturnType<typeof record> | null = null;

  await test.step('what was typed is what is stored', async () => {
    expect(before.round.status).toBe('in_progress');
    expect(before.holes.map((h) => [h.hole_number, h.score, h.putts])).toEqual(
      expect.arrayContaining([[1, 3, 1], [2, 3, 1]]),
    );
    for (const hole of [1, 2]) {
      const shots = before.shots.filter((s) => s.hole_number === hole);
      expect(shots.map((s) => s.shot_number)).toEqual([1, 2, 3]);
      expect(shots[0]?.club_type?.toLowerCase()).toBe('driver');
      expect(shots[2]?.putt_made).toBe(true);
    }
  });

  await test.step('reload mid-round: nothing is lost, and the round is still one round', async () => {
    await page.reload({ timeout: 180_000 });
    // After a reload the tracking URL is the setup page again. If this device still holds a copy of the round that the
    // server does not fully cover, the engine offers it back; once the server holds everything the copy is cleared
    // (`clearEmergencySaveThrough`), nothing is offered, and the round waits in Rounds. Either way the player gets a way on.
    const restore = page.getByRole('dialog').getByRole('button', { name: /Restore round/ });
    const setup = page.getByRole('heading', { name: 'Track every shot of this round.' });
    const hole3 = page.getByRole('region', { name: 'Hole 3' });
    await expect(restore.or(setup).or(hole3).first()).toBeVisible({ timeout: 120_000 });
    // The device-copy check reads local storage and IndexedDB after the first paint.
    await page.waitForTimeout(5_000);
    let outcome: string;
    if (await restore.isVisible().catch(() => false)) {
      outcome = 'the recovery dialog offered the round back (Restore round)';
      await restoreRound(page);
    } else if (await hole3.isVisible().catch(() => false)) {
      outcome = 'the round reopened at hole 3';
    } else {
      outcome = 'a blank setup page: no recovery offered, the round was only in Rounds (Continue)';
      await page.goto('/golf/dashboard/rounds', { timeout: 180_000 });
      await page.getByRole('link', { name: 'Continue at hole 3' }).click();
      await page.waitForURL(/\/rounds\/continue\//, { timeout: 120_000 });
    }
    test.info().annotations.push({ type: 'reload outcome', description: outcome });
    await expect(hole3).toBeVisible({ timeout: 120_000 });
    expect(await seededRounds(player.playerId)).toHaveLength(1);
    expect(record(await roundSnapshot(round.id))).toEqual(recordA);
  });

  await test.step('Save for later, then Continue from Rounds', async () => {
    await page.getByRole('button', { name: 'Exit' }).click();
    await page.getByRole('dialog', { name: 'Exit round' }).getByRole('button', { name: /Save for later/ }).click();
    await page.waitForURL(/\/golf\/dashboard\/rounds(\?|$)/, { timeout: 60_000 });
    await page.getByRole('link', { name: 'Continue at hole 3' }).click();
    await page.waitForURL(/\/rounds\/continue\//, { timeout: 60_000 });
    await expect(page.getByRole('region', { name: 'Hole 3' })).toBeVisible({ timeout: 60_000 });
    await captureBothWidths(page, '/golf/dashboard/rounds/continue/[uuid]', 'continue-hole-3', 'two holes played, round reopened from Rounds');
    expect(await seededRounds(player.playerId)).toHaveLength(1);
    expect(record(await roundSnapshot(round.id))).toEqual(recordA);
  });

  await test.step('playing on adds hole 3 and leaves holes 1 and 2 as they were', async () => {
    await birdie(page, 3);
    const after = await settledSnapshot(round.id, 3, 3 * SHOTS_PER_HOLE);
    recordD = record(after);
    expect(recordD.roundId).toBe(recordA.roundId);
    // The round has all 18 hole rows from the start; the unplayed ones carry a par and no score.
    expect(recordD.holes.slice(0, 2)).toEqual(recordA.holes.slice(0, 2));
    expect(recordD.shots.slice(0, 2 * SHOTS_PER_HOLE)).toEqual(recordA.shots);
    expect(await seededRounds(player.playerId)).toHaveLength(1);
  });

  await test.step('Save for later again, then a fresh browser session (no local storage, no device copy) opens the same record', async () => {
    await page.getByRole('button', { name: 'Exit' }).click();
    await page.getByRole('dialog', { name: 'Exit round' }).getByRole('button', { name: /Save for later/ }).click();
    await page.waitForURL(/\/golf\/dashboard\/rounds(\?|$)/, { timeout: 60_000 });

    // A second device is a second session: opening the round there makes this one stale by design (the engine pauses a
    // device whose copy is older, "This round was updated on another device"), so the first one is finished with.
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const fresh = await context.newPage();
    fresh.setDefaultTimeout(30_000);
    try {
      await signInAs(fresh, player.email, player.password);
      await fresh.goto('/golf/dashboard/rounds', { timeout: 180_000 });
      await fresh.getByRole('link', { name: 'Continue at hole 4' }).click();
      await fresh.waitForURL(/\/rounds\/continue\//, { timeout: 120_000 });
      await expect(fresh.getByRole('region', { name: 'Hole 4' })).toBeVisible({ timeout: 90_000 });
      // Hole 1 to 3 shots come from the server alone: the review of a played hole shows them.
      await fresh.getByRole('button', { name: /Scorecard/ }).click();
      await expect(fresh.getByRole('dialog')).toBeVisible();
      expect(await seededRounds(player.playerId)).toHaveLength(1);
      expect(record(await roundSnapshot(round.id))).toEqual(recordD);
    } finally {
      await context.close();
    }
  });
});

test('a lost response to Start round, then a retry, never makes two rounds', async ({ page }) => {
  test.setTimeout(6 * 60_000);
  page.setDefaultTimeout(30_000);
  const player = seed!;

  await signInAs(page, player.email, player.password);
  await warmRoundRoutes(page);

  // The first start request reaches the server, which creates the round; the browser is handed a 503 instead of the
  // answer, which is what a dropped connection after the write looks like to the app.
  let dropped = 0;
  await page.route('**/golf/dashboard/rounds/new*', async (route) => {
    const request = route.request();
    const isStart = request.method() === 'POST' && !!request.headers()['next-action'] && (request.postData() ?? '').includes('startIntent');
    if (!isStart || dropped > 0) return route.continue();
    dropped++;
    await route.fetch();
    return route.fulfill({ status: 503, contentType: 'text/plain', body: 'connection lost' });
  });

  await openSetup(page, player);
  await page.getByRole('button', { name: 'Start round' }).click();
  await expect.poll(() => dropped, { timeout: 60_000 }).toBe(1);

  await test.step('the round the lost response created is on the server', async () => {
    await expect.poll(async () => (await seededRounds(player.playerId)).length, { timeout: 30_000 }).toBe(1);
  });

  await test.step('the player is told, and tapping Start again is possible', async () => {
    await expect(page.getByRole('button', { name: 'Start round' }).or(page.getByRole('button', { name: 'Retry' })).first()).toBeVisible({ timeout: 30_000 });
    const retry = page.getByRole('button', { name: 'Start round' });
    if (await retry.isVisible().catch(() => false)) await retry.click();
    else await page.getByRole('button', { name: 'Retry' }).first().click();
  });

  await test.step('one tap, one round: either the same round opens or the conflict dialog offers it', async () => {
    const hole1 = page.getByRole('region', { name: 'Hole 1', exact: true });
    const conflict = page.getByRole('dialog').getByRole('button', { name: /Resume/ });
    await expect(hole1.or(conflict)).toBeVisible({ timeout: 60_000 });
    test.info().annotations.push({ type: 'retry outcome', description: (await hole1.isVisible()) ? 'the same round opened at hole 1' : 'the in-progress conflict dialog offered the round' });
    const rounds = await seededRounds(player.playerId);
    expect(rounds.map((r) => r.status)).toEqual(['in_progress']);
  });
});

/** Starts a round on the setup screen and returns its id once hole 1 is up. */
async function startRound(page: Page, player: SeededPlayer): Promise<string> {
  await openSetup(page, player);
  await page.getByRole('button', { name: 'Start round' }).click();
  await expect(page.getByRole('region', { name: 'Hole 1', exact: true })).toBeVisible({ timeout: 60_000 });
  const [round] = await seededRounds(player.playerId);
  if (!round) throw new Error('no round was created');
  return round.id;
}

/**
 * Lets the first hole-save request through to the server, then replaces the answer. `drop` is what the browser sees
 * instead: a reset connection (fetch rejects with a TypeError) or a gateway error that carries a plain-text body.
 */
async function loseFirstHoleSaveResponse(page: Page, roundId: string, drop: 'connection-reset' | 'gateway-503'): Promise<() => number> {
  let dropped = 0;
  await page.route('**/golf/dashboard/rounds/**', async (route) => {
    const request = route.request();
    const body = request.postData() ?? '';
    const isHoleSave =
      request.method() === 'POST' && !!request.headers()['next-action'] && body.includes('holeNumber') && body.includes('"shots"') && body.includes(roundId) && !body.includes('startIntent');
    if (!isHoleSave || dropped > 0) return route.continue();
    dropped++;
    await route.fetch();
    if (drop === 'connection-reset') return route.abort('connectionreset');
    return route.fulfill({ status: 503, contentType: 'text/plain', body: 'connection lost' });
  });
  return () => dropped;
}

test('a hole save whose connection resets after the write heals itself: one hole, three shots, no stale-device lock', async ({ page }) => {
  test.setTimeout(6 * 60_000);
  page.setDefaultTimeout(30_000);
  const player = seed!;
  await signInAs(page, player.email, player.password);
  await warmRoundRoutes(page);
  const roundId = await startRound(page, player);
  const dropped = await loseFirstHoleSaveResponse(page, roundId, 'connection-reset');

  await birdie(page, 1);
  await expect.poll(dropped, { timeout: 60_000 }).toBe(1);

  // The engine treats a transport loss as its own unread write and saves again; the player does nothing.
  const stored = await settledSnapshot(roundId, 1, SHOTS_PER_HOLE);
  expect(stored.shots.map((x) => [x.hole_number, x.shot_number])).toEqual([[1, 1], [1, 2], [1, 3]]);
  expect(await seededRounds(player.playerId)).toHaveLength(1);
  await expect(page.getByText(/updated on another device/)).toHaveCount(0);
  await expect(page.getByText(/didn.t save/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Back to hole 2|Next hole|Hole 2/ }).first()).toBeVisible();
});

test('a hole save answered by a 503 after the write is stored once and recoverable; the screen blames another device (UI-001)', async ({ page }) => {
  test.setTimeout(6 * 60_000);
  page.setDefaultTimeout(30_000);
  const player = seed!;
  await signInAs(page, player.email, player.password);
  await warmRoundRoutes(page);
  const roundId = await startRound(page, player);
  const dropped = await loseFirstHoleSaveResponse(page, roundId, 'gateway-503');

  await birdie(page, 1);
  await expect.poll(dropped, { timeout: 60_000 }).toBe(1);
  const stored = record(await settledSnapshot(roundId, 1, SHOTS_PER_HOLE));

  await test.step('what the player is told', async () => {
    await expect(page.getByRole('button', { name: 'Try again' }).first()).toBeVisible({ timeout: 60_000 });
    const staleBanner = await page.getByText(/updated on another device/).first().isVisible().catch(() => false);
    if (staleBanner) await captureBothWidths(page, '/golf/dashboard/rounds/new', 'hole-save-503-stale-banner', 'UI-001: a 503 after a stored write reads as a conflict');
    test.info().annotations.push({
      type: 'UI-001',
      description: staleBanner
        ? 'A 503 with a text body after a stored write is shown as "updated on another device" (a conflict), and Try again cannot clear it'
        : 'The 503 was handled as an unread write (no stale-device banner)',
    });
  });

  await test.step('the stored record is intact and one Reload plus Restore round returns to it', async () => {
    expect(await seededRounds(player.playerId)).toHaveLength(1);
    const reload = page.getByRole('button', { name: 'Reload', exact: true }).first();
    if (await reload.isVisible().catch(() => false)) await reload.click();
    else await page.reload({ timeout: 180_000 });
    await expect(page.getByRole('dialog').getByRole('button', { name: /Restore round/ })).toBeVisible({ timeout: 120_000 });
    await restoreRound(page);
    await expect(page.getByRole('region', { name: /^Hole [12]/ }).first()).toBeVisible({ timeout: 120_000 });
    expect(await seededRounds(player.playerId)).toHaveLength(1);
    // The values and counts are the record. The round's cursor may differ: Restore rewrites the round from the device's
    // copy, which still sat on hole 1's review because the 503 hid the save that moved it on (observed: 2 before, 1 after).
    const restored = record(await roundSnapshot(roundId));
    test.info().annotations.push({ type: 'cursor', description: `current_hole ${stored.currentHole} before Restore, ${restored.currentHole} after` });
    expect({ ...restored, currentHole: null }).toEqual({ ...stored, currentHole: null });
  });
});
