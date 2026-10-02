import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { localSupabase, removeTeamSeed, seedClubhouseTeam, seededRounds, type SeededTeam } from './helpers/clubhouse-local-seed';
import { signInAs } from './helpers/clubhouse-signin';
import { captureEvidence, EVIDENCE_DIR, hideDevOverlay } from './helpers/ui-audit-evidence';

/**
 * UI audit pass 1 (GolfHelm_Free_UI_UX_Testing_and_Audit_Chain, stages 2 and 4), on the Clubhouse shell with the flag on.
 *
 *  1. Baseline captures of Home, Messages and the shot-tracking routes (Rounds) as a coach and as a player, at 390 and
 *     1440 px. Evidence only: nothing compares against them. Images and a `captures.jsonl` log go to
 *     `.helm/runtime/ui-audit/` (gitignored). The data is synthetic (the local seed).
 *  2. An axe scan of the real, signed-in Messages page (a thread open, then the New message sheet open), at both widths.
 *
 * A coach's Rounds routes are not rebuilt (SWAP_AUDIT section 3); they are captured to show what a coach actually sees.
 * Rounds `continue/[uuid]` for a player is captured by `clubhouse-shot-persistence.spec.ts`, which owns an in-progress
 * round.
 *
 * LOCAL ONLY, like the other Clubhouse specs (it needs a seeded team):
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test e2e/clubhouse-ui-audit.spec.ts --project=chromium --workers=1
 */

test.skip(!localSupabase(), 'Clubhouse UI audit runs only against a local Supabase');
// Not serial: a violation in one scan must not stop the others from running (a failed test restarts the worker, which reseeds).
// Retina density, as a phone shows it: a 1x capture of a phone screen reads as blurry.
test.use({ deviceScaleFactor: 2 });

const WIDTHS = [390, 1440] as const;
const HEIGHT = { 390: 844, 1440: 900 } as const;

let team: SeededTeam;
let playerReviewRoundId = '';
let coachReviewRoundId = '';

test.beforeAll(async () => {
  test.setTimeout(5 * 60_000);
  // The team chat's four seeded lines are written by the coach and the first players, so the seed needs four players.
  team = await seedClubhouseTeam({ players: 4, roundsPerPlayer: 4, seed: 7 });
  const [mine] = (await seededRounds(team.players[0]!.playerId)).filter((r) => r.status === 'completed');
  if (!mine) throw new Error('the seed made no completed round for the first player');
  playerReviewRoundId = mine.id;
  coachReviewRoundId = mine.id;
  mkdirSync(EVIDENCE_DIR, { recursive: true });
});

test.afterAll(async () => {
  if (team) await removeTeamSeed(team);
});

/** Waits for the Clubhouse shell and its page, then lets fonts and the phone layout settle. */
async function settle(page: Page) {
  await expect(page.locator('[data-ui="clubhouse"]').first()).toBeVisible({ timeout: 240_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
}

/**
 * Opens a route. A dev server compiles a route on its first visit and restarts itself when it nears its memory limit,
 * which drops requests in flight, so a navigation that fails or stalls is attempted again.
 */
async function visit(page: Page, route: string) {
  await expect(async () => {
    await page.goto(route, { timeout: 120_000 });
  }).toPass({ timeout: 600_000, intervals: [2_000, 5_000] });
}

interface Shot {
  route: string;
  state: string;
  note?: string;
  /** A heading the settled page shows; the capture waits for it so a loading skeleton is never the evidence. */
  ready?: string;
}

async function sweep(page: Page, role: 'coach' | 'player', shots: Shot[]) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: HEIGHT[width] });
    // The server draws the layout of the device's last visit (the `ch_phone` cookie, F-36): one visit first, so a
    // capture shows the layout a returning user sees, not a first-ever load.
    await visit(page, '/golf/dashboard');
    await settle(page);
    for (const shot of shots) {
      // AUDIT_STATES=new-setup,review re-takes only those states.
      if (process.env.AUDIT_STATES && !process.env.AUDIT_STATES.split(',').includes(shot.state)) continue;
      await visit(page, shot.route);
      await page.waitForLoadState('load');
      // A route a role does not have may render NotRebuilt inside the shell, or redirect; either way it is captured.
      // A dev server can also reload the page after a source edit (Fast Refresh), so the settle repeats if the page moved.
      await expect(async () => {
        await page.waitForTimeout(1200);
        await page.waitForLoadState('load');
        await page.evaluate(() => document.fonts.ready);
      }).toPass({ timeout: 60_000 });
      if (shot.ready) await expect(page.getByRole('heading', { name: shot.ready })).toBeVisible({ timeout: 90_000 });
      const record = await captureEvidence(page, { role, route: shot.route.split('?')[0]!, state: shot.state, width, note: shot.note });
      expect.soft(record.finalPath, `${role} ${shot.route} at ${width}px landed on the login page`).not.toMatch(/\/login/);
      expect.soft(record.sidewaysScroll, `${role} ${shot.route} at ${width}px scrolls sideways`).toBe(false);
    }
  }
}

test('baseline captures, coach: Home, Messages, Rounds', async ({ page }) => {
  test.setTimeout(30 * 60_000);
  await signInAs(page, team.coach.email, team.coach.password);
  await sweep(page, 'coach', [
    { route: '/golf/dashboard', state: 'home' },
    { route: '/golf/dashboard/messages', state: 'inbox' },
    { route: `/golf/dashboard/messages?conversation=${team.conversationId}`, state: 'thread' },
    { route: `/golf/dashboard/rounds/${coachReviewRoundId}`, state: 'review', note: "coach opens a player's completed round" },
    { route: '/golf/dashboard/rounds', state: 'library', note: 'not rebuilt for a coach (SWAP_AUDIT section 3)' },
    { route: '/golf/dashboard/rounds/new', state: 'new', note: 'not rebuilt for a coach' },
    { route: '/golf/dashboard/rounds/recover', state: 'recover', note: 'not rebuilt for a coach' },
  ]);
});

test('baseline captures, player: Home, Messages, Rounds', async ({ page }) => {
  test.setTimeout(30 * 60_000);
  await signInAs(page, team.players[0]!.email, team.players[0]!.password);
  await sweep(page, 'player', [
    { route: '/golf/dashboard', state: 'home' },
    { route: '/golf/dashboard/messages', state: 'inbox' },
    { route: `/golf/dashboard/messages?conversation=${team.conversationId}`, state: 'thread' },
    { route: '/golf/dashboard/rounds', state: 'library' },
    { route: '/golf/dashboard/rounds/new', state: 'new-setup', ready: 'Track every shot of this round.' },
    { route: '/golf/dashboard/rounds/recover', state: 'recover-empty', note: 'nothing saved on this device: the empty state, not a recovery in progress' },
    { route: `/golf/dashboard/rounds/${playerReviewRoundId}`, state: 'review' },
  ]);
});

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const width of WIDTHS) {
  test(`accessibility, coach Messages at ${width}px: the page with a thread open, then New message (axe, ${AXE_TAGS.join(' ')})`, async ({ page }, testInfo) => {
    test.setTimeout(10 * 60_000);
    await page.setViewportSize({ width, height: HEIGHT[width] });
    await signInAs(page, team.coach.email, team.coach.password);
    await visit(page, '/golf/dashboard');
    await settle(page);
    await visit(page, `/golf/dashboard/messages?conversation=${team.conversationId}`);
    await settle(page);

    // This is the real, signed-in Messages page with the seeded team chat open, not the login screen or a placeholder.
    await expect(page).toHaveURL(/\/golf\/dashboard\/messages\?conversation=/);
    await expect(page.getByRole('heading', { name: 'Messages', exact: true }).or(page.getByRole('region', { name: /Conversation with/ })).first()).toBeVisible();
    await expect(page.getByText('Range at 3:30 today, wedges first.').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Sign in' })).toHaveCount(0);

    const out: Record<string, unknown> = {};

    await test.step('the page', async () => {
      await hideDevOverlay(page);
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      out.page = { violations: results.violations, incomplete: results.incomplete };
      expect.soft(results.violations, 'axe violations on the Messages page').toEqual([]);
    });

    await test.step('New message, opened', async () => {
      // On the phone the inbox sits behind an open thread (inert, so it is out of reach); New message is on the inbox.
      await visit(page, '/golf/dashboard/messages');
      await settle(page);
      await page.getByRole('button', { name: 'New message' }).first().click();
      // Desktop opens a dialog (a native <dialog>); the phone pushes a full-screen "New message" page instead.
      const dialog = page.getByRole('dialog').first();
      const phonePage = page.getByRole('heading', { name: 'New message' });
      await expect(dialog.or(phonePage).first()).toBeVisible({ timeout: 30_000 });
      const isDialog = await dialog.isVisible().catch(() => false);
      // Motion finishes before the scan: axe reads colours mid-fade as a violation.
      await page.waitForTimeout(700);
      await hideDevOverlay(page);
      await captureEvidence(page, { role: 'coach', route: '/golf/dashboard/messages', state: 'new-message', width, note: isDialog ? 'dialog' : 'full-screen phone page' });
      const builder = new AxeBuilder({ page }).withTags(AXE_TAGS);
      const results = await (isDialog ? builder.include('dialog[open]') : builder).analyze();
      out.newMessage = { surface: isDialog ? 'dialog' : 'full-screen phone page', violations: results.violations, incomplete: results.incomplete };
      expect.soft(results.violations, 'axe violations in New message').toEqual([]);
      if (isDialog) {
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden({ timeout: 10_000 });
        // Escape returns focus to the control that opened the dialog (guide section 6, "dialogs returning focus").
        await expect.soft(page.getByRole('button', { name: 'New message' }).first(), 'focus returns to New message after Escape').toBeFocused();
      }
    });

    const file = join(EVIDENCE_DIR, `axe-coach-messages-${width}.json`);
    writeFileSync(file, JSON.stringify(out, null, 2));
    await testInfo.attach(`axe-coach-messages-${width}.json`, { path: file, contentType: 'application/json' });
  });
}

// Home, scanned too: it is the first screen of both roles, and what a scan finds there is cheap to read next to Messages.
for (const role of ['coach', 'player'] as const) {
  for (const width of WIDTHS) {
    test(`accessibility, ${role} Home at ${width}px (axe, ${AXE_TAGS.join(' ')})`, async ({ page }, testInfo) => {
      test.setTimeout(10 * 60_000);
      await page.setViewportSize({ width, height: HEIGHT[width] });
      const who = role === 'coach' ? team.coach : team.players[0]!;
      await signInAs(page, who.email, who.password);
      await visit(page, '/golf/dashboard');
      await settle(page);
      await expect(page).toHaveURL(/\/golf\/dashboard$/);
      await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole('button', { name: 'Sign in' })).toHaveCount(0);
      await hideDevOverlay(page);
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      const file = join(EVIDENCE_DIR, `axe-${role}-home-${width}.json`);
      writeFileSync(file, JSON.stringify({ violations: results.violations, incomplete: results.incomplete }, null, 2));
      await testInfo.attach(`axe-${role}-home-${width}.json`, { path: file, contentType: 'application/json' });
      expect.soft(results.violations, `axe violations on ${role} Home at ${width}px`).toEqual([]);
    });
  }
}
