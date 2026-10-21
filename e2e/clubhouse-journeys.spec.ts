import { expect, test, type Locator, type Page } from '@playwright/test';
import { localSupabase, removeTeamSeed, seedClubhouseTeam, type SeededTeam } from './helpers/clubhouse-local-seed';
import { assertGone, compileRoutes, journeyRows, NO_ROW_ID, signIn, sql, teamToday, warmRoutes } from './helpers/clubhouse-journey';

/**
 * Clubhouse write journeys: what a coach and a player write on Calendar, Qualifiers, Team Hub, Settings and Messages, through
 * the screens they use, against a real server and database, each checked in the database afterwards. The round from setup to
 * submit is `clubhouse-round.spec.ts`. Both run nightly in CI (`.github/workflows/clubhouse-journeys.yml`) on Chromium and
 * WebKit, against a Supabase stack started on the runner.
 *
 * LOCAL ONLY. It skips unless NEXT_PUBLIC_SUPABASE_URL is 127.0.0.1 or localhost: it seeds a coach, six players, a team chat,
 * a week of events and a closed qualifier through the local service role (`seedClubhouseTeam`), and deletes all of it after,
 * including every row the journeys made, which it checks is gone (`assertGone`).
 *
 *   CH_BASE=http://127.0.0.1:3100 npx playwright test --config playwright.clubhouse-journeys.config.ts
 */

test.skip(!localSupabase(), 'Clubhouse write journeys run only against a local Supabase');
test.describe.configure({ mode: 'serial' });

let team: SeededTeam;
let tag: string;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(30 * 60_000);
  // Six players, three rounds each, seed 7: the qualifier's standings have no tie at the last place on score, so one coach's
  // pick is all that stands between the closed qualifier and a confirmed squad.
  team = await seedClubhouseTeam({ players: 6, roundsPerPlayer: 3, seed: 7 });
  tag = `${team.tag} ${test.info().project.name}`;
  // Every route these journeys and the round spec visit, compiled before any of them writes (a no-op once compiled).
  await warmRoutes(browser, team.coach, [
    '/golf/dashboard/calendar',
    `/golf/dashboard/qualifiers/${team.qualifierId}/selection`,
    `/golf/dashboard/qualifiers/${team.qualifierId}`,
    '/golf/dashboard/team-hub',
    '/golf/dashboard/settings',
    '/golf/dashboard/messages',
  ]);
  await warmRoutes(browser, team.players[1]!, ['/golf/dashboard/team-hub', '/golf/dashboard/settings', '/golf/dashboard/messages', '/golf/dashboard/rounds', '/golf/dashboard/rounds/new']);
  await compileRoutes(browser, team.players[1]!, [`/golf/dashboard/rounds/continue/${NO_ROW_ID}`, `/golf/dashboard/rounds/${NO_ROW_ID}`]);
});

test.afterAll(async () => {
  test.setTimeout(5 * 60_000);
  if (!team) return;
  const made = await journeyRows(team);
  await removeTeamSeed(team);
  await assertGone(made);
});

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(30_000);
});

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const coach = () => team.coach;
const player = () => team.players[0]!;

async function open(page: Page, path: string) {
  await page.goto(path, { timeout: 180_000 });
  await expect(page.locator('.ch-root').first()).toBeVisible({ timeout: 120_000 });
}

test('Calendar: a coach publishes an event for the team, then edits it', async ({ page }) => {
  const title = `Journey practice ${tag}`;
  const edited = `${title} edited`;
  const today = teamToday();
  await signIn(page, coach());
  await open(page, '/golf/dashboard/calendar');

  await test.step('publish', async () => {
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Event title' }).fill(title);
    await editor.getByLabel('Date', { exact: true }).fill(today);
    await editor.getByLabel('Start time', { exact: true }).fill('10:00');
    await editor.getByLabel('End time', { exact: true }).fill('11:00');
    const selectAll = editor.getByRole('button', { name: 'Select all', exact: true });
    if (await selectAll.isVisible()) await selectAll.click();
    await expect(editor.getByText(`Invite · ${team.players.length} of ${team.players.length}`)).toBeVisible();
    await editor.getByRole('button', { name: 'Publish event', exact: true }).click();
    await expect(page.getByText(new RegExp(`^Published · ${escape(title)}`))).toBeVisible({ timeout: 60_000 });
  });

  const [event] = await sql<{ id: string; start: string; end: string; status: string }>(
    `select id, status, to_char(start_time at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI') as start,
            to_char(end_time at time zone 'America/New_York', 'HH24:MI') as end
       from golf_events where team_id = $1 and title = $2`,
    [team.teamId, title],
  );
  expect(event, 'the published event is in golf_events').toBeTruthy();
  expect(event).toMatchObject({ start: `${today} 10:00`, end: '11:00', status: 'confirmed' }); // F042: every new event is stamped 'confirmed' (calendar-events.ts)
  const invited = await sql<{ n: number }>('select count(*)::int as n from golf_event_attendance where event_id = $1', [event!.id]);
  expect(invited[0]!.n, 'every player is invited').toBe(team.players.length);

  await test.step('edit', async () => {
    await page.getByRole('button', { name: new RegExp(`^${escape(title)}, 10:00`) }).first().click();
    await page.getByRole('button', { name: 'Edit event', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Edit event' });
    await editor.getByRole('textbox', { name: 'Event title' }).fill(edited);
    await editor.getByLabel('End time', { exact: true }).fill('11:30');
    await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText(new RegExp(`^Saved · ${escape(edited)}`))).toBeVisible({ timeout: 60_000 });
  });

  await expect
    .poll(async () => sql(`select title, to_char(end_time at time zone 'America/New_York', 'HH24:MI') as end from golf_events where id = $1`, [event!.id]), { timeout: 30_000 })
    .toEqual([{ title: edited, end: '11:30' }]);
});

test('Qualifiers: a coach chooses a coach’s pick and confirms the squad', async ({ page }) => {
  const reason = `Course fit and form ${tag}`;
  await signIn(page, coach());
  await open(page, `/golf/dashboard/qualifiers/${team.qualifierId}/selection`);
  await expect(page.getByRole('heading', { name: 'Fall qualifier', level: 1 })).toBeVisible();
  // A tie at the last place on score would need the coach to give places first; the seed above has none.
  await expect(page.getByText(/tied/i)).toHaveCount(0);

  await page.getByRole('button', { name: 'Choose a player', exact: true }).click();
  const choose = page.getByRole('dialog', { name: /^Choose a coach.s pick$/ });
  await choose.getByRole('radio').first().check();
  await choose.getByRole('textbox', { name: 'Reason' }).fill(reason);
  await choose.getByRole('button', { name: 'Save pick', exact: true }).click();
  await expect(choose).toBeHidden();

  const confirmSquad = page.locator('.ch-qf-head').getByRole('button', { name: 'Confirm squad', exact: true });
  await expect(confirmSquad).toBeEnabled();
  await confirmSquad.click();
  const ask = page.getByRole('dialog', { name: 'Confirm the squad?' });
  await ask.getByRole('button', { name: 'Confirm squad', exact: true }).click();
  await page.waitForURL((u) => u.pathname === `/golf/dashboard/qualifiers/${team.qualifierId}`, { timeout: 60_000 });

  await expect.poll(async () => (await sql<{ s: string }>('select selection_state as s from golf_qualifiers where id = $1', [team.qualifierId]))[0]?.s).toBe('selected');
  const squad = await sql<{ player_id: string; coach_reasoning: string | null }>(
    'select player_id, coach_reasoning from golf_qualifier_selections where qualifier_id = $1',
    [team.qualifierId],
  );
  expect(squad, 'four on score and one coach’s pick').toHaveLength(5);
  expect(squad.filter((s) => s.coach_reasoning === reason), 'the pick carries its reason').toHaveLength(1);
});

test('Team Hub: a coach posts an announcement that asks players to acknowledge it', async ({ page }) => {
  const headline = `Journey bus times ${tag}`;
  await signIn(page, coach());
  await open(page, '/golf/dashboard/team-hub');
  await page.getByRole('button', { name: 'New announcement', exact: true }).click();
  const compose = page.getByRole('dialog', { name: 'New announcement' });
  await compose.getByLabel('Headline', { exact: true }).fill(headline);
  await compose.getByLabel('Message', { exact: true }).fill('The bus leaves the practice facility at 6:15. Bring your travel bag and both polos.');
  await expect(compose.getByRole('radio', { name: new RegExp(`^Whole team · ${team.players.length}$`) })).toHaveAttribute('aria-checked', 'true');
  await compose.getByRole('switch', { name: 'Ask players to acknowledge' }).check();
  await compose.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(compose).toBeHidden({ timeout: 60_000 });
  await expect(page.locator('#ch-content').getByText(headline).first()).toBeVisible();

  const [post] = await sql<{ id: string; ack: boolean }>('select id, requires_acknowledgement as ack from golf_announcements where team_id = $1 and title = $2', [team.teamId, headline]);
  expect(post?.ack, 'the announcement is stored and asks for acknowledgement').toBe(true);
  const recipients = await sql<{ n: number }>('select count(*)::int as n from golf_announcement_recipients where announcement_id = $1', [post!.id]);
  // A whole-team post has no recipient rows: none is how every reader tells "all team" (announcements.ts, step 2).
  expect(recipients[0]!.n, 'a whole-team post names no recipients').toBe(0);
});

test('Team Hub: a player acknowledges the announcement', async ({ page }) => {
  const headline = `Journey bus times ${tag}`;
  await signIn(page, player());
  await open(page, '/golf/dashboard/team-hub');
  const post = page.getByRole('article', { name: headline }).first();
  await expect(post.getByText('Needs your acknowledgement')).toBeVisible();
  await post.getByRole('button', { name: 'Got it', exact: true }).click();
  await expect(post.getByText('Acknowledged', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(async () =>
      sql<{ at: string | null }>(
        `select k.acknowledged_at as at from golf_announcement_acknowledgements k join golf_announcements a on a.id = k.announcement_id
          where a.team_id = $1 and a.title = $2 and k.player_id = $3`,
        [team.teamId, headline, player().playerId],
      ).then((r) => r.length === 1 && r[0]!.at !== null),
    )
    .toBe(true);
});

/** The save landed: main greys Save changes out; #2202's Settings removes its save bar once nothing is unsaved. */
async function saveSettled(section: Locator) {
  const save = section.getByRole('button', { name: 'Save changes', exact: true });
  await expect.poll(async () => (await save.count()) === 0 || (await save.isDisabled()), { timeout: 60_000 }).toBe(true);
}

test('Settings: a coach changes their name', async ({ page }) => {
  const name = `Dana Whitfield-Reyes`;
  await signIn(page, coach());
  await open(page, '/golf/dashboard/settings');
  const profile = page.getByRole('region', { name: 'Profile' });
  await profile.getByRole('textbox', { name: 'Full name' }).fill(name);
  await profile.getByRole('button', { name: 'Save changes', exact: true }).click();
  await saveSettled(profile);
  await expect.poll(async () => (await sql<{ n: string }>('select full_name as n from golf_coaches where id = $1', [team.coach.coachId]))[0]?.n).toBe(name);
});

test('Settings: a player changes their name', async ({ page }) => {
  await signIn(page, player());
  await open(page, '/golf/dashboard/settings');
  const profile = page.getByRole('region', { name: 'Profile' });
  await profile.getByRole('textbox', { name: 'First name' }).fill('Theodore');
  await profile.getByRole('textbox', { name: 'Last name' }).fill('Marsh-Ellery');
  await profile.getByRole('button', { name: 'Save changes', exact: true }).click();
  await saveSettled(profile);
  await expect
    .poll(async () => sql('select first_name, last_name from golf_players where id = $1', [player().playerId]))
    .toEqual([{ first_name: 'Theodore', last_name: 'Marsh-Ellery' }]);
});

const chat = () => `${team.teamName} chat`;

/** Opens the team chat on Messages (the desktop list keeps the newest conversation open; a click makes sure). */
async function openChat(page: Page) {
  await open(page, '/golf/dashboard/messages');
  const thread = page.getByRole('region', { name: `Conversation with ${chat()}` });
  if (!(await thread.isVisible())) await page.getByRole('complementary', { name: 'Conversations' }).getByRole('button', { name: new RegExp(`^${escape(chat())}`) }).click();
  await expect(thread).toBeVisible();
  return thread;
}

async function send(thread: Locator, text: string) {
  await thread.getByRole('textbox', { name: `Message ${chat()}` }).fill(text);
  await thread.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(thread.getByText(text, { exact: true })).toBeVisible({ timeout: 60_000 });
}

test('Messages: a coach sends to the team chat', async ({ page }) => {
  const text = `Tee times for Saturday are up ${tag}`;
  await signIn(page, coach());
  await send(await openChat(page), text);
  await expect
    .poll(async () => sql('select sender_id from golf_messages where conversation_id = $1 and content = $2', [team.conversationId, text]))
    .toEqual([{ sender_id: team.coach.userId }]);
});

test('Messages: a player reads it and replies', async ({ page }) => {
  const coachText = `Tee times for Saturday are up ${tag}`;
  const reply = `Got it, see you at the range ${tag}`;
  await signIn(page, player());
  const thread = await openChat(page);
  await expect(thread.getByText(coachText, { exact: true })).toBeVisible();
  await send(thread, reply);
  await expect
    .poll(async () => sql('select sender_id from golf_messages where conversation_id = $1 and content = $2', [team.conversationId, reply]))
    .toEqual([{ sender_id: player().userId }]);
});
