import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
const LOOKABLE = ['create_event', 'add_blocked_time', 'create_recruit', 'create_trip', 'create_qualifier', 'create_goal', 'send_message', 'create_drill', 'publish_artifact', 'create_focus_area', 'create_task', 'create_team_announcement', 'create_recurring_practice', 'lock_lineup', 'publish_practice_plan', 'add_team_break', 'save_team_term'];

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
      publish_practice_plan: { kind: 'plan', home: `/golf/dashboard/practice/plan/${ID}` },
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

/**
 * The card is the truth: what a coach checks is read by the server, the model's input is intent only, and `commit`
 * refuses, without calling the app's action, when the world no longer matches the card.
 */
describe('the card is the truth', () => {
  const P2 = '00000000-0000-4000-8000-000000000002';
  const tool = (name: string) => all().find((t) => t.name === name)!;
  const plan = (name: string, input: unknown, who: CoachChatContext = coach) => tool(name).plan(ctx(who), tool(name).input.parse(input));
  const commit = (name: string, proposal: TaskProposal) => tool(name).commit(ctx(), { ...proposal, idempotency_key: `${proposal.idempotency_key}:card` });
  const factOf = (p: TaskProposal, label: string) => p.facts.find((f) => f.label === label || f.label.startsWith(`${label} (`))?.value;
  const two: CoachChatContext = { ...coach, roster: [person(P1, 'Eli Brandt'), person(P2, 'Maya Ortiz')] };

  it('lock_lineup names the tournament and every seat, says what locking does, and that it cannot be undone', async () => {
    world.tables.golf_tournament_entries = [{ player_id: P2, role: 'alternate', slot: null }, { player_id: P1, role: 'lineup', slot: 1 }];
    const card = await plan('lock_lineup', SAMPLES.lock_lineup, two);
    expect(factOf(card, 'Tournament')).toBe('Fall Classic · 2026-11-14 to 2026-11-15');
    expect(factOf(card, 'Lineup')).toBe('1. Eli Brandt\nAlternate: Maya Ortiz');
    expect(factOf(card, 'What locking does')).toMatch(/copied to every round/);
    expect(card.undo).toEqual({ window: false, after: expect.stringMatching(/cannot be unlocked, here or anywhere in the app\. This tournament allows substitutions/) });
    expect(card.impact).toMatch(/can no longer be edited/);
    expect(card.visual).toMatchObject({ kind: 'lineup', locking: true, tournament: { name: 'Fall Classic' }, seats: [{ slot: 1, name: 'Eli Brandt', id: P1 }, { name: 'Maya Ortiz', alternate: true }] });
    expect(card.affects.map((a) => a.id)).toEqual([P1, P2]);
    // A tournament that does not allow substitutions says so.
    world.tables.golf_tournaments = [{ ...(world.tables.golf_tournaments![0] as object), substitutions: false }];
    expect((await plan('lock_lineup', SAMPLES.lock_lineup, two)).undo?.after).toMatch(/does not allow substitutions/);
    expect(world.actionCalls).toEqual([]);
  });

  it('lock_lineup gives no card for a lineup that is not there, is already locked, or is on another team', async () => {
    world.tables.golf_tournament_entries = [];
    await expect(plan('lock_lineup', SAMPLES.lock_lineup)).rejects.toThrow(/No lineup is set on Fall Classic/);
    world.tables = { ...WORLD(), golf_tournaments: [{ ...(WORLD().golf_tournaments![0] as object), lineup_locked_at: '2026-11-09T10:00:00Z' }] };
    await expect(plan('lock_lineup', SAMPLES.lock_lineup)).rejects.toThrow(/already locked \(since 2026-11-09\)/);
    world.tables = { ...WORLD(), golf_tournaments: [{ ...(WORLD().golf_tournaments![0] as object), team_id: 'another-team' }] };
    await expect(plan('lock_lineup', SAMPLES.lock_lineup)).rejects.toBeInstanceOf(CoachContextError);
    await expect(plan('set_lineup', SAMPLES.set_lineup)).rejects.toBeInstanceOf(CoachContextError);
  });

  it('lock_lineup does not lock a lineup the coach has not seen: a seat changed after the card', async () => {
    const card = await plan('lock_lineup', SAMPLES.lock_lineup, two);
    world.tables.golf_tournament_entries = [{ player_id: P2, role: 'lineup', slot: 1 }];
    const receipt = await tool('lock_lineup').commit(ctx(two), { ...card, idempotency_key: 'lock-card' });
    expect(receipt).toMatchObject({ status: 'failed', retryable: false, error: 'card_out_of_date' });
    expect(receipt.summary).toMatch(/changed after this card was made.*it was not locked/);
    expect(world.actionCalls).toEqual([]);
  });

  it('set_lineup reads the tournament and what it replaces, and refuses when the lineup moved', async () => {
    const card = await plan('set_lineup', { tournament_id: ID, entries: [{ player_id: P2, role: 'lineup', slot: 1, reasoning: 'Best last three rounds' }, { player_id: P1, role: 'alternate', slot: null }] }, two);
    expect(factOf(card, 'Tournament')).toBe('Fall Classic · 2026-11-14 to 2026-11-15');
    expect(factOf(card, 'Replaces')).toBe('1. Eli Brandt');
    expect(factOf(card, 'Reasoning')).toBe('Maya Ortiz: Best last three rounds');
    expect(card.visual).toMatchObject({ kind: 'lineup', tournament: { name: 'Fall Classic', date: '2026-11-14' }, replaces: [{ slot: 1, name: 'Eli Brandt' }], seats: [{ name: 'Maya Ortiz', reasoning: 'Best last three rounds' }, { name: 'Eli Brandt', alternate: true }] });
    // The write carries the version the card read, never one from the model.
    const { setTournamentEntries } = await import('@/app/golf/actions/tournaments');
    vi.mocked(setTournamentEntries).mockClear();
    await tool('set_lineup').commit(ctx(two), { ...card, idempotency_key: 'lineup-ok' });
    expect(vi.mocked(setTournamentEntries).mock.calls[0]?.[2]).toBe(3);
    // Someone else changed the lineup after the card: nothing is written.
    world.actionCalls.length = 0;
    world.landed = false;
    world.tables.golf_tournaments = [{ ...(WORLD().golf_tournaments![0] as object), version: 4 }];
    const stale = await tool('set_lineup').commit(ctx(two), { ...card, idempotency_key: 'lineup-stale' });
    expect(stale).toMatchObject({ status: 'failed', error: 'card_out_of_date' });
    expect(stale.summary).toMatch(/Nothing was changed/);
    expect(world.actionCalls).toEqual([]);
  });

  it('publish_practice_plan: who is told, when, and what each one gets come from the plan, not from the model', async () => {
    const card = await plan('publish_practice_plan', { plan_id: ID, version: 1, team_chat: true });
    expect(card.recipients).toEqual([{ id: P1, name: 'Eli Brandt', role: 'player' }]);
    expect(card.action).toBe('Publish to 1 person');
    expect(card.publish?.people).toEqual([{ id: P1, name: 'Eli Brandt', role: 'player' }]);
    expect(card.delivery?.title).toMatch(/^Practice plan for \w+day$/);
    expect(card.delivery?.body).toMatch(/· You start on Putting green$/);
    expect(card.delivery?.each).toEqual([{ id: P1, name: 'Eli Brandt', body: card.delivery?.body }]);
    expect(card.publish?.chatPost).toMatch(/^Thursday practice is published\. .*\/golf\/dashboard\/practice\/plan\/00000000-0000-4000-8000-0000000000aa$/);
    expect(factOf(card, 'Team chat')).toBe(card.publish?.chatPost);
    expect(factOf(card, 'What they get')).toBe(`${card.delivery?.title}\n${card.delivery?.body}`);
    // The Team chat post that goes out is the card's, word for word.
    const { sendMessage } = await import('@/app/actions/messages');
    vi.mocked(sendMessage).mockClear();
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValueOnce({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 'team-channel' }, error: null }) }) }) }) }) }) } as never);
    const receipt = await commit('publish_practice_plan', card);
    expect(receipt.status).toBe('completed');
    expect(vi.mocked(sendMessage).mock.calls[0]?.[0]).toMatchObject({ content: card.publish?.chatPost });
    expect(receipt.notifications).toEqual([{ channel: 'push and bell', recipients: 1, status: 'queued', to: ['Eli Brandt'] }]);
    expect(receipt.href).toBe(`/golf/dashboard/practice/plan/${ID}`);
  });

  it('publish_practice_plan names a player with no account as not reached, and gives no card for a plan saved again or on another team', async () => {
    world.tables.golf_players = [{ id: P1, user_id: null }];
    const card = await plan('publish_practice_plan', SAMPLES.publish_practice_plan);
    expect(card.recipients).toEqual([]);
    expect(card.delivery).toBeNull();
    expect(factOf(card, 'Tells')).toMatch(/^Nobody/);
    world.tables = { ...WORLD(), golf_practice_plans: [{ ...(WORLD().golf_practice_plans![0] as object), version: 2 }] };
    await expect(plan('publish_practice_plan', SAMPLES.publish_practice_plan)).rejects.toThrow(/saved again after Publish was pressed/);
    world.tables = { ...WORLD(), golf_practice_plans: [{ ...(WORLD().golf_practice_plans![0] as object), team_id: 'another-team' }] };
    await expect(plan('publish_practice_plan', SAMPLES.publish_practice_plan)).rejects.toBeInstanceOf(CoachContextError);
  });

  it('publish_practice_plan refuses when the plan was edited after the card: nothing is published and nobody is told', async () => {
    const card = await plan('publish_practice_plan', SAMPLES.publish_practice_plan);
    world.tables.golf_practice_plans = [{ ...(WORLD().golf_practice_plans![0] as object), version: 2, title: 'Friday practice' }];
    const receipt = await commit('publish_practice_plan', card);
    expect(receipt).toMatchObject({ status: 'failed', error: 'card_out_of_date', retryable: false });
    expect(receipt.summary).toMatch(/Nothing was published and nobody was told/);
    expect(world.actionCalls).toEqual([]);
  });

  it('send_message: the thread, its members by name and the count come from the thread itself', async () => {
    world.tables.golf_conversations = [{ id: ID, title: 'Travel squad', team_id: 'team-1', golf_conversation_participants: [{ user_id: 'u1' }, { user_id: 'u-p1' }, { user_id: 'u-c2' }, { user_id: 'u-unknown' }] }];
    world.tables.golf_coaches = [{ id: 'c2', user_id: 'u-c2', full_name: 'Dana Wu' }];
    const card = await plan('send_message', SAMPLES.send_message);
    expect(card.recipients).toEqual([{ id: P1, name: 'Eli Brandt', role: 'player' }, { id: 'c2', name: 'Dana Wu', role: 'coach' }]);
    expect(card.visual).toMatchObject({ kind: 'msg', thread: 'Travel squad', count: 3, members: ['Eli Brandt', 'Dana Wu', '1 more'], draft: 'See you at three.' });
    expect(card.action).toBe('Send to 3 people');
    expect(factOf(card, 'To')).toBe('Eli Brandt, Dana Wu and 1 more');
    expect(card.delivery).toMatchObject({ title: 'Travel squad', body: 'See you at three.' });
    // The model has nowhere to put a count, a thread name or a last message.
    expect(Object.keys((tool('send_message').input as unknown as { shape?: object }).shape ?? { conversation_id: 1, content: 1 }).sort()).toEqual(['content', 'conversation_id']);
  });

  it('send_message gives no card for a thread on another team or one the coach is not in, and does not send when the members changed', async () => {
    world.tables.golf_conversations = [{ id: ID, title: 'Team', team_id: 'another-team', golf_conversation_participants: [{ user_id: 'u1' }, { user_id: 'u-p1' }] }];
    await expect(plan('send_message', SAMPLES.send_message)).rejects.toBeInstanceOf(CoachContextError);
    world.tables.golf_conversations = [{ id: ID, title: 'Team', team_id: 'team-1', golf_conversation_participants: [{ user_id: 'u-p1' }] }];
    await expect(plan('send_message', SAMPLES.send_message)).rejects.toThrow(/You are not in that thread/);
    world.tables = WORLD();
    const card = await plan('send_message', SAMPLES.send_message);
    world.tables.golf_conversations = [{ id: ID, title: 'Team', team_id: 'team-1', golf_conversation_participants: [{ user_id: 'u1' }, { user_id: 'u-p1' }, { user_id: 'u-new' }] }];
    const receipt = await commit('send_message', card);
    expect(receipt).toMatchObject({ status: 'failed', error: 'card_out_of_date' });
    expect(receipt.summary).toMatch(/Nothing was sent/);
    expect(world.actionCalls).toEqual([]);
  });

  it('set_availability_note: what it replaces is read by the server, and a note that changed since is not overwritten', async () => {
    world.tables.golf_player_availability_coach_notes = [{ note: 'Class until two on Tuesdays' }];
    const card = await plan('set_availability_note', SAMPLES.set_availability_note);
    expect(factOf(card, 'Replaces')).toBe('Class until two on Tuesdays');
    expect(card.visible_to).toBe('coaches');
    world.tables.golf_player_availability_coach_notes = [{ note: 'Injured wrist, back next week' }];
    const receipt = await commit('set_availability_note', card);
    expect(receipt).toMatchObject({ status: 'failed', error: 'card_out_of_date' });
    expect(world.actionCalls).toEqual([]);
    // With nothing saved the card says so, and never takes a "replaces" from the model.
    world.tables.golf_player_availability_coach_notes = [];
    expect(factOf(await plan('set_availability_note', { ...(SAMPLES.set_availability_note as object), existing: 'made up' }), 'Replaces')).toMatch(/^Nothing/);
  });

  it('add_round_note: the round is named by course, date and score; another player’s round gets no card; a changed note is not written over', async () => {
    const card = await plan('add_round_note', SAMPLES.add_round_note);
    expect(factOf(card, 'Round')).toBe('Pine Hill · 2026-11-01 · 74');
    expect(card.visual).toMatchObject({ kind: 'note', round: { course: 'Pine Hill', date: '2026-11-01', score: 74 } });
    world.tables.golf_round_reviews = [{ coach_notes: 'Someone else wrote this meanwhile' }];
    const receipt = await commit('add_round_note', card);
    expect(receipt).toMatchObject({ status: 'failed', error: 'card_out_of_date' });
    expect(world.actionCalls).toEqual([]);
    world.tables = { ...WORLD(), golf_rounds: [{ id: ID, player_id: P2, course_name: 'Pine Hill', round_date: '2026-11-01', total_score: 74 }] };
    await expect(plan('add_round_note', SAMPLES.add_round_note, two)).rejects.toBeInstanceOf(CoachContextError);
  });

  it('who is told is a list of people by id; a player with no account is named as not reached and never counted', async () => {
    world.tables.golf_players = [{ id: P1, user_id: 'u-p1' }, { id: P2, user_id: null }];
    const card = await plan('create_qualifier', { ...(SAMPLES.create_qualifier as object), player_ids: [P1, P2] }, two);
    expect(card.recipients).toEqual([{ id: P1, name: 'Eli Brandt', role: 'player' }]);
    expect(card.not_reached).toEqual([{ id: P2, name: 'Maya Ortiz', role: 'player', reason: 'no account yet' }]);
    expect(card.affects.map((a) => a.id)).toEqual([P1, P2]);
    expect(card.notifications[0]).toMatch(/^1 player gets a push/);
    expect(factOf(card, 'Will not get it')).toBe('Maya Ortiz (no account yet)');
    expect(card.delivery).toMatchObject({ title: 'New Qualifier Posted', body: 'Fall qualifier' });
    // Who can see it is the read rule's answer (any coach or player of the team), not the narrower list a player is shown.
    expect(card).toMatchObject({ visible_to: 'team', visible_note: expect.stringMatching(/listed in Qualifiers for the players in it .* Any player on the team is allowed to see it/) });
    expect(readFileSync(join(process.cwd(), 'supabase/schemas/policies/golf.sql'), 'utf8')).toContain('CREATE POLICY "golf_qualifiers_select_team" ON "public"."golf_qualifiers" FOR SELECT USING (("public"."is_golf_team_coach"("team_id") OR "public"."is_golf_team_player"("team_id")));');
    const receipt = await tool('create_qualifier').commit(ctx(two), { ...card, idempotency_key: 'q-1' });
    expect(receipt.notifications[0]).toMatchObject({ recipients: 1, to: ['Eli Brandt'] });
    expect(receipt.missed).toEqual([{ name: 'Maya Ortiz', reason: 'no account yet' }]);
    // An event that does not ask for replies tells nobody, whoever is invited.
    const quiet = await plan('create_event', { ...(SAMPLES.create_event as object), invite_player_ids: [P1] });
    expect(quiet).toMatchObject({ recipients: [], delivery: null, notifications: ['Nobody is told.'], visible_to: 'team' });
    expect(quiet.affects).toEqual([{ kind: 'player', id: P1, label: 'Eli Brandt' }]);
    // A meeting is seen only by the players invited to it; a practice by the whole team.
    expect(await plan('create_event', { ...(SAMPLES.create_event as object), event_type: 'meeting', end: '16:00', invite_player_ids: [P1] })).toMatchObject({ visible_to: 'recipients', visible_note: expect.stringMatching(/only for the players invited/) });
    expect(await plan('create_event', { ...(SAMPLES.create_event as object), event_type: 'meeting', end: '16:00' })).toMatchObject({ visible_to: 'recipients', visible_note: expect.stringMatching(/only this team’s coaches see this meeting/) });
    const asked = await plan('create_event', { ...(SAMPLES.create_event as object), invite_player_ids: [P1], requires_rsvp: true });
    expect(asked.delivery).toMatchObject({ title: 'RSVP Reminder', body: 'Please RSVP for Team practice' });
  });

  it.each(['create_qualifier', 'create_task', 'create_focus_area', 'create_team_announcement', 'create_recurring_practice', 'create_goal'])('%s: a recipient who left the team after the card means nothing is saved or sent', async (name) => {
    const input = name === 'create_qualifier' ? { ...(SAMPLES[name] as object), player_ids: [P1, P2] } : name === 'create_recurring_practice' ? { ...(SAMPLES[name] as object), requires_rsvp: true } : name === 'create_goal' || name === 'create_focus_area' ? { ...(SAMPLES[name] as object), player_id: P2 } : SAMPLES[name];
    world.tables.golf_players = [{ id: P1, user_id: 'u-p1' }, { id: P2, user_id: 'u-p2' }];
    const card = await plan(name, input, two);
    expect(card.recipients?.map((p) => p.id)).toContain(P2);
    // Maya is off the roster by the time the Undo window closes.
    const receipt = await tool(name).commit(ctx(coach), { ...card, idempotency_key: `${name}-left` });
    expect(receipt).toMatchObject({ status: 'failed', error: 'card_out_of_date', retryable: false });
    expect(receipt.summary).toMatch(/Maya Ortiz is no longer on your roster.*Nothing was saved/);
    expect(world.actionCalls).toEqual([]);
  });

  it('create_team_announcement to the whole team is not sent to someone who joined after the card', async () => {
    const card = await plan('create_team_announcement', SAMPLES.create_team_announcement);
    world.tables.golf_players = [{ id: P1, user_id: 'u-p1' }, { id: P2, user_id: 'u-p2' }];
    const receipt = await tool('create_team_announcement').commit(ctx(two), { ...card, idempotency_key: 'ann-joined' });
    expect(receipt.summary).toMatch(/Maya Ortiz joined the roster after this card was made/);
    expect(world.actionCalls).toEqual([]);
  });

  it('create_goal shows where the player stands, the unit and which way is better; a planned task shows the words the player gets', async () => {
    const goal = await plan('create_goal', SAMPLES.create_goal);
    expect(goal.visual).toMatchObject({ kind: 'goal', current: null, better: 'up', unit: expect.any(String) });
    expect(factOf(goal, 'Now')).toMatch(/No rounds in the last 90 days/);
    expect(factOf(goal, 'Better is')).toBe('Higher');
    expect(goal.delivery).toMatchObject({ title: 'New goal from your coach', body: 'Greens, 30-day goal' });
    const focus = await plan('create_focus_area', { ...(SAMPLES.create_focus_area as object), description: 'Three balls from 40 feet, every practice' });
    expect(focus.delivery).toMatchObject({ title: 'New focus area', body: 'Sam Reyes assigned "Lag putting"' });
    expect(factOf(focus, 'Details')).toBe('Three balls from 40 feet, every practice');
    const task = await plan('create_task', { ...(SAMPLES.create_task as object), description: 'Every round since Sunday', due_date: '2026-11-20' });
    expect(task.delivery?.title).toBe('New task');
    expect(task.delivery?.body).toMatch(/^Log your rounds, due /);
    expect(factOf(task, 'Details')).toBe('Every round since Sunday');
    const series = await plan('create_recurring_practice', { ...(SAMPLES.create_recurring_practice as object), end_time: '17:30', description: 'Bring wedges' });
    expect(series.visual).toMatchObject({ kind: 'series', start: '15:00', end: '17:30', dates: expect.any(Array) });
    expect((series.visual as { dates: string[] }).dates).toHaveLength(4);
    expect(factOf(series, 'Ends')).toBe('17:30');
    expect(factOf(series, 'Description')).toBe('Bring wedges');
    expect(series).toMatchObject({ recipients: [], delivery: null, notifications: ['Nobody is told.'] });
  });

  /** Every value the write carries is on the card. Ids are shown as names, and a code is shown in words (compared without case). */
  const WALK: Record<string, unknown> = {
    create_event: { title: 'Rules meeting', event_type: 'meeting', date: '2026-11-12', start: '15:00', end: '16:15', location: 'Clubhouse room 2', notes: 'Bring the handbook', invite_player_ids: [P1], requires_rsvp: true },
    create_trip: { event_name: 'Fall Classic', destination: 'Raleigh', transportation_type: 'flight', departure_date: '2026-11-14', departure_time: '06:30', departure_location: 'Field house', return_date: '2026-11-16', return_time: '21:00', flight_info: 'DL 1432', hotel_name: 'Oak Inn', hotel_address: '12 Main St', hotel_phone: '555-0101', hotel_confirmation: 'ZX81Q', room_assignments: 'Eli with Jonah', uniform_requirements: 'Navy polo', gear_list: ['Rain gear', 'Rangefinder'], notes: 'Vans leave on time' },
    create_qualifier: { name: 'Fall qualifier', description: 'Counts toward the travel squad', start_date: '2026-11-15', end_date: '2026-11-17', num_rounds: 3, selection_slots_total: 5, selection_slots_coach_pick: 1, player_ids: [P1], rules: 'Stroke play, white tees', entry_deadline: '2026-11-13' },
    create_recruit: { first_name: 'Sam', last_name: 'Lee', grad_year: 2028, email: 'sam.lee@example.com', phone: '555-0144', hometown: 'Austin', state: 'TX', notes: 'Met at the state junior', status: 'watched' },
    create_drill: { name: 'Ladder', area: 'putting', kind: 'pressure', minutes: 15, setup: 'Tees at 3, 6 and 9 feet', goal: 'Nine in a row' },
    add_blocked_time: { title: 'Recruiting trip', date: '2026-11-20', end_date: '2026-11-22' },
    add_team_break: { first_day: '2026-11-25', last_day: '2026-11-29', label: 'Thanksgiving' },
    save_team_term: { name: 'Spring 2027', classes_start: '2027-01-11', classes_end: '2027-04-30', exams_end: '2027-05-07' },
    set_availability_note: { player_id: P1, note: 'Out Thursday for a lab' },
    add_round_note: { round_id: ID, player_id: P1, note: 'Good wedge numbers' },
    publish_artifact: { title: 'Eli report', body: 'Words about Eli.' },
  };
  const leaves = (value: unknown, key = ''): string[] => {
    if (/(^|_)ids?$/.test(key) || key === 'seen') return [];
    if (Array.isArray(value)) return value.flatMap((v) => leaves(v, key));
    if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => leaves(v, k));
    return typeof value === 'string' || typeof value === 'number' ? [String(value)] : [];
  };
  it.each(Object.keys(WALK))('%s: nothing is written that is not on the card', async (name) => {
    const card = await plan(name, WALK[name]);
    const shown = JSON.stringify([card.action, card.summary, card.facts, card.visual ?? null, card.delivery ?? null]).toLowerCase();
    const written = leaves(card.input);
    expect(written.length).toBeGreaterThan(0);
    for (const value of written) expect(shown, `${name} writes "${value}" and the card does not show it`).toContain(JSON.stringify(value).slice(1, -1).toLowerCase());
  });
});

describe('a card stored before cards held what the server read', () => {
  it('is not run: it cannot be checked against the app, so nothing is written and the coach asks again', async () => {
    const lock = all().find((t) => t.name === 'lock_lineup')!;
    const old = { tool: 'lock_lineup', input: { tournament_id: ID }, planned_at: new Date().toISOString(), idempotency_key: 'old-card', action: 'Lock the lineup', summary: 'This locks at once and can’t be undone.', facts: [{ label: 'Tournament', value: 'As set' }], affects: [], notifications: [], missing: [] };
    const receipt = await lock.commit(ctx(), old);
    expect(receipt).toMatchObject({ status: 'failed', error: 'card_out_of_date', retryable: false });
    expect(receipt.summary).toMatch(/made before an update.*Nothing was saved\. Ask for it again\./);
    const message = all().find((t) => t.name === 'send_message')!;
    expect(await message.commit(ctx(), { ...old, tool: 'send_message', input: { conversation_id: ID, thread: 'Team', member_count: 5, content: 'See you at three.' } })).toMatchObject({ status: 'failed', error: 'card_out_of_date' });
    expect(world.actionCalls).toEqual([]);
  });
});

/**
 * A coach can change a card before confirming. The card says which fields, with the task's own limits; `revise` plans
 * again from the stored input plus the edits, with every read and check `plan` makes, and writes nothing.
 */
describe('a card the coach can edit', () => {
  const P2 = '00000000-0000-4000-8000-000000000002';
  const two: CoachChatContext = { ...coach, roster: [person(P1, 'Eli Brandt'), person(P2, 'Maya Ortiz')] };
  type Revisable = Task & { revise: (c: ToolContext, p: TaskProposal, edits: Record<string, unknown>) => Promise<TaskProposal> };
  const tool = (name: string) => all().find((t) => t.name === name) as Revisable;
  const card = (name: string, input: unknown = SAMPLES[name], who: CoachChatContext = coach) => tool(name).plan(ctx(who), tool(name).input.parse(input));
  const field = (p: TaskProposal, key: string) => p.editable?.find((f) => f.key === key);
  const factOf = (p: TaskProposal, label: string) => p.facts.find((f) => f.label === label)?.value;

  it('every task can be revised, and never offers the thing the card is about, the team or the coach as a field', async () => {
    const NEVER = /^(tournament_id|plan_id|conversation_id|round_id|player_id|metric_id|version|team_id|coach_id|from_insight_id|label)$/;
    for (const t of all()) {
      expect(typeof (t as Revisable).revise, t.name).toBe('function');
      const proposal = await card(t.name);
      for (const f of proposal.editable ?? []) {
        expect(f.key, `${t.name} offers ${f.key}`).not.toMatch(t.name === 'add_team_break' ? /^(team_id|coach_id)$/ : NEVER);
        // Every field is a key of the task's own input, so its limits are the ones the server holds it to.
        expect(Object.keys((t.input as unknown as { shape: object }).shape), `${t.name}.${f.key}`).toContain(f.key);
      }
    }
    // A lineup's seats and a lock are not form fields: nothing on those cards is editable in place.
    expect((await card('lock_lineup')).editable ?? []).toEqual([]);
    expect((await card('set_lineup')).editable ?? []).toEqual([]);
    expect(world.actionCalls).toEqual([]);
  });

  it('each field carries its type and the task’s own limits', async () => {
    const event = await card('create_event', { ...(SAMPLES.create_event as object), notes: 'Bring wedges', invite_player_ids: [P1] }, two);
    expect(field(event, 'title')).toMatchObject({ type: 'text', value: 'Team practice', required: true, max_length: 200, label: 'Title' });
    expect(field(event, 'date')).toMatchObject({ type: 'date', value: '2026-11-12', label: 'When' });
    expect(field(event, 'start')).toMatchObject({ type: 'time', value: '15:00' });
    expect(field(event, 'notes')).toMatchObject({ type: 'long_text', value: 'Bring wedges', max_length: 5000, required: false });
    expect(field(event, 'event_type')).toMatchObject({ type: 'choice', value: 'practice', options: expect.arrayContaining([{ value: 'meeting', label: 'Meeting' }]) });
    expect(field(event, 'requires_rsvp')).toMatchObject({ type: 'toggle', value: false });
    expect(field(event, 'invite_player_ids')).toMatchObject({ type: 'people', value: [P1], options: [{ value: P1, label: 'Eli Brandt' }, { value: P2, label: 'Maya Ortiz' }] });
    const goal = await card('create_goal');
    expect(goal.editable?.map((f) => f.key)).toEqual(['target_value', 'window_days', 'mode']);
    expect(field(goal, 'window_days')).toMatchObject({ type: 'number', value: 30, min: 7, max: 365, step: 1 });
    const series = await card('create_recurring_practice');
    expect(field(series, 'occurrence_count')).toMatchObject({ type: 'number', value: 4, min: 1, max: 26 });
    expect(field(series, 'first_date')).toMatchObject({ type: 'date', value: (series.visual as { dates: string[] }).dates[0] });
    // The whole roster is shown as the people it is.
    expect(field(await card('create_task', SAMPLES.create_task, two), 'assign_to_player_ids')).toMatchObject({ type: 'people', value: [P1, P2] });
  });

  it('an edit plans again: the new card is built by the planner, with what the server reads, and nothing is written', async () => {
    world.tables.golf_players = [{ id: P1, user_id: 'u-p1' }, { id: P2, user_id: 'u-p2' }];
    const first = await card('create_event', { ...(SAMPLES.create_event as object), invite_player_ids: [P1], requires_rsvp: true }, two);
    const next = await tool('create_event').revise(ctx(two), first, { start: '16:00', end: '17:30', location: 'Short-game area', invite_player_ids: [P1, P2] });
    expect(factOf(next, 'When')).toBe('2026-11-12, 16:00 to 17:30');
    expect(factOf(next, 'Where')).toBe('Short-game area');
    expect(next.recipients?.map((p) => p.name)).toEqual(['Eli Brandt', 'Maya Ortiz']);
    expect(field(next, 'start')?.value).toBe('16:00');
    expect((next.input as { seen: { people: unknown[] } }).seen.people).toHaveLength(2);
    // Clearing an optional field with null; the untouched fields stay.
    const cleared = await tool('create_event').revise(ctx(two), next, { location: null });
    expect(factOf(cleared, 'Where')).toBe('Not set');
    expect(factOf(cleared, 'When')).toBe('2026-11-12, 16:00 to 17:30');
    // The planned tasks too: six practices is six dates, and a task's due date moves.
    const series = await tool('create_recurring_practice').revise(ctx(), await card('create_recurring_practice'), { occurrence_count: 6, end_time: '17:00' });
    expect((series.visual as { dates: string[] }).dates).toHaveLength(6);
    expect(factOf(series, 'Ends')).toBe('17:00');
    const task = await tool('create_task').revise(ctx(two), await card('create_task', SAMPLES.create_task, two), { due_date: '2026-11-20', assign_to_player_ids: [P2] });
    expect(factOf(task, 'Assigned to')).toBe('Maya Ortiz');
    expect(task.missing).toEqual([]);
    const message = await tool('send_message').revise(ctx(), await card('send_message'), { content: 'See you at four.' });
    expect(message.visual).toMatchObject({ draft: 'See you at four.', thread: 'Team' });
    expect(world.actionCalls).toEqual([]);
    expect(world.dbWrites).toEqual([]);
  });

  it('refuses an edit the card did not offer, a value the task’s own schema does not take, and anything plan itself would refuse', async () => {
    const event = await card('create_event', SAMPLES.create_event, two);
    await expect(tool('create_event').revise(ctx(two), event, { team_id: 'another-team' })).rejects.toThrow(/Team cannot be changed on this card/);
    await expect(tool('send_message').revise(ctx(), await card('send_message'), { conversation_id: P2 })).rejects.toThrow(/cannot be changed on this card/);
    await expect(tool('lock_lineup').revise(ctx(), await card('lock_lineup'), { tournament_id: P2 })).rejects.toThrow(/cannot be changed on this card/);
    await expect(tool('create_event').revise(ctx(two), event, { title: 'x'.repeat(201) })).rejects.toThrow(/^Title: /);
    await expect(tool('create_event').revise(ctx(two), event, { date: 'tomorrow' })).rejects.toThrow(/^Date: /);
    await expect(tool('create_goal').revise(ctx(), await card('create_goal'), { window_days: 3 })).rejects.toThrow(/^Window days: /);
    // The planner's own checks still run: the end before the start, and a player who is not on the roster.
    await expect(tool('create_event').revise(ctx(two), event, { start: '16:00', end: '15:00' })).rejects.toThrow(/The end has to be after the start/);
    await expect(tool('create_event').revise(ctx(two), event, { invite_player_ids: ['00000000-0000-4000-8000-0000000000ee'] })).rejects.toBeInstanceOf(CoachContextError);
    // And a player can revise nothing.
    await expect(tool('create_event').revise(ctx({ ...coach, player_id: P1 }), event, { title: 'Mine now' })).rejects.toBeInstanceOf(CoachContextError);
    expect(world.actionCalls).toEqual([]);
  });

  it('a revised card commits like any other, and what it writes is what it shows', async () => {
    const { createGolfEvent } = await import('@/app/golf/actions/calendar-events');
    vi.mocked(createGolfEvent).mockClear();
    const next = await tool('create_event').revise(ctx(), await card('create_event'), { title: 'Wedge practice', location: 'Range' });
    const receipt = await tool('create_event').commit(ctx(), { ...next, idempotency_key: 'revised-card' });
    expect(receipt.status).toBe('completed');
    expect(vi.mocked(createGolfEvent).mock.calls[0]?.[0]).toMatchObject({ title: 'Wedge practice', location: 'Range', startDate: '2026-11-12' });
  });
});
