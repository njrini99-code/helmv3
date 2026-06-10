import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

// ---------------------------------------------------------------------------
// Mocks — the fake client is swapped per test via `fake`
// ---------------------------------------------------------------------------

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  markAttendance,
  checkInPlayer,
  markNoShow,
  bulkCheckIn,
  getAttendanceReport,
  getPlayerAttendanceStats,
} from '../attendance';

// ---------------------------------------------------------------------------
// Seed data
//
// team-1: coached by coach-1 (user u-coach); active players player-1 (Nick
// Rini, user u-player) and player-2 (Ava Smith, user u-player2).
// team-2: coached by coach-2 (user u-othercoach); active player player-3.
// event-1 belongs to team-1.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function baseTables(): Record<string, Row[]> {
  return {
    golf_events: [
      { id: 'event-1', team_id: 'team-1', start_time: '2026-06-10T14:00:00Z' },
    ],
    golf_coaches: [
      { id: 'coach-1', user_id: 'u-coach' },
      { id: 'coach-2', user_id: 'u-othercoach' },
    ],
    golf_team_coach_staff: [
      { id: 'staff-1', team_id: 'team-1', coach_id: 'coach-1' },
      { id: 'staff-2', team_id: 'team-2', coach_id: 'coach-2' },
    ],
    golf_players: [
      { id: 'player-1', user_id: 'u-player', first_name: 'Nick', last_name: 'Rini', jersey_number: 7 },
      { id: 'player-2', user_id: 'u-player2', first_name: 'Ava', last_name: 'Smith', jersey_number: 12 },
      { id: 'player-3', user_id: 'u-player3', first_name: 'Sam', last_name: 'Other', jersey_number: 3 },
    ],
    golf_team_members: [
      { id: 'm-1', team_id: 'team-1', player_id: 'player-1', status: 'active' },
      { id: 'm-2', team_id: 'team-1', player_id: 'player-2', status: 'active' },
      { id: 'm-3', team_id: 'team-2', player_id: 'player-3', status: 'active' },
    ],
    golf_event_attendance: [],
  };
}

function asCoach(tables: Record<string, Row[]>) {
  fake = createFakeSupabase({ user: { id: 'u-coach' }, tables });
  return tables;
}

function asUser(userId: string, tables: Record<string, Row[]>) {
  fake = createFakeSupabase({ user: { id: userId }, tables });
  return tables;
}

/**
 * Wrap the fake so `.range(from, to)` calls against one table are recorded —
 * lets pagination tests assert that fetchAllRowsResult actually paged instead
 * of relying on the fake (which, unlike PostgREST, has no 1000-row cap).
 */
function spyOnRange(table: string): Array<[number, number]> {
  const calls: Array<[number, number]> = [];
  const origFrom = fake.from.bind(fake);
  fake.from = ((t: string) => {
    const api = origFrom(t);
    if (t !== table) return api;
    return {
      ...api,
      select(cols?: string) {
        const builder = api.select(cols);
        const origRange = builder.range.bind(builder);
        builder.range = (from: number, to: number) => {
          calls.push([from, to]);
          return origRange(from, to);
        };
        return builder;
      },
    };
  }) as typeof fake.from;
  return calls;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// markAttendance — authz
// ===========================================================================

describe('markAttendance authz', () => {
  it('rejects unauthenticated callers', async () => {
    asUser('u-coach', baseTables());
    fake = createFakeSupabase({ user: null, tables: baseTables() });
    const result = await markAttendance('event-1', 'player-1', 'present');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not authenticated');
  });

  it('rejects a caller with no coach row', async () => {
    asUser('u-player', baseTables());
    const result = await markAttendance('event-1', 'player-1', 'present');
    expect(result.success).toBe(false);
    expect(result.error).toContain("Only this team's coaches");
  });

  it("rejects a coach who does not staff the event's team", async () => {
    asUser('u-othercoach', baseTables());
    const result = await markAttendance('event-1', 'player-1', 'present');
    expect(result.success).toBe(false);
    expect(result.error).toContain("Only this team's coaches");
  });

  it('rejects an unknown event', async () => {
    asCoach(baseTables());
    const result = await markAttendance('event-404', 'player-1', 'present');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Event not found');
  });

  it("rejects players who are not active members of the event's team", async () => {
    asCoach(baseTables());
    const result = await markAttendance('event-1', 'player-3', 'present');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not an active member');
  });

  it('rejects an invalid mark', async () => {
    asCoach(baseTables());
    const result = await markAttendance('event-1', 'player-1', 'tardy' as never);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid attendance mark');
  });
});

// ===========================================================================
// markAttendance — RSVP preservation (audit finding #21)
// ===========================================================================

describe('markAttendance RSVP preservation', () => {
  it('check-in preserves an existing RSVP response', async () => {
    const tables = baseTables();
    tables.golf_event_attendance.push({
      id: 'att-1',
      event_id: 'event-1',
      player_id: 'player-1',
      status: 'declined',
      rsvp_at: '2026-06-01T00:00:00Z',
      checked_in: false,
      checked_in_at: null,
      notes: null,
    });
    asCoach(tables);

    const result = await markAttendance('event-1', 'player-1', 'present');
    expect(result.success).toBe(true);

    const row = tables.golf_event_attendance.find((r) => r.id === 'att-1');
    expect(row?.checked_in).toBe(true);
    expect(row?.checked_in_at).toBeTruthy();
    // RSVP untouched:
    expect(row?.status).toBe('declined');
    expect(row?.rsvp_at).toBe('2026-06-01T00:00:00Z');
  });

  it('creates a check-in row WITHOUT inventing an RSVP for un-RSVPed players', async () => {
    const tables = asCoach(baseTables());

    const result = await markAttendance('event-1', 'player-1', 'present');
    expect(result.success).toBe(true);

    const row = tables.golf_event_attendance.find((r) => r.player_id === 'player-1');
    expect(row).toBeDefined();
    expect(row?.checked_in).toBe(true);
    // The payload must not contain status/rsvp_at — DB defaults apply.
    expect(row).not.toHaveProperty('status');
    expect(row).not.toHaveProperty('rsvp_at');
  });

  it('no-show preserves the RSVP and stamps a recorded-at time', async () => {
    const tables = baseTables();
    tables.golf_event_attendance.push({
      id: 'att-1',
      event_id: 'event-1',
      player_id: 'player-1',
      status: 'accepted',
      rsvp_at: '2026-06-02T00:00:00Z',
      checked_in: true,
      checked_in_at: '2026-06-10T13:55:00Z',
      notes: null,
    });
    asCoach(tables);

    const result = await markAttendance('event-1', 'player-1', 'no_show');
    expect(result.success).toBe(true);

    const row = tables.golf_event_attendance.find((r) => r.id === 'att-1');
    expect(row?.checked_in).toBe(false);
    // Explicit no-show is distinguishable from never-marked:
    expect(row?.checked_in_at).toBeTruthy();
    expect(row?.status).toBe('accepted');
    expect(row?.rsvp_at).toBe('2026-06-02T00:00:00Z');
  });

  it('clear reverts to unmarked (checked_in_at null) without touching the RSVP', async () => {
    const tables = baseTables();
    tables.golf_event_attendance.push({
      id: 'att-1',
      event_id: 'event-1',
      player_id: 'player-1',
      status: 'tentative',
      rsvp_at: '2026-06-02T00:00:00Z',
      checked_in: true,
      checked_in_at: '2026-06-10T13:55:00Z',
      notes: null,
    });
    asCoach(tables);

    const result = await markAttendance('event-1', 'player-1', 'clear');
    expect(result.success).toBe(true);

    const row = tables.golf_event_attendance.find((r) => r.id === 'att-1');
    expect(row?.checked_in).toBe(false);
    expect(row?.checked_in_at).toBeNull();
    expect(row?.status).toBe('tentative');
  });

  it('checkInPlayer delegates to the RSVP-preserving path', async () => {
    const tables = baseTables();
    tables.golf_event_attendance.push({
      id: 'att-1',
      event_id: 'event-1',
      player_id: 'player-1',
      status: 'declined',
      rsvp_at: '2026-06-01T00:00:00Z',
      checked_in: false,
      checked_in_at: null,
      notes: null,
    });
    asCoach(tables);

    const result = await checkInPlayer('event-1', 'player-1');
    expect(result.success).toBe(true);
    const row = tables.golf_event_attendance.find((r) => r.id === 'att-1');
    expect(row?.checked_in).toBe(true);
    expect(row?.status).toBe('declined');
  });

  it('markNoShow delegates to the RSVP-preserving path', async () => {
    const tables = baseTables();
    tables.golf_event_attendance.push({
      id: 'att-1',
      event_id: 'event-1',
      player_id: 'player-1',
      status: 'accepted',
      rsvp_at: '2026-06-01T00:00:00Z',
      checked_in: false,
      checked_in_at: null,
      notes: null,
    });
    asCoach(tables);

    const result = await markNoShow('event-1', 'player-1');
    expect(result.success).toBe(true);
    const row = tables.golf_event_attendance.find((r) => r.id === 'att-1');
    expect(row?.checked_in).toBe(false);
    expect(row?.checked_in_at).toBeTruthy();
    expect(row?.status).toBe('accepted');
  });
});

// ===========================================================================
// bulkCheckIn
// ===========================================================================

describe('bulkCheckIn', () => {
  it('rejects a caller who does not coach the event team', async () => {
    asUser('u-othercoach', baseTables());
    const result = await bulkCheckIn('event-1', ['player-1', 'player-2']);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Only this team's coaches");
  });

  it("filters the target set to the event team's active members", async () => {
    const tables = asCoach(baseTables());

    const result = await bulkCheckIn('event-1', ['player-1', 'player-2', 'player-3']);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ successCount: 2, failureCount: 1 });

    const written = tables.golf_event_attendance.map((r) => r.player_id);
    expect(written).toContain('player-1');
    expect(written).toContain('player-2');
    expect(written).not.toContain('player-3');
  });

  it('does not clobber existing RSVP responses', async () => {
    const tables = baseTables();
    tables.golf_event_attendance.push(
      {
        id: 'att-1',
        event_id: 'event-1',
        player_id: 'player-1',
        status: 'declined',
        rsvp_at: '2026-06-01T00:00:00Z',
        checked_in: false,
        checked_in_at: null,
        notes: null,
      },
      {
        id: 'att-2',
        event_id: 'event-1',
        player_id: 'player-2',
        status: 'tentative',
        rsvp_at: '2026-06-03T00:00:00Z',
        checked_in: false,
        checked_in_at: null,
        notes: null,
      },
    );
    asCoach(tables);

    const result = await bulkCheckIn('event-1', ['player-1', 'player-2']);
    expect(result.success).toBe(true);

    const att1 = tables.golf_event_attendance.find((r) => r.id === 'att-1');
    const att2 = tables.golf_event_attendance.find((r) => r.id === 'att-2');
    expect(att1?.checked_in).toBe(true);
    expect(att2?.checked_in).toBe(true);
    expect(att1?.status).toBe('declined');
    expect(att2?.status).toBe('tentative');
  });

  it('returns 0/N when no requested player is on the team', async () => {
    asCoach(baseTables());
    const result = await bulkCheckIn('event-1', ['player-3']);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ successCount: 0, failureCount: 1 });
  });
});

// ===========================================================================
// getAttendanceReport — viewer scoping (finding #30: notes)
// ===========================================================================

function seedReportRows(tables: Record<string, Row[]>) {
  tables.golf_event_attendance.push(
    {
      id: 'att-1',
      event_id: 'event-1',
      player_id: 'player-1',
      status: 'accepted',
      rsvp_at: '2026-06-01T00:00:00Z',
      checked_in: true,
      checked_in_at: '2026-06-10T13:50:00Z',
      notes: 'left early for class',
      player: { first_name: 'Nick', last_name: 'Rini', jersey_number: 7 },
    },
    {
      id: 'att-2',
      event_id: 'event-1',
      player_id: 'player-2',
      status: 'pending',
      rsvp_at: null,
      checked_in: false,
      checked_in_at: null,
      notes: 'coach-only context',
      player: { first_name: 'Ava', last_name: 'Smith', jersey_number: 12 },
    },
  );
}

describe('getAttendanceReport', () => {
  it('lets the team coach read every row including notes', async () => {
    const tables = baseTables();
    seedReportRows(tables);
    asCoach(tables);

    const result = await getAttendanceReport('event-1');
    expect(result.success).toBe(true);
    expect(result.data?.viewerIsCoach).toBe(true);
    expect(result.data?.attendance).toHaveLength(2);
    const notes = result.data?.attendance.map((r) => r.notes);
    expect(notes).toContain('left early for class');
    expect(notes).toContain('coach-only context');
  });

  it("strips other players' notes for a player caller but keeps their own", async () => {
    const tables = baseTables();
    seedReportRows(tables);
    asUser('u-player', tables); // player-1

    const result = await getAttendanceReport('event-1');
    expect(result.success).toBe(true);
    expect(result.data?.viewerIsCoach).toBe(false);
    expect(result.data?.viewerPlayerId).toBe('player-1');

    const own = result.data?.attendance.find((r) => r.player_id === 'player-1');
    const other = result.data?.attendance.find((r) => r.player_id === 'player-2');
    expect(own?.notes).toBe('left early for class');
    expect(other?.notes).toBeNull();
  });

  it('rejects callers who are neither team coach nor team player', async () => {
    const tables = baseTables();
    seedReportRows(tables);
    asUser('u-outsider', tables);

    const result = await getAttendanceReport('event-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain("don't have access");
  });

  it('rejects a coach from a different team', async () => {
    const tables = baseTables();
    seedReportRows(tables);
    asUser('u-othercoach', tables);

    const result = await getAttendanceReport('event-1');
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// getPlayerAttendanceStats — pagination + weighted percentages
// ===========================================================================

describe('getPlayerAttendanceStats', () => {
  it('paginates past the PostgREST 1000-row cap', async () => {
    const tables = baseTables();
    // 1500 rows for player-1: 900 attended, 400 explicit no-shows, 200 unmarked.
    for (let i = 0; i < 1500; i += 1) {
      const id = `att-${String(i).padStart(5, '0')}`;
      if (i < 900) {
        tables.golf_event_attendance.push({
          id, event_id: `e-${i}`, player_id: 'player-1',
          checked_in: true, checked_in_at: '2026-06-01T00:00:00Z',
        });
      } else if (i < 1300) {
        tables.golf_event_attendance.push({
          id, event_id: `e-${i}`, player_id: 'player-1',
          checked_in: false, checked_in_at: '2026-06-01T00:00:00Z',
        });
      } else {
        tables.golf_event_attendance.push({
          id, event_id: `e-${i}`, player_id: 'player-1',
          checked_in: false, checked_in_at: null,
        });
      }
    }
    asCoach(tables);
    const rangeCalls = spyOnRange('golf_event_attendance');

    const result = await getPlayerAttendanceStats('player-1');
    expect(result.success).toBe(true);

    // The fetch actually paged (page 1: 0-999, page 2: 1000-1999) …
    expect(rangeCalls).toEqual([[0, 999], [1000, 1999]]);

    // … and every row past the cap was counted.
    const player = result.data?.players.find((p) => p.player_id === 'player-1');
    expect(player?.invited).toBe(1500);
    expect(player?.attended).toBe(900);
    expect(player?.no_shows).toBe(400);
    expect(player?.unmarked).toBe(200);
    // 900 / (900 + 400) = 69.2%
    expect(player?.attendance_pct).toBe(69.2);
  });

  it('weights the overall percentage sum/sum, not mean-of-percentages', async () => {
    const tables = baseTables();
    // player-1: 9 attended + 1 no-show (90%). player-2: 0 attended + 1 no-show (0%).
    for (let i = 0; i < 9; i += 1) {
      tables.golf_event_attendance.push({
        id: `a1-${i}`, event_id: `e-${i}`, player_id: 'player-1',
        checked_in: true, checked_in_at: '2026-06-01T00:00:00Z',
      });
    }
    tables.golf_event_attendance.push(
      { id: 'a1-ns', event_id: 'e-9', player_id: 'player-1', checked_in: false, checked_in_at: '2026-06-01T00:00:00Z' },
      { id: 'a2-ns', event_id: 'e-10', player_id: 'player-2', checked_in: false, checked_in_at: '2026-06-01T00:00:00Z' },
    );
    asCoach(tables);

    const result = await getPlayerAttendanceStats();
    expect(result.success).toBe(true);

    const p1 = result.data?.players.find((p) => p.player_id === 'player-1');
    const p2 = result.data?.players.find((p) => p.player_id === 'player-2');
    expect(p1?.attendance_pct).toBe(90);
    expect(p2?.attendance_pct).toBe(0);

    // Weighted: 9 attended / 11 recorded = 81.8% — NOT (90 + 0) / 2 = 45%.
    expect(result.data?.overall.attendance_pct).toBe(81.8);
    expect(result.data?.overall.attended).toBe(9);
    expect(result.data?.overall.no_shows).toBe(2);
  });

  it('limits a player caller to their own stats', async () => {
    const tables = baseTables();
    tables.golf_event_attendance.push(
      { id: 'a1', event_id: 'e-1', player_id: 'player-1', checked_in: true, checked_in_at: '2026-06-01T00:00:00Z' },
      { id: 'a2', event_id: 'e-1', player_id: 'player-2', checked_in: true, checked_in_at: '2026-06-01T00:00:00Z' },
    );
    asUser('u-player', tables); // player-1

    // Asking for someone else is rejected …
    const denied = await getPlayerAttendanceStats('player-2');
    expect(denied.success).toBe(false);
    expect(denied.error).toContain('Not authorized');

    // … and the default scope is self only.
    const own = await getPlayerAttendanceStats();
    expect(own.success).toBe(true);
    expect(own.data?.players).toHaveLength(1);
    expect(own.data?.players[0]?.player_id).toBe('player-1');
  });

  it('rejects a coach asking about a player outside their teams', async () => {
    asCoach(baseTables());
    const result = await getPlayerAttendanceStats('player-3');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not authorized');
  });

  it('rejects callers with no coach or player identity', async () => {
    asUser('u-outsider', baseTables());
    const result = await getPlayerAttendanceStats();
    expect(result.success).toBe(false);
  });
});
