import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionReceipt } from '../action-types';
import type { CoachChatContext } from '../context';
import { CoachContextError } from '../context';
import type { PlayerChatContext, TaskTool, ToolContext } from '../engine/tool';
import type { TaskProposal } from '../tasks';
import { person } from './pgrst-double';

/**
 * Every task, against a database double that records any write and server actions that are spies:
 *   plan writes nothing and calls no action;
 *   commit writes once, and a second commit of the same card finds the first attempt's row instead of writing again;
 *   a write that throws after its row landed is reported done, and "nothing was saved" is only said after looking.
 */
const { world, action, executed } = vi.hoisted(() => {
  const world = { landed: false, lookFails: false, mode: 'ok' as 'ok' | 'fail' | 'throw_after_write', actionCalls: [] as string[], dbWrites: [] as string[], tables: {} as Record<string, unknown[]> };
  const action = (name: string, extra: Record<string, unknown> = {}) =>
    vi.fn(async (..._args: unknown[]) => {
      world.actionCalls.push(name);
      if (world.mode === 'fail') return { success: false, ok: false, data: null, error: 'The server said no.' };
      world.landed = true;
      if (world.mode === 'throw_after_write') throw new Error('updateTag failed after the insert');
      return { success: true, ok: true, data: { id: 'row-1' }, recipients: 2, ...extra };
    });
  const executed = (name: string) =>
    vi.fn(async (..._args: unknown[]) => {
      world.actionCalls.push(name);
      if (world.mode === 'fail') return { status: 'failed' as const, action: name, summary: 'The server said no.', created: [], notifications: [], partial_failures: [], error: 'The server said no.', retryable: true, at: 'now' };
      world.landed = true;
      if (world.mode === 'throw_after_write') throw new Error('threw after the insert');
      return { status: 'completed' as const, action: name, summary: 'Done.', created: [{ kind: name, count: 1 }], notifications: [], partial_failures: [], retryable: false, at: 'now' };
    });
  return { world, action, executed };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => true }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) }) })) }));
vi.mock('@/app/actions/messages', () => ({ sendGolfMessage: action('sendGolfMessage'), sendMessage: action('sendMessage') }));
vi.mock('@/app/golf/actions/calendar-events', () => ({ createGolfEvent: action('createGolfEvent') }));
vi.mock('@/app/golf/actions/travel', () => ({ createGolfTravelItinerary: action('createGolfTravelItinerary') }));
vi.mock('@/app/golf/actions/qualifier-actions', () => ({ createGolfQualifier: action('createGolfQualifier') }));
vi.mock('@/app/golf/actions/v3/goals', () => ({ createGoal: action('createGoal') }));
vi.mock('@/app/golf/actions/round-coach-note', () => ({ saveRoundCoachNote: action('saveRoundCoachNote') }));
vi.mock('@/app/golf/actions/calendar-blocked-time', () => ({ addCoachBlockedTime: action('addCoachBlockedTime') }));
vi.mock('@/app/golf/actions/class-status', () => ({ addTeamBreak: action('addTeamBreak'), saveTeamTerm: action('saveTeamTerm') }));
vi.mock('@/app/golf/actions/team-management', () => ({ setPlayerAvailabilityCoachNote: action('setPlayerAvailabilityCoachNote') }));
vi.mock('@/app/golf/actions/recruiting', () => ({ createRecruit: action('createRecruit') }));
vi.mock('@/app/golf/actions/tournaments', () => ({ lockTournamentLineup: action('lockTournamentLineup'), setTournamentEntries: action('setTournamentEntries') }));
vi.mock('@/app/golf/actions/practice-library', () => ({ createTeamDrill: action('createTeamDrill') }));
vi.mock('@/app/golf/actions/documents', () => ({ saveTextDocument: action('saveTextDocument') }));
vi.mock('@/app/golf/actions/practice-publish', () => ({ publishPracticePlan: action('publishPracticePlan', { recipients: 1 }) }));
// The goal's starting point is read with the app's own loader; here the player has no rounds to measure from.
vi.mock('@/lib/coachhelm/v3/goals/window-metric', async (orig) => ({ ...(await orig<typeof import('@/lib/coachhelm/v3/goals/window-metric')>()), loadPlayerWindowRounds: vi.fn(async () => []) }));
vi.mock('../action-planners', async (orig) => ({ ...(await orig<typeof import('../action-planners')>()), executeFocusArea: executed('create_focus_area'), executeTask: executed('create_task'), executeAnnouncement: executed('create_team_announcement') }));
vi.mock('../practice-planner', async (orig) => ({ ...(await orig<typeof import('../practice-planner')>()), executeRecurringPractice: executed('create_recurring_practice') }));

import { commitOnce, failedReceipt, taskTools } from '../tasks';

const P1 = '00000000-0000-4000-8000-000000000001';
const ID = '00000000-0000-4000-8000-0000000000aa';
const coach: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 'team-1', team_name: 'Rini University', timezone: 'America/New_York', roster: [person(P1, 'Eli Brandt')] };

const PLAN_BODY = { v: 2, focus: '', notes: '', place: 'Range', arrivalBufferMin: 15, bring: [], players: [P1], groups: [], variants: { main: { blocks: [{ id: 'b1', kind: 'team', title: 'Warm up', len: 20, coach: null, note: '', place: 'Putting green', drill: null }] }, rain: null } };
/** What the cards read: the world as the app holds it. A test changes `world.tables[table]` to move the world under a card. */
const WORLD = (): Record<string, unknown[]> => ({
  golf_players: [{ id: P1, user_id: 'u-p1' }],
  golf_coaches: [{ id: 'c1', user_id: 'u1', full_name: 'Sam Reyes' }],
  golf_rounds: [{ id: ID, player_id: P1, course_name: 'Pine Hill', round_date: '2026-11-01', total_score: 74 }],
  golf_round_reviews: [{ coach_notes: '' }],
  golf_player_availability_coach_notes: [],
  golf_tournaments: [{ id: ID, team_id: 'team-1', name: 'Fall Classic', start_date: '2026-11-14', end_date: '2026-11-15', version: 3, lineup_locked_at: null, substitutions: true }],
  golf_tournament_entries: [{ player_id: P1, role: 'lineup', slot: 1 }],
  golf_conversations: [{ id: ID, title: 'Team', team_id: 'team-1', golf_conversation_participants: [{ user_id: 'u1' }, { user_id: 'u-p1' }] }],
  golf_practice_plans: [{ id: ID, team_id: 'team-1', title: 'Thursday practice', body: PLAN_BODY, event_id: null, version: 1, published_version: null, active_variant: 'main', status: 'draft' }],
  golf_coachhelm_action_runs: [],
});

/** A database that answers what the cards read from `world.tables`, "is the row there?" from `world.landed`, never holds a held lineup, and records every write made through it. */
function db() {
  const from = (table: string) => {
    const rows = () => {
      // Once the write landed, the world shows it: the lineup is locked, the plan is published at the next version.
      if (world.landed && table === 'golf_tournaments') return (world.tables[table] as Array<Record<string, unknown>>).map((t) => ({ ...t, lineup_locked_at: new Date(Date.now() + 1000).toISOString() }));
      if (world.landed && table === 'golf_practice_plans') return (world.tables[table] as Array<Record<string, unknown>>).map((t) => ({ ...t, status: 'published', version: 2, published_version: 1 }));
      if (world.tables[table]) return world.tables[table];
      return world.landed ? [{ id: 'row-1', content: 'Earlier', is_deleted: false }] : [];
    };
    const answer = () => (world.lookFails ? { data: null, error: { message: 'timeout' } } : { data: rows(), error: null });
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'gte', 'lte', 'gt', 'lt', 'match', 'or', 'not', 'ilike', 'order', 'limit', 'range']) q[m] = () => q;
    for (const m of ['insert', 'update', 'upsert', 'delete']) q[m] = () => (world.dbWrites.push(`${m} ${table}`), q);
    q.maybeSingle = async () => ({ data: answer().data?.[0] ?? null, error: answer().error });
    q.single = q.maybeSingle;
    q.then = (ok: (r: unknown) => unknown) => Promise.resolve(answer()).then(ok);
    return q;
  };
  return { from, rpc: (name: string) => (world.dbWrites.push(`rpc ${name}`), Promise.resolve({ data: null, error: null })) } as never;
}
const ctx = (who: CoachChatContext | PlayerChatContext = coach): ToolContext => ({ sb: db(), who, conversationId: 'conv-1', surface: 'ask', loaders: {}, signal: new AbortController().signal, reads: new Map() });

const SAMPLES: Record<string, unknown> = {
  create_event: { title: 'Team practice', event_type: 'practice', date: '2026-11-12', start: '15:00' },
  create_trip: { event_name: 'Fall Classic', destination: 'Raleigh', transportation_type: 'van', departure_date: '2026-11-14' },
  create_qualifier: { name: 'Fall qualifier', start_date: '2026-11-15', num_rounds: 2, selection_slots_total: 5, selection_slots_coach_pick: 1, player_ids: [P1] },
  create_goal: { player_id: P1, metric_id: 'gir_pct', label: 'Greens', window_days: 30, target_value: 60, mode: 'suggested' },
  add_round_note: { round_id: ID, player_id: P1, note: 'Good wedge numbers' },
  add_blocked_time: { title: 'Recruiting trip', date: '2026-11-20' },
  add_team_break: { first_day: '2026-11-25', last_day: '2026-11-29', label: 'Thanksgiving' },
  save_team_term: { name: 'Spring 2027', classes_start: '2027-01-11', classes_end: '2027-04-30', exams_end: '2027-05-07' },
  set_availability_note: { player_id: P1, note: 'Out Thursday' },
  create_recruit: { first_name: 'Sam', last_name: 'Lee' },
  create_recurring_practice: { weekdays: [2], start_time: '15:00', occurrence_count: 4 },
  create_focus_area: { player_id: P1, title: 'Lag putting', area_type: 'putting' },
  create_task: { title: 'Log your rounds' },
  create_team_announcement: { title: 'Bus time', body: 'The bus leaves at seven.' },
  create_drill: { name: 'Ladder', area: 'putting', minutes: 15 },
  publish_practice_plan: { plan_id: ID, version: 1, team_chat: false },
  publish_artifact: { title: 'Eli report', body: 'Words about Eli.' },
  send_message: { conversation_id: ID, content: 'See you at three.' },
  set_lineup: { tournament_id: ID, entries: [{ player_id: P1, role: 'lineup', slot: 1 }] },
  lock_lineup: { tournament_id: ID },
};
/** The tasks whose own row can be looked for: by request id, or by the card's natural key since it was planned. */
const LOOKABLE = ['create_event', 'add_blocked_time', 'create_recruit', 'create_trip', 'create_qualifier', 'create_goal', 'send_message', 'create_drill', 'publish_artifact', 'create_focus_area', 'create_task', 'create_team_announcement', 'create_recurring_practice', 'lock_lineup', 'publish_practice_plan'];

type Task = TaskTool<unknown, TaskProposal>;
const all = (): Task[] => {
  const byName = new Map<string, Task>();
  for (const t of [...taskTools({ quickChat: false }), ...taskTools({ quickChat: true })]) byName.set(t.name, t as Task);
  return [...byName.values()];
};
const planned = async (t: Task) => t.plan(ctx(), t.input.parse(SAMPLES[t.name]));

beforeEach(() => {
  Object.assign(world, { landed: false, lookFails: false, mode: 'ok', tables: WORLD() });
  world.actionCalls.length = 0;
  world.dbWrites.length = 0;
});

describe('every task', () => {
  it('has a sample here, so a new task cannot skip these checks', () => {
    expect(all().map((t) => t.name).sort()).toEqual(Object.keys(SAMPLES).sort());
  });

  it.each(Object.keys(SAMPLES))('%s: plan builds the card and writes nothing', async (name) => {
    const tool = all().find((t) => t.name === name)!;
    const proposal = await planned(tool);
    expect(proposal).toMatchObject({ tool: name, idempotency_key: expect.any(String), action: expect.any(String), summary: expect.any(String) });
    expect(JSON.parse(JSON.stringify(proposal))).toEqual(proposal);
    expect(world.actionCalls).toEqual([]);
    expect(world.dbWrites).toEqual([]);
  });

  it.each(Object.keys(SAMPLES))('%s: commit writes once and says it is done', async (name) => {
    const tool = all().find((t) => t.name === name)!;
    const proposal = await planned(tool);
    const receipt = await tool.commit(ctx(), { ...proposal, idempotency_key: `${proposal.idempotency_key}:req1` });
    expect(receipt.status).toBe('completed');
    expect(world.actionCalls).toHaveLength(1);
    expect(receipt.summary.length).toBeGreaterThan(3);
  });

  it.each(LOOKABLE)('%s: a second commit of the same card does not write again', async (name) => {
    const tool = all().find((t) => t.name === name)!;
    const proposal = { ...(await planned(tool)), idempotency_key: 'card-1' };
    await tool.commit(ctx(), proposal);
    const again = await tool.commit(ctx(), proposal);
    expect(again.status).toBe('completed');
    expect(world.actionCalls).toHaveLength(1);
  });

  it.each(LOOKABLE)('%s: a write that threw after its row landed is reported done, not offered again', async (name) => {
    world.mode = 'throw_after_write';
    const tool = all().find((t) => t.name === name)!;
    const receipt = await tool.commit(ctx(), { ...(await planned(tool)), idempotency_key: 'card-2' });
    expect(receipt.status).toBe('completed');
    expect(receipt.summary).not.toMatch(/nothing was saved/i);
  });

  it.each(LOOKABLE)('%s: "nothing was saved" is said only after looking', async (name) => {
    world.mode = 'fail';
    const tool = all().find((t) => t.name === name)!;
    const looked = await tool.commit(ctx(), { ...(await planned(tool)), idempotency_key: 'card-3' });
    expect(looked).toMatchObject({ status: 'failed', retryable: true });
    expect(looked.summary).toMatch(/Nothing was saved\.$/);
    // When the look itself fails, the receipt says it could not check, and is not offered for a blind retry.
    // (The card is made while the app can be read: a card is never built on a read that failed.)
    const card = await planned(tool);
    world.lookFails = true;
    const blind = await tool.commit(ctx(), { ...card, idempotency_key: 'card-4' });
    expect(blind).toMatchObject({ status: 'failed', retryable: false });
    expect(blind.summary).toMatch(/could not check whether anything was saved/);
    expect(blind.summary).not.toMatch(/Nothing was saved/);
  });

  it('publish_artifact: the card says in plain words that players will see it, and how many', async () => {
    const tool = all().find((t) => t.name === 'publish_artifact')!;
    const roster = [person(P1, 'Eli Brandt'), person('00000000-0000-4000-8000-0000000000a2', 'Maya Ortiz'), person('00000000-0000-4000-8000-0000000000a3', 'Noah Kim')];
    const proposal = await tool.plan(ctx({ ...coach, roster }), tool.input.parse(SAMPLES.publish_artifact));
    expect(proposal.action).toBe('Publish to 3 players');
    expect(proposal.facts[0]).toMatchObject({ label: 'Who can see it', value: 'Players on Rini University will be able to see this: all 3 active players.' });
    expect(proposal.notifications).toEqual(['Players on Rini University will be able to see this in Documents (all 3 active players), once the Undo window closes. Nobody gets a notification.']);
    // One player is still said as one.
    const one = await tool.plan(ctx(), tool.input.parse(SAMPLES.publish_artifact));
    expect(one.facts[0]?.value).toBe('Players on Rini University will be able to see this: the 1 active player.');
    expect(world.actionCalls).toEqual([]);
  });

  it('a card for the same words on a later request is its own message', async () => {
    const { sendGolfMessage } = await import('@/app/actions/messages');
    vi.mocked(sendGolfMessage).mockClear();
    const tool = all().find((t) => t.name === 'send_message')!;
    const proposal = await planned(tool);
    await tool.commit(ctx(), { ...proposal, idempotency_key: 'first-request' });
    world.landed = false;
    await tool.commit(ctx(), { ...proposal, idempotency_key: 'second-request' });
    const ids = vi.mocked(sendGolfMessage).mock.calls.map((c) => c[2]);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('only lock_lineup skips the Undo window', () => {
    expect(all().filter((t) => t.immediate).map((t) => t.name)).toEqual(['lock_lineup']);
  });

  it('a player cannot plan or commit any of them', async () => {
    const player: PlayerChatContext = { ...coach, player_id: P1 };
    for (const tool of all()) {
      await expect(tool.plan(ctx(player), tool.input.parse(SAMPLES[tool.name]))).rejects.toBeInstanceOf(CoachContextError);
      await expect(tool.commit(ctx(player), { tool: tool.name, input: SAMPLES[tool.name], planned_at: new Date().toISOString(), idempotency_key: 'k', action: '', summary: '', facts: [], affects: [], notifications: [], missing: [] })).rejects.toBeInstanceOf(CoachContextError);
    }
    expect(world.actionCalls).toEqual([]);
  });
});

describe('where a task lands, and which row it wrote', () => {
  const CAL = '/golf/dashboard/calendar';

  it('each card says where its row will appear, known when it is planned; a task that adds no row to a list says nothing', async () => {
    const lands: Record<string, unknown> = {};
    for (const t of all()) lands[t.name] = (await planned(t)).lands ?? null;
    expect(lands).toEqual({
      create_event: { kind: 'event', home: CAL, day: '2026-11-12' },
      create_recurring_practice: { kind: 'event', home: CAL, day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
      add_blocked_time: { kind: 'blocked_time', home: CAL, day: '2026-11-20' },
      create_task: { kind: 'task', home: '/golf/dashboard/tasks' },
      create_team_announcement: { kind: 'announcement', home: '/golf/dashboard/announcements' },
      create_trip: { kind: 'trip', home: '/golf/dashboard/travel', day: '2026-11-14' },
      create_qualifier: { kind: 'qualifier', home: '/golf/dashboard/qualifiers', day: '2026-11-15' },
      create_recruit: { kind: 'recruit', home: '/golf/dashboard/recruiting' },
      create_focus_area: { kind: 'focus_area', home: `/golf/dashboard/roster?player=${P1}` },
      send_message: { kind: 'message', home: `/golf/dashboard/messages?conversation=${ID}` },
      set_lineup: { kind: 'lineup', home: `/golf/dashboard/tournaments/${ID}` },
      publish_practice_plan: { kind: 'plan', home: `/golf/dashboard/practice/${ID}` },
      create_goal: null,
      add_round_note: null,
      add_team_break: null,
      save_team_term: null,
      set_availability_note: null,
      create_drill: null,
      publish_artifact: null,
      lock_lineup: null,
    });
  });

  it('an event’s receipt names the row it wrote and opens that event on its day; the same card names the same row again', async () => {
    const tool = all().find((t) => t.name === 'create_event')!;
    const proposal = { ...(await planned(tool)), idempotency_key: 'card-land-1' };
    const [made] = (await tool.commit(ctx(), proposal)).created;
    expect(made!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(made).toMatchObject({ kind: 'event', count: 1, ids: [made!.id], href: `${CAL}?date=2026-11-12&event=${made!.id}` });
    // A retry of the card finds its row by that id and reports the same one.
    world.landed = true;
    expect((await tool.commit(ctx(), proposal)).created[0]).toEqual(made);
    // Another card is another row.
    world.landed = false;
    expect((await tool.commit(ctx(), { ...proposal, idempotency_key: 'card-land-2' })).created[0]!.id).not.toBe(made!.id);
  });

  it('blocked time and a recruit name their rows too; a task whose action does not say which row it wrote names none', async () => {
    const receiptOf = async (name: string) => {
      const tool = all().find((t) => t.name === name)!;
      return (await tool.commit(ctx(), { ...(await planned(tool)), idempotency_key: `card-${name}` })).created[0]!;
    };
    expect(await receiptOf('add_blocked_time')).toMatchObject({ kind: 'blocked_time', id: expect.stringMatching(/^[0-9a-f-]{36}$/), href: `${CAL}?date=2026-11-20` });
    expect(await receiptOf('create_recruit')).toMatchObject({ kind: 'recruit', id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(await receiptOf('create_goal')).not.toHaveProperty('id');
    expect(await receiptOf('create_trip')).not.toHaveProperty('id');
  });
});

describe('commitOnce', () => {
  it('with nothing to look by, it still writes, and a failure says it could not check', async () => {
    const write = vi.fn(async (): Promise<ActionReceipt> => ({ status: 'failed', action: 'add_team_break', summary: 'No.', created: [], notifications: [], partial_failures: [], error: 'No.', retryable: false, at: 'now' }));
    const receipt = await commitOnce('add_team_break', async () => 'unknown', write);
    expect(write).toHaveBeenCalledTimes(1);
    expect(receipt.summary).toBe('No. I could not check whether anything was saved: look in the Calendar before trying again.');
  });

  it('never repeats "nothing was saved" twice', () => {
    expect(failedReceipt('create_event', 'not_there', 'That didn’t go through. Nothing was saved.', 'the Calendar').summary).toBe('That didn’t go through. Nothing was saved.');
  });
});
