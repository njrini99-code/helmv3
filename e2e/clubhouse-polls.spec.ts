import { expect, test, type Browser, type Page } from '@playwright/test';
import { localSupabase, removeTeamSeed, seedClubhouseTeam, type SeededTeam } from './helpers/clubhouse-local-seed';

/**
 * Clubhouse polls in a team chat (P-2 build plan 11.6): a coach and a player in two browser contexts on the seeded team
 * chat. The coach starts a poll from Quick start and sends it; the player votes and changes the vote live; the coach
 * reminds, closes and shares the result, and each of those only fills the composer; a keyboard-only pass creates, votes
 * and closes; and at 390 x 844 the rows and footer links are at least 44 px tall.
 *
 * LOCAL ONLY, like the round and team-switch specs: it skips unless NEXT_PUBLIC_SUPABASE_URL is 127.0.0.1 or localhost,
 * seeds a team (coach, players, the team chat) through the local service role, and removes it after. WRITTEN, NOT RUN
 * where it was authored (no local stack and no browser runs in that session).
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test e2e/clubhouse-polls.spec.ts --project=chromium
 */

test.skip(!localSupabase(), 'Clubhouse polls e2e runs only against a local Supabase');
test.describe.configure({ mode: 'serial' });

let team: SeededTeam;

test.beforeAll(async () => {
  test.setTimeout(5 * 60_000);
  team = await seedClubhouseTeam({ players: 3, roundsPerPlayer: 1, seed: 7 });
});

test.afterAll(async () => {
  if (team) await removeTeamSeed(team);
});

async function signIn(browser: Browser, email: string, password: string, viewport = { width: 1280, height: 860 }): Promise<Page> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  // A dev server compiles each route on its first request.
  await page.goto('/golf/login', { timeout: 180_000 });
  await page.locator('#golf-signin-email').fill(email);
  await page.locator('#golf-signin-password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/golf/') && !u.pathname.endsWith('/login'), { timeout: 90_000 });
  return page;
}

async function openTeamChat(page: Page) {
  await page.goto('/golf/dashboard/messages', { timeout: 180_000 });
  await page.getByRole('button', { name: new RegExp(`${team.teamName} chat`) }).first().click();
  await expect(page.getByPlaceholder(/^Message /)).toBeVisible({ timeout: 60_000 });
}

const card = (page: Page, question: RegExp) => page.getByRole('group', { name: question }).filter({ has: page.locator('.ch-ms-poll__opts') });

async function sendVanPoll(page: Page) {
  await page.getByRole('button', { name: 'New poll' }).click();
  const sheet = page.getByRole('dialog', { name: 'New poll' });
  await sheet.getByRole('button', { name: 'Which van?' }).click();
  await sheet.getByRole('textbox', { name: 'Choice 2' }).fill('Van 2 with Coach Reyes');
  await sheet.getByRole('radio', { name: '1 hour' }).click();
  await sheet.getByRole('button', { name: 'Send poll' }).click();
  // The card lands in the coach's own thread at once (D27), before the sheet has finished closing.
  await expect(card(page, /Which van are you riding in\?/)).toBeVisible({ timeout: 5_000 });
  await expect(sheet).toBeHidden();
}

test('a coach sends a poll, a player votes and changes it, and the coach reminds, closes and shares', async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  const coach = await signIn(browser, team.coach.email, team.coach.password);
  const player = await signIn(browser, team.players[0]!.email, team.players[0]!.password);
  await openTeamChat(coach);
  await openTeamChat(player);

  // 1. Quick start, an edited choice, one hour, Send.
  await sendVanPoll(coach);
  const voters = team.players.length + 1;

  // 2. The player sees it live and votes; the coach sees the count without reloading.
  const playerCard = card(player, /Which van are you riding in\?/);
  await expect(playerCard).toBeVisible({ timeout: 30_000 });
  await playerCard.getByRole('radio', { name: /^Van 1/ }).click();
  const coachCard = card(coach, /Which van are you riding in\?/);
  await expect(coachCard).toContainText(`1 of ${voters} voted`, { timeout: 30_000 });
  await expect(coachCard.getByRole('radio', { name: /^Van 1, 1 vote/ })).toBeVisible();

  // 3. The player changes to Van 2; both cards move.
  await playerCard.getByRole('radio', { name: /^Van 2/ }).click();
  await expect(playerCard.getByRole('radio', { name: /^Van 2 with Coach Reyes, 1 vote, your vote/ })).toBeVisible();
  await expect(coachCard.getByRole('radio', { name: /^Van 2 with Coach Reyes, 1 vote/ })).toBeVisible({ timeout: 30_000 });
  await expect(coachCard.getByRole('radio', { name: /^Van 1, 0 votes/ })).toBeVisible();

  // 4. See votes, Remind: the composer holds the reply; nothing is sent until Send.
  const before = await coach.locator('.ch-ms-msg').count();
  await coachCard.getByRole('button', { name: 'See votes' }).click();
  const votes = coach.getByRole('dialog', { name: 'Votes' });
  await votes.getByRole('button', { name: /^Remind \d+$/ }).click();
  await expect(coach.getByPlaceholder(/^Message /)).toHaveValue(/can you vote in the poll/);
  expect(await coach.locator('.ch-ms-msg').count()).toBe(before);
  await coach.getByPlaceholder(/^Message /).fill('');

  // 5. The coach closes the poll; the player's card turns final live, and its taps do nothing.
  await coachCard.getByRole('button', { name: 'Close poll' }).click();
  const confirm = coach.getByRole('dialog', { name: 'Close this poll?' });
  await confirm.getByRole('button', { name: 'Close poll' }).click();
  await expect(playerCard).toContainText('Poll closed', { timeout: 30_000 });
  await expect(playerCard).toContainText('Final');
  await playerCard.getByRole('radio', { name: /^Van 1/ }).click();
  await expect(playerCard.getByRole('radio', { name: /^Van 1, 0 votes/ })).toBeVisible();

  // 6. Share result: the composer holds the summary.
  await coachCard.getByRole('button', { name: 'Share result' }).click();
  await expect(coach.getByPlaceholder(/^Message /)).toHaveValue(/Van 2 with Coach Reyes has it with 1 of the 1 who voted/);
  expect(await coach.locator('.ch-ms-msg').count()).toBe(before);

  await coach.context().close();
  await player.context().close();
});

test('keyboard only: create, vote and close (desktop)', async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const coach = await signIn(browser, team.coach.email, team.coach.password);
  await openTeamChat(coach);

  const newPoll = coach.getByRole('button', { name: 'New poll' });
  await newPoll.focus();
  await coach.keyboard.press('Enter');
  const sheet = coach.getByRole('dialog', { name: 'New poll' });
  await expect(sheet.getByLabel('Question')).toBeFocused();
  await coach.keyboard.type('Range or course tomorrow?');
  await coach.keyboard.press('Tab');
  await coach.keyboard.type('Range');
  await coach.keyboard.press('Tab');
  await coach.keyboard.type('Course');
  await sheet.getByRole('button', { name: 'Send poll' }).focus();
  await coach.keyboard.press('Enter');

  const poll = card(coach, /Range or course tomorrow\?/);
  await expect(poll).toBeVisible({ timeout: 5_000 });
  // The choices are one radio group: arrows move focus without voting, Space votes.
  await poll.getByRole('radio', { name: /^Range/ }).focus();
  await coach.keyboard.press('ArrowDown');
  await expect(poll.getByRole('radio', { name: /^Course/ })).toBeFocused();
  await coach.keyboard.press('Space');
  await expect(poll.getByRole('radio', { name: /^Course, 1 vote, your vote/ })).toBeVisible({ timeout: 30_000 });

  await poll.getByRole('button', { name: 'Close poll' }).focus();
  await coach.keyboard.press('Enter');
  const confirm = coach.getByRole('dialog', { name: 'Close this poll?' });
  await confirm.getByRole('button', { name: 'Close poll' }).focus();
  await coach.keyboard.press('Enter');
  await expect(poll).toContainText('Poll closed', { timeout: 30_000 });

  await coach.context().close();
});

test('on a 390 x 844 phone, poll rows and footer links are at least 44 px tall', async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const coach = await signIn(browser, team.coach.email, team.coach.password, { width: 390, height: 844 });
  await openTeamChat(coach);
  const poll = card(coach, /Range or course tomorrow\?|Which van are you riding in\?/).first();
  await expect(poll).toBeVisible({ timeout: 30_000 });

  const targets = [poll.getByRole('radio'), poll.locator('.ch-ms-poll__link')];
  for (const set of targets) {
    for (const el of await set.all()) {
      // A footer link is 28 px drawn and 44 px to a finger (its padding); the box measured is the hit area.
      const box = await el.boundingBox();
      expect(box, 'a poll target is on screen').not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  }

  await coach.context().close();
});
