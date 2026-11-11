import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

/**
 * createGolfTravelItinerary, createGolfQualifier, createGoal and saveTextDocument take an optional `requestId`. With
 * one, the row's id is the request's, so the same request sent twice (a retry after a lost response) answers with the
 * first row: no second row, no second set of entries, no second notification, no second file. Without one, the insert
 * is what it always was (no id): existing callers are unchanged.
 */
type Row = Record<string, unknown>;

const TEAM = '00000000-0000-4000-8000-0000000000a1';
const OTHER_TEAM = '00000000-0000-4000-8000-0000000000b2';
const PLAYER = '11111111-1111-4111-8111-111111111111';
const REQ = '3f2c1a9e-7b4d-4c1a-9e2f-5a6b7c8d9e0f';

const { world, sent } = vi.hoisted(() => ({
  world: { client: null as unknown, inserts: [] as Array<{ table: string; row: Record<string, unknown> }>, uploads: [] as string[] },
  sent: { qualifier: vi.fn(async () => {}), goal: vi.fn(async () => {}), push: vi.fn(async () => {}) },
}));

/** The shared fake, plus what a real table does and the fake does not: a second row with the same id is refused (23505). */
function seed(extra: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {
    golf_coaches: [{ id: 'coach-1', user_id: 'user-1', organization_id: 'org-1' }],
    golf_team_members: [{ id: 'm1', player_id: PLAYER, team_id: TEAM, status: 'active' }],
    golf_players: [{ id: PLAYER, user_id: 'u-a' }],
    users: [{ id: 'u-a', email: 'a@example.test' }],
    golf_travel_itineraries: [],
    golf_qualifiers: [],
    golf_qualifier_entries: [],
    golf_goals: [],
    golf_documents: [],
    golf_document_versions: [],
    ...extra,
  };
  const real = createFakeSupabase({ user: { id: 'user-1' }, tables, idFactory: () => crypto.randomUUID() });
  const refused = () => {
    const n: Record<string, unknown> = {};
    const answer = Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } });
    Object.assign(n, { select: () => n, single: () => answer, maybeSingle: () => answer, then: (ok: (v: unknown) => unknown) => answer.then(ok) });
    return n;
  };
  world.inserts = [];
  world.uploads = [];
  world.client = {
    ...real,
    from: (table: string) => {
      const b = real.from(table);
      return {
        ...b,
        insert: (payload: unknown) => {
          const rows = (Array.isArray(payload) ? payload : [payload]) as Row[];
          for (const row of rows) world.inserts.push({ table, row });
          return rows.some((r) => r.id !== undefined && (tables[table] ?? []).some((t) => t.id === r.id)) ? refused() : b.insert(payload);
        },
      };
    },
    storage: {
      from: () => ({
        upload: async (path: string) => (world.uploads.push(path), { data: { path }, error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://files.example.test/${path}` } }),
      }),
    },
  };
  return tables;
}

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => world.client) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => world.client) }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_name: string, _opts: unknown, fn: unknown) => fn }));
vi.mock('@/lib/golf/resolve-team', async (orig) => ({ ...(await orig<Record<string, unknown>>()), validateCoachTeamAccess: vi.fn(async () => true) }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: async () => '00000000-0000-4000-8000-0000000000a1' }));
vi.mock('next/server', () => ({ after: vi.fn((cb: () => unknown) => cb()) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}), logServerException: vi.fn(async () => {}), logServerEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({ postRoundTrigger: vi.fn(async () => {}) }));
vi.mock('@/lib/cache/golf-stats-calculator', () => ({ invalidateOnRoundComplete: vi.fn(async () => {}), invalidateStatsCache: vi.fn(async () => {}) }));
vi.mock('@/lib/admin-logger', () => ({ logRoundSubmitted: vi.fn(async () => {}) }));
vi.mock('@/lib/notifications', () => ({ notifyQualifierCreated: sent.qualifier }));
vi.mock('@/lib/notifications/email', () => ({ sendEmailNotification: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/notifications/push', () => ({ sendBulkPushNotification: sent.push }));
vi.mock('@/lib/coachhelm/v3/goals/window-metric', async (orig) => ({ ...(await orig<Record<string, unknown>>()), loadPlayerWindowRounds: vi.fn(async () => []) }));
vi.mock('@/lib/coachhelm/v3/notifications/notify', async (orig) => ({ ...(await orig<Record<string, unknown>>()), notifyCoachAssignedGoal: sent.goal }));

import { saveTextDocument } from '../documents';
import { createGolfQualifier } from '../qualifier-actions';
import { createGolfTravelItinerary } from '../travel';
import { createGoal } from '../v3/goals';

const insertsInto = (table: string) => world.inserts.filter((i) => i.table === table).map((i) => i.row);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createGolfTravelItinerary with a request id', () => {
  const trip = { team_id: TEAM, event_name: 'Fall Invitational', destination: 'Pinehurst', transportation_type: 'van' as const, departure_date: '2026-11-20' };

  it('without one, the insert carries no id: existing callers are unchanged', async () => {
    seed();
    expect((await createGolfTravelItinerary(trip)).success).toBe(true);
    expect(insertsInto('golf_travel_itineraries')).toHaveLength(1);
    expect('id' in insertsInto('golf_travel_itineraries')[0]!).toBe(false);
  });

  it('the same request twice makes one trip and answers both times with it', async () => {
    const tables = seed();
    const first = await createGolfTravelItinerary({ ...trip, requestId: REQ });
    const again = await createGolfTravelItinerary({ ...trip, requestId: REQ });
    expect(first).toMatchObject({ success: true, data: { id: REQ } });
    expect(again).toMatchObject({ success: true, data: { id: REQ, destination: 'Pinehurst' } });
    expect(tables.golf_travel_itineraries).toHaveLength(1);
  });

  it('an id that is another team’s row is not answered with that row', async () => {
    const tables = seed({ golf_travel_itineraries: [{ id: REQ, team_id: OTHER_TEAM, destination: 'Elsewhere' }] });
    const res = await createGolfTravelItinerary({ ...trip, requestId: REQ });
    expect(res.success).toBe(false);
    expect(JSON.stringify(res)).not.toContain('Elsewhere');
    expect(tables.golf_travel_itineraries).toHaveLength(1);
  });

  it('refuses a request id that is not a uuid, and writes nothing', async () => {
    const tables = seed();
    expect((await createGolfTravelItinerary({ ...trip, requestId: 'not-a-uuid' })).success).toBe(false);
    expect(tables.golf_travel_itineraries).toHaveLength(0);
  });
});

describe('createGolfQualifier with a request id', () => {
  const qualifier = { name: 'Fall Qualifying', startDate: '2026-10-01', playerIds: [PLAYER], numRounds: 2 };

  it('without one, the insert carries no id: existing callers are unchanged', async () => {
    seed();
    expect((await createGolfQualifier(qualifier)).success).toBe(true);
    expect('id' in insertsInto('golf_qualifiers')[0]!).toBe(false);
  });

  it('the same request twice makes one qualifier, enters the players once and tells them once', async () => {
    const tables = seed();
    const first = await createGolfQualifier({ ...qualifier, requestId: REQ });
    const again = await createGolfQualifier({ ...qualifier, requestId: REQ });
    expect(first).toEqual({ success: true, data: { qualifierId: REQ } });
    expect(again).toEqual({ success: true, data: { qualifierId: REQ } });
    expect(tables.golf_qualifiers).toHaveLength(1);
    expect(tables.golf_qualifier_entries).toHaveLength(1);
    expect(sent.qualifier).toHaveBeenCalledTimes(1);
    expect(sent.push).toHaveBeenCalledTimes(1);
  });

  it('an id that is another team’s row is a failure, with no entries added to it', async () => {
    const tables = seed({ golf_qualifiers: [{ id: REQ, team_id: OTHER_TEAM, name: 'Theirs' }] });
    expect((await createGolfQualifier({ ...qualifier, requestId: REQ })).success).toBe(false);
    expect(tables.golf_qualifier_entries).toHaveLength(0);
    expect(sent.qualifier).not.toHaveBeenCalled();
  });

  it('refuses a request id that is not a uuid, and writes nothing', async () => {
    const tables = seed();
    expect((await createGolfQualifier({ ...qualifier, requestId: 'nope' })).success).toBe(false);
    expect(tables.golf_qualifiers).toHaveLength(0);
  });
});

describe('createGoal with a request id', () => {
  const goal = { team_id: TEAM, player_id_if_coach_creating: PLAYER, metric_id: 'sg_putting' as never, title: 'Gain on the greens', category: 'manual', ends_at: new Date(Date.now() + 60 * 86_400_000).toISOString(), target_value: 0.2, target_source: null, baseline_value: null, coach_assignment_mode: 'suggested' as const };

  it('without one, the insert carries no id: existing callers are unchanged', async () => {
    seed();
    const res = await createGoal(goal);
    expect(res.ok).toBe(true);
    expect('id' in insertsInto('golf_goals')[0]!).toBe(false);
  });

  it('the same request twice makes one goal and tells the player once', async () => {
    const tables = seed();
    const first = await createGoal({ ...goal, requestId: REQ });
    const again = await createGoal({ ...goal, requestId: REQ });
    expect(first).toMatchObject({ ok: true, goal_id: REQ });
    expect(again).toMatchObject({ ok: true, goal_id: REQ });
    expect(tables.golf_goals).toHaveLength(1);
    expect(sent.goal).toHaveBeenCalledTimes(1);
  });

  it('an id that is another player’s goal is a failure', async () => {
    const tables = seed({ golf_goals: [{ id: REQ, player_id: 'someone-else', state: 'active' }] });
    expect((await createGoal({ ...goal, requestId: REQ })).ok).toBe(false);
    expect(tables.golf_goals).toHaveLength(1);
    expect(sent.goal).not.toHaveBeenCalled();
  });

  it('refuses a request id that is not a uuid, and writes nothing', async () => {
    const tables = seed();
    expect((await createGoal({ ...goal, requestId: 'nope' })).ok).toBe(false);
    expect(tables.golf_goals).toHaveLength(0);
  });
});

describe('saveTextDocument with a request id', () => {
  it('without one, the insert carries no id: existing callers are unchanged', async () => {
    seed();
    const res = await saveTextDocument(TEAM, 'Travel plan', 'Leave at 7.');
    expect(res.error).toBeNull();
    expect('id' in insertsInto('golf_documents')[0]!).toBe(false);
  });

  it('the same request twice saves one document and stores one file', async () => {
    const tables = seed();
    const first = await saveTextDocument(TEAM, 'Travel plan', 'Leave at 7.', { requestId: REQ });
    const again = await saveTextDocument(TEAM, 'Travel plan', 'Leave at 7.', { requestId: REQ });
    expect(first.data).toMatchObject({ id: REQ, title: 'Travel plan' });
    expect(again).toMatchObject({ error: null, data: { id: REQ, title: 'Travel plan' } });
    expect(tables.golf_documents).toHaveLength(1);
    expect(tables.golf_document_versions).toHaveLength(1);
    expect(world.uploads).toHaveLength(1);
  });

  it('an id that is another team’s document is not answered with that document', async () => {
    const tables = seed({ golf_documents: [{ id: REQ, team_id: OTHER_TEAM, title: 'Theirs' }] });
    const res = await saveTextDocument(TEAM, 'Travel plan', 'Leave at 7.', { requestId: REQ });
    expect(res.data).toBeNull();
    expect(res.error).toBeTruthy();
    expect(tables.golf_documents).toHaveLength(1);
  });

  it('refuses a request id that is not a uuid, and stores nothing', async () => {
    const tables = seed();
    const res = await saveTextDocument(TEAM, 'Travel plan', 'Leave at 7.', { requestId: 'nope' });
    expect(res.data).toBeNull();
    expect(tables.golf_documents).toHaveLength(0);
    expect(world.uploads).toHaveLength(0);
  });
});
