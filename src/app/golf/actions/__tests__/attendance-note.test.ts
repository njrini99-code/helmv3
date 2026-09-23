import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

// ---------------------------------------------------------------------------
// N1: updateAttendanceNote. Kept in its own file (attendance*.test.ts) so the
// existing attendance.test.ts suite is untouched by this addition.
// ---------------------------------------------------------------------------

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));

import { updateAttendanceNote } from '../attendance';

type Row = Record<string, unknown>;

interface SeedTables extends Record<string, Row[]> {
  golf_events: Row[];
  golf_coaches: Row[];
  golf_team_coach_staff: Row[];
  golf_players: Row[];
  golf_team_members: Row[];
  golf_event_attendance: Row[];
}

function baseTables(): SeedTables {
  return {
    golf_events: [{ id: 'event-1', team_id: 'team-1', start_time: '2026-06-10T14:00:00Z' }],
    golf_coaches: [
      { id: 'coach-1', user_id: 'u-coach' },
      { id: 'coach-2', user_id: 'u-othercoach' },
    ],
    golf_team_coach_staff: [
      { id: 'staff-1', team_id: 'team-1', coach_id: 'coach-1' },
      { id: 'staff-2', team_id: 'team-2', coach_id: 'coach-2' },
    ],
    golf_players: [
      { id: 'player-1', user_id: 'u-player', first_name: 'Nick', last_name: 'Rini' },
      { id: 'player-3', user_id: 'u-player3', first_name: 'Sam', last_name: 'Other' },
    ],
    golf_team_members: [
      { id: 'm-1', team_id: 'team-1', player_id: 'player-1', status: 'active' },
      { id: 'm-3', team_id: 'team-2', player_id: 'player-3', status: 'active' },
    ],
    golf_event_attendance: [],
  };
}

function asCoach<T extends Record<string, Row[]>>(tables: T): T {
  fake = createFakeSupabase({ user: { id: 'u-coach' }, tables });
  return tables;
}
function asUser<T extends Record<string, Row[]>>(userId: string, tables: T): T {
  fake = createFakeSupabase({ user: { id: userId }, tables });
  return tables;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('updateAttendanceNote authz', () => {
  it('rejects unauthenticated callers', async () => {
    fake = createFakeSupabase({ user: null, tables: baseTables() });
    const result = await updateAttendanceNote('event-1', 'player-1', 'Left early');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not authenticated');
  });

  it('rejects a caller with no coach row', async () => {
    asUser('u-player', baseTables());
    const result = await updateAttendanceNote('event-1', 'player-1', 'Left early');
    expect(result.success).toBe(false);
    expect(result.error).toContain("Only this team's coaches");
  });

  it("rejects a coach who does not staff the event's team", async () => {
    asUser('u-othercoach', baseTables());
    const result = await updateAttendanceNote('event-1', 'player-1', 'Left early');
    expect(result.success).toBe(false);
    expect(result.error).toContain("Only this team's coaches");
  });

  it('rejects a player not on the event team', async () => {
    asCoach(baseTables());
    const result = await updateAttendanceNote('event-1', 'player-3', 'Left early');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not an active member');
  });

  it('rejects a note over the length cap', async () => {
    asCoach(baseTables());
    const result = await updateAttendanceNote('event-1', 'player-1', 'x'.repeat(2001));
    expect(result.success).toBe(false);
    expect(result.error).toContain('2000 characters');
  });
});

describe('updateAttendanceNote write behavior', () => {
  it('updates an existing attendance row without touching RSVP or attendance_status', async () => {
    const tables = baseTables();
    tables.golf_event_attendance.push({
      id: 'att-1', event_id: 'event-1', player_id: 'player-1',
      status: 'accepted', rsvp_at: '2026-06-01T00:00:00Z',
      attendance_status: 'present', checked_in: true, checked_in_at: '2026-06-10T13:55:00Z',
      notes: null,
    });
    asCoach(tables);

    const result = await updateAttendanceNote('event-1', 'player-1', 'Left early for class');
    expect(result.success).toBe(true);

    const row = tables.golf_event_attendance.find((r) => r.id === 'att-1');
    expect(row?.notes).toBe('Left early for class');
    expect(row?.status).toBe('accepted');
    expect(row?.attendance_status).toBe('present');
  });

  it('reports an honest error rather than inventing a row when none exists yet', async () => {
    asCoach(baseTables()); // no attendance row seeded for player-1/event-1
    const result = await updateAttendanceNote('event-1', 'player-1', 'Left early');
    expect(result.success).toBe(false);
    expect(result.error).toContain('No attendance record');
  });

  it('clears a note by writing null for an empty string', async () => {
    const tables = baseTables();
    tables.golf_event_attendance.push({
      id: 'att-1', event_id: 'event-1', player_id: 'player-1', notes: 'old note',
    });
    asCoach(tables);

    const result = await updateAttendanceNote('event-1', 'player-1', '');
    expect(result.success).toBe(true);
    const row = tables.golf_event_attendance.find((r) => r.id === 'att-1');
    expect(row?.notes).toBeNull();
  });

  it('trims whitespace before saving', async () => {
    const tables = baseTables();
    tables.golf_event_attendance.push({ id: 'att-1', event_id: 'event-1', player_id: 'player-1', notes: null });
    asCoach(tables);

    const result = await updateAttendanceNote('event-1', 'player-1', '  Left early  ');
    expect(result.success).toBe(true);
    const row = tables.golf_event_attendance.find((r) => r.id === 'att-1');
    expect(row?.notes).toBe('Left early');
  });
});
