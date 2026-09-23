import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

// ---------------------------------------------------------------------------
// Mocks
//
// `checkEventConflicts` is mocked per test via `state.conflictResults`,
// keyed by the event id passed as `excludeEventId` — this action's own job
// is scoping, batching, and honesty around what that function returns, not
// re-testing `checkEventConflicts` itself (covered by conflicts.ts's own
// suite).
// ---------------------------------------------------------------------------

interface FakeConflict {
  userId: string;
  userName: string;
  playerId: string;
  avatarUrl: string | null;
  conflictingEvent: { id?: string; title: string; start: Date; end: Date; type: 'event' | 'class' | 'blocked' };
}
interface FakeConflictResult {
  hasConflict: boolean;
  conflicts: FakeConflict[];
  suggestedTimes: never[];
  partial?: boolean;
}

const state = vi.hoisted(() => {
  const conflictResults = new Map<string, FakeConflictResult>();
  const checkEventConflicts = vi.fn(
    async (
      _start: Date,
      _end: Date,
      _attendeeIds: string[],
      _supabase: unknown,
      options?: { excludeEventId?: string },
    ): Promise<FakeConflictResult> =>
      conflictResults.get(options?.excludeEventId ?? '') ?? { hasConflict: false, conflicts: [], suggestedTimes: [] },
  );
  return { conflictResults, checkEventConflicts };
});

vi.mock('@/lib/calendar/conflicts', () => ({ checkEventConflicts: state.checkEventConflicts }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));

let fake: FakeSupabase;
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));

import { getConflictInbox } from '../conflict-inbox';

// ---------------------------------------------------------------------------
// Seed data
//
// team-1: coach-1 (u-coach); active players player-1 (u-p1), player-2
// (u-p2). team-2: coach-2 (u-othercoach); player-3 — unrelated to team-1.
//
// event-practice: team-1, both players invited.
// event-meeting: team-1, only player-1 invited.
// event-cancelled: team-1, cancelled — must never surface.
// event-otherteam: team-2 — must never surface for a team-1 request.
// class-event-1: team-1's synced occurrence of class-99, owned by player-1.
// ---------------------------------------------------------------------------

// `teamId` is the only field this action UUID-validates up front, so it
// must be UUID-shaped; every other id here is free-form.
const TEAM_1 = '11111111-1111-4111-8111-111111111111';
const TEAM_2 = '22222222-2222-4222-8222-222222222222';

type Row = Record<string, unknown>;

interface SeedTables extends Record<string, Row[]> {
  golf_events: Row[];
  golf_coaches: Row[];
  golf_team_coach_staff: Row[];
  golf_players: Row[];
  golf_team_members: Row[];
  golf_event_attendance: Row[];
  golf_player_classes: Row[];
}

function baseTables(): SeedTables {
  return {
    golf_events: [
      { id: 'event-practice', team_id: TEAM_1, title: 'Practice', start_time: '2026-09-08T14:00:00.000Z', end_time: '2026-09-08T15:00:00.000Z', event_type: 'practice', description: null, status: 'scheduled' },
      { id: 'event-meeting', team_id: TEAM_1, title: 'Team Meeting', start_time: '2026-09-09T10:00:00.000Z', end_time: '2026-09-09T11:00:00.000Z', event_type: 'meeting', description: null, status: 'scheduled' },
      { id: 'event-cancelled', team_id: TEAM_1, title: 'Rained out', start_time: '2026-09-09T12:00:00.000Z', end_time: '2026-09-09T13:00:00.000Z', event_type: 'practice', description: null, status: 'cancelled' },
      { id: 'event-otherteam', team_id: TEAM_2, title: 'Other team practice', start_time: '2026-09-08T14:00:00.000Z', end_time: '2026-09-08T15:00:00.000Z', event_type: 'practice', description: null, status: 'scheduled' },
      { id: 'class-event-1', team_id: TEAM_1, title: 'CS 201 - Intro to CS', start_time: '2026-09-08T14:30:00.000Z', end_time: '2026-09-08T15:20:00.000Z', event_type: 'class', description: '[class:class-99]', status: 'scheduled' },
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
      { id: 'player-1', user_id: 'u-p1' },
      { id: 'player-2', user_id: 'u-p2' },
      { id: 'player-3', user_id: 'u-p3' },
    ],
    golf_team_members: [
      { id: 'm-1', team_id: TEAM_1, player_id: 'player-1', status: 'active' },
      { id: 'm-2', team_id: TEAM_1, player_id: 'player-2', status: 'active' },
      { id: 'm-3', team_id: TEAM_2, player_id: 'player-3', status: 'active' },
    ],
    golf_event_attendance: [
      { id: 'a-1', event_id: 'event-practice', player_id: 'player-1' },
      { id: 'a-2', event_id: 'event-practice', player_id: 'player-2' },
      { id: 'a-3', event_id: 'event-meeting', player_id: 'player-1' },
    ],
    golf_player_classes: [
      { id: 'class-99', player_id: 'player-1', class_name: 'CS 201 - Intro to CS' },
    ],
  };
}

function classOverlap(overrides: Partial<FakeConflict> = {}): FakeConflict {
  return {
    userId: 'u-p1', userName: 'Player One', playerId: 'player-1', avatarUrl: null,
    conflictingEvent: {
      id: 'class-event-1', title: 'CS 201 - Intro to CS',
      start: new Date('2026-09-08T14:30:00.000Z'), end: new Date('2026-09-08T15:20:00.000Z'),
      type: 'class',
    },
    ...overrides,
  };
}

/** Same RLS-simulation approach as class-detail.test.ts: `golf_player_classes`
 * visibility is owner-or-active-coach, never trusted from the caller's own
 * assertion. */
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
      is_golf_team_coach: async (args) => {
        const team_uuid = (args as { team_uuid: string }).team_uuid;
        const coach = tables.golf_coaches.find((c) => c.user_id === userId);
        return { data: Boolean(coach && tables.golf_team_coach_staff.some((s) => s.team_id === team_uuid && s.coach_id === coach.id)), error: null };
      },
      is_golf_team_player: async (args) => {
        const team_uuid = (args as { team_uuid: string }).team_uuid;
        const player = tables.golf_players.find((p) => p.user_id === userId);
        return { data: Boolean(player && tables.golf_team_members.some((m) => m.team_id === team_uuid && m.player_id === player.id && m.status === 'active')), error: null };
      },
    },
  });
  const origFrom = base.from.bind(base);
  base.from = ((table: string) => {
    if (table === 'golf_player_classes') {
      const visible = tables.golf_player_classes.filter((c) =>
        ownsPlayer(tables, userId, c.player_id) || isCoachOfPlayer(tables, userId, c.player_id));
      return createFakeSupabase({ user: userId ? { id: userId } : null, tables: { ...tables, golf_player_classes: visible } }).from(table);
    }
    return origFrom(table);
  }) as typeof base.from;
  fake = base;
  return base;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.conflictResults.clear();
});

// ===========================================================================
// Scope and bounds
// ===========================================================================

describe('getConflictInbox scope', () => {
  it('rejects a caller with no relationship to the team', async () => {
    asViewer('u-p3', baseTables()); // player-3 is on team-2, not team-1
    const result = await getConflictInbox({ teamId: TEAM_1, from: '2026-09-08', to: '2026-09-10' });
    expect(result.success).toBe(false);
  });

  it('never surfaces another team\'s events or a cancelled event', async () => {
    const tables = baseTables();
    state.conflictResults.set('event-practice', { hasConflict: true, conflicts: [classOverlap({ conflictingEvent: { ...classOverlap().conflictingEvent, type: 'event' as const, id: 'x' } })], suggestedTimes: [] });
    asViewer('u-coach', tables);
    const result = await getConflictInbox({ teamId: TEAM_1, from: '2026-09-08', to: '2026-09-10' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const eventIds = result.data.groups.map((g) => g.event.id);
    expect(eventIds).not.toContain('event-otherteam');
    expect(eventIds).not.toContain('event-cancelled');
  });

  it("limits a player's scope to their own invited events, checked against only their own schedule", async () => {
    const tables = baseTables();
    // Both events would show conflicts if checked — the assertion is on
    // WHICH events are considered and WHO the attendee list was, not on the
    // canned conflict content.
    state.conflictResults.set('event-practice', { hasConflict: true, conflicts: [], suggestedTimes: [] });
    state.conflictResults.set('event-meeting', { hasConflict: true, conflicts: [], suggestedTimes: [] });
    asViewer('u-p2', tables); // player-2: invited to event-practice only

    const result = await getConflictInbox({ teamId: TEAM_1, from: '2026-09-08', to: '2026-09-10' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const eventIds = result.data.groups.map((g) => g.event.id);
    expect(eventIds).toEqual(['event-practice']);
    expect(eventIds).not.toContain('event-meeting');

    // Attendee scoping: a player's own check is against THEIR schedule only,
    // never against the rest of that event's roster.
    const call = state.checkEventConflicts.mock.calls.find((c) => c[4]?.excludeEventId === 'event-practice');
    expect(call?.[2]).toEqual(['player-2']);
  });

  it('gives the coach every invited attendee for team scope, batched in one attendee query', async () => {
    const tables = baseTables();
    state.conflictResults.set('event-practice', { hasConflict: true, conflicts: [], suggestedTimes: [] });
    asViewer('u-coach', tables);

    await getConflictInbox({ teamId: TEAM_1, from: '2026-09-08', to: '2026-09-10' });
    const call = state.checkEventConflicts.mock.calls.find((c) => c[4]?.excludeEventId === 'event-practice');
    expect(call?.[2]?.slice().sort()).toEqual(['player-1', 'player-2']);
  });

  it('clamps a requested window to 14 days rather than expanding it', async () => {
    asViewer('u-coach', baseTables());
    const result = await getConflictInbox({ teamId: TEAM_1, from: '2026-09-01', to: '2026-10-01' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const spanMs = new Date(result.data.window.end).getTime() - new Date(result.data.window.start).getTime();
    expect(spanMs).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('rejects an invalid date range', async () => {
    asViewer('u-coach', baseTables());
    const result = await getConflictInbox({ teamId: TEAM_1, from: '2026-09-10', to: '2026-09-08' });
    expect(result.success).toBe(false);
  });

  it("never treats a synced class occurrence as a base team event, even if it has an attendance row", async () => {
    // class-event-1 is player-1's synced class meeting on the team calendar.
    // class-events.ts's invariant: any query for "the team's schedule" must
    // exclude event_type 'class' — a class is a personal commitment that may
    // only ever appear as an OVERLAP (via checkEventConflicts reading the
    // owner's busy time), never as the thing being checked for conflicts.
    const tables = baseTables();
    tables.golf_event_attendance.push({ id: 'a-4', event_id: 'class-event-1', player_id: 'player-1' });
    state.conflictResults.set('class-event-1', { hasConflict: true, conflicts: [], suggestedTimes: [] });
    asViewer('u-coach', tables);
    const result = await getConflictInbox({ teamId: TEAM_1, from: '2026-09-08', to: '2026-09-10' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.groups.map((g) => g.event.id)).not.toContain('class-event-1');
  });

  it('never lets a class occurrence become the base event in PLAYER scope either, even via a self-RSVP with no class-detail access', async () => {
    // Regression: player-2 self-RSVPs to player-1's class-event-1 (obtainable
    // today via respondToEvent + golf_event_attendance_insert_self, which
    // check only "active team member", never event_type). Without the same
    // `.neq('event_type', 'class')` filter the coach-scope query already
    // applies, class-event-1 could enter player-2's OWN `events` array and
    // surface as `group.event.title` — the class's real, unredacted name —
    // for a viewer with zero golf_player_classes access to it. That must
    // never happen: a class occurrence may only ever appear as an OVERLAP.
    const tables = baseTables();
    tables.golf_event_attendance.push({ id: 'a-5', event_id: 'class-event-1', player_id: 'player-2' });
    state.conflictResults.set('class-event-1', {
      hasConflict: true,
      conflicts: [classOverlap({ playerId: 'player-2', conflictingEvent: { ...classOverlap().conflictingEvent, type: 'event' as const, id: 'x' } })],
      suggestedTimes: [],
    });
    asViewer('u-p2', tables); // player scope: player-2 is not a coach and holds no golf_player_classes row for class-99
    const result = await getConflictInbox({ teamId: TEAM_1, from: '2026-09-08', to: '2026-09-10' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.groups.map((g) => g.event.id)).not.toContain('class-event-1');
    for (const group of result.data.groups) {
      expect(group.event.title).not.toContain('CS 201');
    }
  });

  it('withholds a class title even when the upstream overlap is mislabeled as a plain event', async () => {
    // The gate resolves class-ness from the golf_events row itself, not from
    // the `type` tag checkEventConflicts hands back — a tag that has been
    // wrong before (availability.ts's attendance arm). player-2 holds no
    // golf_player_classes row for class-99, so the title must stay withheld.
    const tables = baseTables();
    state.conflictResults.set('event-practice', {
      hasConflict: true,
      conflicts: [classOverlap({
        userId: 'u-p2', userName: 'Player Two', playerId: 'player-2',
        conflictingEvent: { ...classOverlap().conflictingEvent, type: 'event' as const },
      })],
      suggestedTimes: [],
    });
    asViewer('u-p2', tables);
    const result = await getConflictInbox({ teamId: TEAM_1, from: '2026-09-08', to: '2026-09-10' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const overlap = result.data.groups.find((g) => g.event.id === 'event-practice')?.overlaps[0];
    expect(overlap).toBeDefined();
    expect(overlap!.conflictingEvent.title).toBeUndefined();
    expect(overlap!.conflictingEvent.access).toBe('free_busy');
  });

  it('still shows the class title to a viewer who genuinely has detail access, tag or no tag', async () => {
    // Positive control for the case above: coach-1 is player-1's active coach,
    // so class-99 is visible to them under RLS and the title is theirs to see.
    const tables = baseTables();
    state.conflictResults.set('event-practice', {
      hasConflict: true,
      conflicts: [classOverlap({ conflictingEvent: { ...classOverlap().conflictingEvent, type: 'event' as const } })],
      suggestedTimes: [],
    });
    asViewer('u-coach', tables);
    const result = await getConflictInbox({ teamId: TEAM_1, from: '2026-09-08', to: '2026-09-10' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const overlap = result.data.groups.find((g) => g.event.id === 'event-practice')?.overlaps[0];
    expect(overlap!.conflictingEvent.title).toBe('CS 201 - Intro to CS');
    expect(overlap!.conflictingEvent.access).toBeUndefined();
  });
});

// ===========================================================================
// Honesty: per-person verification derived, never invented
// ===========================================================================

describe('getConflictInbox verification', () => {
  it('reports every attendee complete when the check was clean', async () => {
    const tables = baseTables();
    state.conflictResults.set('event-practice', {
      hasConflict: true,
      conflicts: [classOverlap({ playerId: 'player-1', conflictingEvent: { ...classOverlap().conflictingEvent, type: 'event' as const, id: 'x' } })],
      suggestedTimes: [],
    });
    asViewer('u-coach', tables);
    const result = await getConflictInbox({ teamId: TEAM_1, from: '2026-09-08', to: '2026-09-10' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const group = result.data.groups.find((g) => g.event.id === 'event-practice');
    expect(group?.verification).toBe('complete');
    expect(group?.unverifiedAttendeeIds).toEqual([]);
  });

  it('marks a non-overlapping attendee unverified — never "clear" — when the check was partial', async () => {
    const tables = baseTables();
    // player-1 and player-2 are both invited; only player-1 could be read.
    state.conflictResults.set('event-practice', {
      hasConflict: true,
      conflicts: [classOverlap({ playerId: 'player-1', conflictingEvent: { ...classOverlap().conflictingEvent, type: 'event' as const, id: 'x' } })],
      suggestedTimes: [],
      partial: true,
    });
    asViewer('u-coach', tables);
    const result = await getConflictInbox({ teamId: TEAM_1, from: '2026-09-08', to: '2026-09-10' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const group = result.data.groups.find((g) => g.event.id === 'event-practice');
    expect(group?.verification).toBe('partial');
    expect(group?.unverifiedAttendeeIds).toEqual(['player-2']);
  });

  it('surfaces an event whose check was partial even with zero found conflicts', async () => {
    const tables = baseTables();
    state.conflictResults.set('event-meeting', { hasConflict: false, conflicts: [], suggestedTimes: [], partial: true });
    asViewer('u-coach', tables);
    const result = await getConflictInbox({ teamId: TEAM_1, from: '2026-09-08', to: '2026-09-10' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.groups.map((g) => g.event.id)).toContain('event-meeting');
  });

  it('omits an event with no conflict and a clean check entirely', async () => {
    asViewer('u-coach', baseTables()); // no conflictResults seeded — every check is clean
    const result = await getConflictInbox({ teamId: TEAM_1, from: '2026-09-08', to: '2026-09-10' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.groups).toEqual([]);
  });
});

// ===========================================================================
// Honesty: class titles gated on class-detail access (§2.4's rule, reapplied)
// ===========================================================================

describe('getConflictInbox class overlap titles', () => {
  it("includes the class title when the coach still has detail access to the owner's class", async () => {
    const tables = baseTables(); // player-1 is an ACTIVE team-1 member; class-99 is theirs
    state.conflictResults.set('event-practice', { hasConflict: true, conflicts: [classOverlap()], suggestedTimes: [] });
    asViewer('u-coach', tables);
    const result = await getConflictInbox({ teamId: TEAM_1, from: '2026-09-08', to: '2026-09-10' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const overlap = result.data.groups.find((g) => g.event.id === 'event-practice')?.overlaps[0];
    expect(overlap?.conflictingEvent.title).toBe('CS 201 - Intro to CS');
    expect(overlap?.conflictingEvent.access).toBeUndefined();
  });

  it('withholds the class title, and never forwards a fabricated "Busy" fallback, once the owner leaves the roster', async () => {
    const tables = baseTables();
    // player-1 is no longer an active member — the coach's RLS access to
    // their classes is gone even though an old attendance row still exists.
    tables.golf_team_members = tables.golf_team_members.map((m) =>
      m.player_id === 'player-1' ? { ...m, status: 'inactive' } : m);
    state.conflictResults.set('event-practice', {
      hasConflict: true,
      conflicts: [classOverlap({ conflictingEvent: { ...classOverlap().conflictingEvent, title: 'Busy' } })],
      suggestedTimes: [],
    });
    asViewer('u-coach', tables);
    const result = await getConflictInbox({ teamId: TEAM_1, from: '2026-09-08', to: '2026-09-10' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const overlap = result.data.groups.find((g) => g.event.id === 'event-practice')?.overlaps[0];
    expect(overlap?.conflictingEvent.title).toBeUndefined();
    expect(overlap?.conflictingEvent.access).toBe('free_busy');
    expect(overlap?.conflictingEvent.start).toBe('2026-09-08T14:30:00.000Z');
  });

  it('never gates a non-class overlap title behind class-detail access', async () => {
    const tables = baseTables();
    state.conflictResults.set('event-practice', {
      hasConflict: true,
      conflicts: [classOverlap({ conflictingEvent: { id: 'other-event', title: 'Study Session', start: new Date('2026-09-08T14:15:00.000Z'), end: new Date('2026-09-08T14:45:00.000Z'), type: 'event' } })],
      suggestedTimes: [],
    });
    asViewer('u-coach', tables);
    const result = await getConflictInbox({ teamId: TEAM_1, from: '2026-09-08', to: '2026-09-10' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const overlap = result.data.groups.find((g) => g.event.id === 'event-practice')?.overlaps[0];
    expect(overlap?.conflictingEvent.title).toBe('Study Session');
  });
});
