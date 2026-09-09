import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
}));

import { getClassOccurrenceDetail } from '../class-detail';

// ---------------------------------------------------------------------------
// Seed data
//
// team-1: coached by coach-1 (user u-coach); active members player-1 (owns
// class-1, user u-owner) and player-2 (teammate, user u-teammate).
// team-2: coached by coach-2 (user u-othercoach); active player player-3
// (user u-otherteam) — no relationship to team-1 at all.
//
// event-1 is class-1's synced occurrence on 2026-09-08. event-2 is an
// ordinary (non-class) team-1 event. IDs are UUID-shaped: the action
// rejects non-UUID event/class ids up front.
// ---------------------------------------------------------------------------

const TEAM_1 = '11111111-1111-4111-8111-111111111111';
const TEAM_2 = '22222222-2222-4222-8222-222222222222';
const EVENT_1 = '33333333-3333-4333-8333-333333333333'; // synced class occurrence
const EVENT_2 = '44444444-4444-4444-8444-444444444444'; // ordinary team event
const EVENT_MISSING = '99999999-9999-4999-8999-999999999999';
const CLASS_1 = '55555555-5555-4555-8555-555555555555';
const PLAYER_1 = '66666666-6666-4666-8666-666666666666'; // owner
const PLAYER_2 = '77777777-7777-4777-8777-777777777777'; // teammate
const PLAYER_3 = '88888888-8888-4888-8888-888888888888'; // other team

type Row = Record<string, unknown>;

interface SeedTables extends Record<string, Row[]> {
  golf_events: Row[];
  golf_coaches: Row[];
  golf_team_coach_staff: Row[];
  golf_players: Row[];
  golf_team_members: Row[];
  golf_player_classes: Row[];
  golf_academic_exclusions: Row[];
}

function baseTables(): SeedTables {
  return {
    golf_events: [
      {
        id: EVENT_1, team_id: TEAM_1,
        start_time: '2026-09-08T14:00:00.000Z', end_time: '2026-09-08T14:50:00.000Z',
        description: `[class:${CLASS_1}]`, event_type: 'class',
      },
      {
        id: EVENT_2, team_id: TEAM_1,
        start_time: '2026-09-08T18:00:00.000Z', end_time: '2026-09-08T20:00:00.000Z',
        description: null, event_type: 'practice',
      },
    ],
    golf_coaches: [
      { id: 'coach-1', user_id: 'u-coach' },
      { id: 'coach-2', user_id: 'u-othercoach' },
    ],
    golf_team_coach_staff: [
      { id: 'staff-1', team_id: TEAM_1, coach_id: 'coach-1' },
      { id: 'staff-2', team_id: TEAM_2, coach_id: 'coach-2' },
    ],
    golf_players: [
      { id: PLAYER_1, user_id: 'u-owner' },
      { id: PLAYER_2, user_id: 'u-teammate' },
      { id: PLAYER_3, user_id: 'u-otherteam' },
    ],
    golf_team_members: [
      { id: 'm-1', team_id: TEAM_1, player_id: PLAYER_1, status: 'active' },
      { id: 'm-2', team_id: TEAM_1, player_id: PLAYER_2, status: 'active' },
      { id: 'm-3', team_id: TEAM_2, player_id: PLAYER_3, status: 'active' },
    ],
    golf_player_classes: [
      {
        id: CLASS_1, player_id: PLAYER_1, class_name: 'CS 201 - Intro to CS',
        instructor: 'Dr. Lee', days: ['Mon', 'Wed'], start_time: '10:00:00', end_time: '10:50:00',
        building: 'Wells', room: '101', semester: 'Fall 2026', notes: null,
      },
    ],
    golf_academic_exclusions: [],
  };
}

// ---------------------------------------------------------------------------
// RLS simulation
//
// The action deliberately authorizes identity access by whether
// `golf_player_classes` (and, for its own reads, `golf_events` /
// `golf_academic_exclusions`) RETURN A ROW under RLS — never by an
// independent permission check the action performs itself. `fake-supabase`
// has no RLS of its own, so these three tables are wrapped here with the
// same predicates as the real policies (baseline migration
// 20260527000000: `golf_events_select_team`, `golf_player_classes_select_team`,
// `golf_classes_select_coaches`, "Players can view their own exclusions",
// "Coaches can manage exclusions") so a test that expects RLS to hide a row
// actually exercises that.
// ---------------------------------------------------------------------------

function isCoachOfTeam(tables: SeedTables, userId: string | null, teamId: unknown): boolean {
  if (!userId) return false;
  const coach = tables.golf_coaches.find((c) => c.user_id === userId);
  if (!coach) return false;
  return tables.golf_team_coach_staff.some((s) => s.team_id === teamId && s.coach_id === coach.id);
}
function isActivePlayerOfTeam(tables: SeedTables, userId: string | null, teamId: unknown): boolean {
  if (!userId) return false;
  const player = tables.golf_players.find((p) => p.user_id === userId);
  if (!player) return false;
  return tables.golf_team_members.some((m) => m.team_id === teamId && m.player_id === player.id && m.status === 'active');
}
function isCoachOfPlayer(tables: SeedTables, userId: string | null, playerId: unknown): boolean {
  if (!userId) return false;
  const coach = tables.golf_coaches.find((c) => c.user_id === userId);
  if (!coach) return false;
  return tables.golf_team_members.some(
    (m) => m.player_id === playerId && m.status === 'active'
      && tables.golf_team_coach_staff.some((s) => s.team_id === m.team_id && s.coach_id === coach.id),
  );
}
function ownsPlayer(tables: SeedTables, userId: string | null, playerId: unknown): boolean {
  if (!userId) return false;
  const player = tables.golf_players.find((p) => p.id === playerId);
  return Boolean(player && player.user_id === userId);
}

function asViewer(userId: string | null, tables: SeedTables): FakeSupabase {
  const base = createFakeSupabase({
    user: userId ? { id: userId } : null,
    tables,
    rpc: {
      is_golf_team_coach: async (args) =>
        ({ data: isCoachOfTeam(tables, userId, (args as { team_uuid: string }).team_uuid), error: null }),
      is_golf_team_player: async (args) =>
        ({ data: isActivePlayerOfTeam(tables, userId, (args as { team_uuid: string }).team_uuid), error: null }),
    },
  });
  const origFrom = base.from.bind(base);
  base.from = ((table: string) => {
    if (table === 'golf_events') {
      const visible = tables.golf_events.filter((e) =>
        isCoachOfTeam(tables, userId, e.team_id) || isActivePlayerOfTeam(tables, userId, e.team_id));
      return createFakeSupabase({ user: userId ? { id: userId } : null, tables: { ...tables, golf_events: visible } }).from(table);
    }
    if (table === 'golf_player_classes') {
      const visible = tables.golf_player_classes.filter((c) =>
        ownsPlayer(tables, userId, c.player_id) || isCoachOfPlayer(tables, userId, c.player_id));
      return createFakeSupabase({ user: userId ? { id: userId } : null, tables: { ...tables, golf_player_classes: visible } }).from(table);
    }
    if (table === 'golf_academic_exclusions') {
      const visible = tables.golf_academic_exclusions.filter((x) =>
        ownsPlayer(tables, userId, x.player_id) || isCoachOfPlayer(tables, userId, x.player_id));
      return createFakeSupabase({ user: userId ? { id: userId } : null, tables: { ...tables, golf_academic_exclusions: visible } }).from(table);
    }
    return origFrom(table);
  }) as typeof base.from;
  fake = base;
  return base;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// Access decision (§2.4)
// ===========================================================================

describe('getClassOccurrenceDetail access', () => {
  it('gives the owning player full detail', async () => {
    asViewer('u-owner', baseTables());
    const result = await getClassOccurrenceDetail({ eventId: EVENT_1, date: '2026-09-08' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.access).toBe('detail');
    if (result.access !== 'detail') return;
    expect(result.data.className).toBe('CS 201 - Intro to CS');
    expect(result.data.instructor).toBe('Dr. Lee');
    expect(result.data.building).toBe('Wells');
    expect(result.data.synced).toBe(true);
    expect(result.data.start).toBe('2026-09-08T14:00:00.000Z');
    expect(result.data.status.state).toBe('scheduled');
  });

  it("gives a coach of the player's active team full detail", async () => {
    asViewer('u-coach', baseTables());
    const result = await getClassOccurrenceDetail({ eventId: EVENT_1, date: '2026-09-08' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.access).toBe('detail');
    if (result.access !== 'detail') return;
    expect(result.data.className).toBe('CS 201 - Intro to CS');
  });

  it('gives a teammate only free/busy — no title, instructor, or location', async () => {
    asViewer('u-teammate', baseTables());
    const result = await getClassOccurrenceDetail({ eventId: EVENT_1, date: '2026-09-08' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.access).toBe('free_busy');
    if (result.access !== 'free_busy') return;
    expect(result.data.start).toBe('2026-09-08T14:00:00.000Z');
    expect(result.data.end).toBe('2026-09-08T14:50:00.000Z');
    expect(Object.keys(result.data)).not.toContain('className');
    expect(Object.keys(result.data)).not.toContain('instructor');
  });

  it('never authorizes off the golf_events row: RLS-visible calendar row does not imply detail access', async () => {
    // Sanity check for the rule the module doc states twice: a teammate who
    // CAN read the golf_events row (proven by the free_busy branch above
    // returning real times) still gets no identity fields at all.
    asViewer('u-teammate', baseTables());
    const result = await getClassOccurrenceDetail({ eventId: EVENT_1, date: '2026-09-08' });
    expect(result.success && result.access).toBe('free_busy');
  });

  it('gives a viewer on an unrelated team nothing — not even free/busy', async () => {
    asViewer('u-otherteam', baseTables());
    const result = await getClassOccurrenceDetail({ eventId: EVENT_1, date: '2026-09-08' });
    expect(result.success).toBe(true);
    expect(result.success && result.access).toBe('none');
  });

  it('rejects an unauthenticated caller', async () => {
    asViewer(null, baseTables());
    const result = await getClassOccurrenceDetail({ eventId: EVENT_1, date: '2026-09-08' });
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// Resolution edge cases
// ===========================================================================

describe('getClassOccurrenceDetail resolution', () => {
  it('reports "none" for an event that is not a class occurrence', async () => {
    asViewer('u-owner', baseTables());
    const result = await getClassOccurrenceDetail({ eventId: EVENT_2, date: '2026-09-08' });
    expect(result.success).toBe(true);
    expect(result.success && result.access).toBe('none');
  });

  it('reports "none" for an unknown event id', async () => {
    asViewer('u-owner', baseTables());
    const result = await getClassOccurrenceDetail({ eventId: EVENT_MISSING, date: '2026-09-08' });
    expect(result.success).toBe(true);
    expect(result.success && result.access).toBe('none');
  });

  it('ignores a caller-supplied classId when the given eventId is not that class\'s occurrence', async () => {
    // EVENT_2 is an ordinary (non-class) event; CLASS_1 is a real class the
    // owner does have detail access to. Supplying both must never stitch
    // CLASS_1's identity detail onto EVENT_2's start/end — the event's own
    // tag is the only source of truth once an eventId is given.
    asViewer('u-owner', baseTables());
    const result = await getClassOccurrenceDetail({ eventId: EVENT_2, classId: CLASS_1, date: '2026-09-08' });
    expect(result.success).toBe(true);
    expect(result.success && result.access).toBe('none');
  });

  it('gives the owner detail for an unsynced occurrence looked up by classId alone', async () => {
    asViewer('u-owner', baseTables());
    const result = await getClassOccurrenceDetail({ classId: CLASS_1, date: '2026-09-08' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.access).toBe('detail');
    if (result.access !== 'detail') return;
    expect(result.data.synced).toBe(false);
    expect(result.data.eventId).toBeNull();
    expect(result.data.start).toBeNull();
  });

  it('gives nothing for an unsynced classId lookup with no detail access — no event to fall back on', async () => {
    asViewer('u-teammate', baseTables());
    const result = await getClassOccurrenceDetail({ classId: CLASS_1, date: '2026-09-08' });
    expect(result.success).toBe(true);
    expect(result.success && result.access).toBe('none');
  });

  it('rejects a request with neither eventId nor classId', async () => {
    asViewer('u-owner', baseTables());
    const result = await getClassOccurrenceDetail({ date: '2026-09-08' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid calendar date', async () => {
    asViewer('u-owner', baseTables());
    const result = await getClassOccurrenceDetail({ eventId: EVENT_1, date: '2026-02-30' });
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// Academic exclusion status — three-valued, never a false "scheduled"
// ===========================================================================

describe('getClassOccurrenceDetail exclusion status', () => {
  it('reports the exclusion reason on an excluded date', async () => {
    const tables = baseTables();
    tables.golf_academic_exclusions.push({
      id: 'ex-1', player_id: PLAYER_1,
      start_date: '2026-09-08', end_date: '2026-09-08', reason: 'Midterm exam',
    });
    asViewer('u-owner', tables);
    const result = await getClassOccurrenceDetail({ eventId: EVENT_1, date: '2026-09-08' });
    expect(result.success).toBe(true);
    if (!result.success || result.access !== 'detail') throw new Error('expected detail access');
    expect(result.data.status).toEqual({
      state: 'excluded', reason: 'Midterm exam', startDate: '2026-09-08', endDate: '2026-09-08',
    });
  });

  it('reports "unknown", never "scheduled", when the exclusion read fails', async () => {
    asViewer('u-owner', baseTables());
    const origFrom = fake.from.bind(fake);
    fake.from = ((table: string) => {
      if (table !== 'golf_academic_exclusions') return origFrom(table);
      return {
        select: () => ({
          eq: () => ({
            lte: () => ({
              gte: () => Promise.resolve({ data: null, error: { message: 'db unavailable' } }),
            }),
          }),
        }),
      };
    }) as typeof fake.from;

    const result = await getClassOccurrenceDetail({ eventId: EVENT_1, date: '2026-09-08' });
    expect(result.success).toBe(true);
    if (!result.success || result.access !== 'detail') throw new Error('expected detail access');
    expect(result.data.status.state).toBe('unknown');
  });
});

// ===========================================================================
// Failure paths
// ===========================================================================

describe('getClassOccurrenceDetail failures', () => {
  it('reports a retryable error, not "none", when the class read itself fails', async () => {
    asViewer('u-owner', baseTables());
    const origFrom = fake.from.bind(fake);
    fake.from = ((table: string) => {
      if (table !== 'golf_player_classes') return origFrom(table);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: { message: 'db unavailable' } }),
          }),
        }),
      };
    }) as typeof fake.from;

    const result = await getClassOccurrenceDetail({ eventId: EVENT_1, date: '2026-09-08' });
    expect(result.success).toBe(false);
  });
});
