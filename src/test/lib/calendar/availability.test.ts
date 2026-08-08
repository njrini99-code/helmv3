/**
 * Regression tests for src/lib/calendar/availability.ts — calendar audit
 * 2026-06-10, finding #7 (conflict detection blind to timed team events) and
 * #24 (unwindowed lifetime accepted-RSVP fetch).
 *
 * The shared fake-supabase fixture has no `.or()` / embedded-filter support,
 * so these tests use a purpose-built stub that ACTUALLY APPLIES the generated
 * PostgREST filters (eq/neq/in/gte/lte/or, dotted paths for embedded rows,
 * range pagination). That makes the window-query regression meaningful: the
 * old date-collapsed filters exclude the seeded timed events under these same
 * semantics, the new timestamp-overlap filters include them.
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserBusyPeriods, periodsOverlap } from '@/lib/calendar/availability';
import { checkEventConflicts } from '@/lib/calendar/conflicts';

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Filter-applying stub
// ---------------------------------------------------------------------------

function get(row: Row, path: string): unknown {
  let cur: unknown = row;
  for (const part of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Row)[part];
  }
  return cur;
}

function compare(v: unknown, op: string, val: string): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v);
  switch (op) {
    case 'eq': return s === val;
    case 'neq': return s !== val;
    case 'gt': return s > val;
    case 'gte': return s >= val;
    case 'lt': return s < val;
    case 'lte': return s <= val;
    default: return false;
  }
}

class StubQuery implements PromiseLike<{ data: Row[]; error: null }> {
  private filters: Array<(r: Row) => boolean> = [];
  private rangeFrom?: number;
  private rangeTo?: number;
  private orderCol?: string;

  constructor(
    private readonly rows: Row[],
    private readonly rangeLog?: Array<[number, number]>,
  ) {}

  select(): this { return this; }
  eq(col: string, v: unknown): this { this.filters.push((r) => get(r, col) === v); return this; }
  neq(col: string, v: unknown): this { this.filters.push((r) => get(r, col) !== v); return this; }
  in(col: string, vs: unknown[]): this { this.filters.push((r) => vs.includes(get(r, col))); return this; }
  gte(col: string, v: unknown): this { this.filters.push((r) => compare(get(r, col), 'gte', String(v))); return this; }
  lte(col: string, v: unknown): this { this.filters.push((r) => compare(get(r, col), 'lte', String(v))); return this; }
  or(expr: string, opts?: { referencedTable?: string }): this {
    const prefix = opts?.referencedTable ? `${opts.referencedTable}.` : '';
    const arms = expr.split(',').map((s) => s.trim());
    this.filters.push((r) =>
      arms.some((arm) => {
        const m = arm.match(/^([\w.]+)\.(eq|neq|gt|gte|lt|lte)\.(.+)$/);
        if (!m) throw new Error(`stub .or(): unsupported arm "${arm}"`);
        return compare(get(r, prefix + m[1]!), m[2]!, m[3]!);
      }),
    );
    return this;
  }
  order(col: string): this { this.orderCol = col; return this; }
  range(from: number, to: number): this {
    this.rangeLog?.push([from, to]);
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    const rows = this.apply();
    return { data: rows[0] ?? null, error: null };
  }
  private apply(): Row[] {
    let result = this.rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.orderCol) {
      const col = this.orderCol;
      result = [...result].sort((a, b) => (String(get(a, col)) < String(get(b, col)) ? -1 : 1));
    }
    if (this.rangeFrom !== undefined && this.rangeTo !== undefined) {
      result = result.slice(this.rangeFrom, this.rangeTo + 1);
    }
    return result;
  }
  then<R1 = { data: Row[]; error: null }, R2 = never>(
    onfulfilled?: ((v: { data: Row[]; error: null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve({ data: this.apply(), error: null }).then(
      onfulfilled ?? undefined,
      onrejected ?? undefined,
    );
  }
}

function createStubClient(
  tables: Record<string, Row[]>,
  rangeLogs: Record<string, Array<[number, number]>> = {},
): SupabaseClient {
  return {
    from(table: string) {
      return {
        select: () => new StubQuery(tables[table] ?? [], rangeLogs[table]),
      };
    },
  } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Seeds — player p1 (user u1) on team t1
// ---------------------------------------------------------------------------

/** Known-key seed shape so indexed access is non-optional under strict TS. */
interface SeedTables extends Record<string, Row[]> {
  golf_players: Row[];
  golf_coaches: Row[];
  golf_teams: Row[];
  golf_team_members: Row[];
  golf_events: Row[];
  golf_event_attendance: Row[];
  golf_player_classes: Row[];
  golf_coach_blocked_time: Row[];
}

function baseTables(): SeedTables {
  return {
    golf_players: [{ id: 'p1', user_id: 'u1', first_name: 'Nick', last_name: 'Rini', avatar_url: null }],
    golf_coaches: [],
    golf_teams: [],
    golf_team_members: [{ team_id: 't1', player_id: 'p1', status: 'active' }],
    golf_events: [],
    golf_event_attendance: [],
    golf_player_classes: [],
    golf_coach_blocked_time: [],
  };
}

describe('getUserBusyPeriods — timed team events (audit #7)', () => {
  it('returns a TIMED practice that overlaps the queried window', async () => {
    const tables = baseTables();
    // Existing timed practice 17:00–19:00Z. Under the old date-collapsed
    // filters (gte/lte 'YYYY-MM-DD') this row was invisible because
    // '2026-06-10T17:00:00Z' > '2026-06-10'.
    tables.golf_events.push({
      id: 'e1', team_id: 't1', title: 'Team Practice', status: 'scheduled',
      start_time: '2026-06-10T17:00:00+00:00', end_time: '2026-06-10T19:00:00+00:00',
      created_by: 'c1',
    });
    const supabase = createStubClient(tables);

    const busy = await getUserBusyPeriods(
      'u1',
      new Date('2026-06-10T18:00:00Z'),
      new Date('2026-06-10T20:00:00Z'),
      supabase,
    );

    expect(busy).toHaveLength(1);
    expect(busy[0]!.title).toBe('Team Practice');
    expect(busy[0]!.start.toISOString()).toBe('2026-06-10T17:00:00.000Z');
  });

  it('includes an event that starts inside the window with a null end_time', async () => {
    const tables = baseTables();
    tables.golf_events.push({
      id: 'e1', team_id: 't1', title: 'Tee Time', status: 'scheduled',
      start_time: '2026-06-10T18:30:00+00:00', end_time: null, created_by: 'c1',
    });
    const supabase = createStubClient(tables);

    const busy = await getUserBusyPeriods(
      'u1', new Date('2026-06-10T18:00:00Z'), new Date('2026-06-10T20:00:00Z'), supabase,
    );

    expect(busy).toHaveLength(1);
  });

  it('excludes events fully outside the window and soft-cancelled events', async () => {
    const tables = baseTables();
    tables.golf_events.push(
      { id: 'before', team_id: 't1', title: 'Earlier', status: 'scheduled',
        start_time: '2026-06-10T10:00:00+00:00', end_time: '2026-06-10T11:00:00+00:00', created_by: 'c1' },
      { id: 'after', team_id: 't1', title: 'Later', status: 'scheduled',
        start_time: '2026-06-10T21:00:00+00:00', end_time: '2026-06-10T22:00:00+00:00', created_by: 'c1' },
      { id: 'cancelled', team_id: 't1', title: 'Cancelled Practice', status: 'cancelled',
        start_time: '2026-06-10T18:30:00+00:00', end_time: '2026-06-10T19:30:00+00:00', created_by: 'c1' },
    );
    const supabase = createStubClient(tables);

    const busy = await getUserBusyPeriods(
      'u1', new Date('2026-06-10T18:00:00Z'), new Date('2026-06-10T20:00:00Z'), supabase,
    );

    expect(busy).toHaveLength(0);
  });

  it('windows the accepted-RSVP fetch instead of pulling lifetime history (audit #24)', async () => {
    const tables = baseTables();
    // Player accepted an event on ANOTHER team (not in teamIds) so it flows
    // through the attendance arm; one in-window, one years earlier.
    tables.golf_event_attendance.push(
      {
        id: 'a1', player_id: 'p1', status: 'accepted', event_id: 'in-window',
        event: { id: 'in-window', title: 'Scrimmage', status: 'scheduled',
          start_time: '2026-06-10T18:30:00+00:00', end_time: '2026-06-10T19:30:00+00:00' },
      },
      {
        id: 'a2', player_id: 'p1', status: 'accepted', event_id: 'ancient',
        event: { id: 'ancient', title: 'Old Event', status: 'scheduled',
          start_time: '2023-01-05T18:30:00+00:00', end_time: '2023-01-05T19:30:00+00:00' },
      },
    );
    const supabase = createStubClient(tables);

    const busy = await getUserBusyPeriods(
      'u1', new Date('2026-06-10T18:00:00Z'), new Date('2026-06-10T20:00:00Z'), supabase,
    );

    expect(busy).toHaveLength(1);
    expect(busy[0]!.title).toBe('Scrimmage');
  });

  it('paginates past the PostgREST 1000-row page cap', async () => {
    const tables = baseTables();
    // 1200 non-overlapping 30-minute events inside the window.
    const base = Date.parse('2026-06-01T00:00:00Z');
    for (let i = 0; i < 1200; i++) {
      const start = new Date(base + i * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      tables.golf_events.push({
        id: `e${String(i).padStart(5, '0')}`, team_id: 't1', title: `Slot ${i}`,
        status: 'scheduled', start_time: start.toISOString(), end_time: end.toISOString(),
        created_by: 'c1',
      });
    }
    const rangeLog: Array<[number, number]> = [];
    const supabase = createStubClient(tables, { golf_events: rangeLog });

    const busy = await getUserBusyPeriods(
      'u1', new Date('2026-06-01T00:00:00Z'), new Date('2026-09-01T00:00:00Z'), supabase,
    );

    expect(busy).toHaveLength(1200);
    // Two pages were walked: [0,999] then [1000,1999].
    expect(rangeLog.length).toBeGreaterThanOrEqual(2);
    expect(rangeLog[0]).toEqual([0, 999]);
    expect(rangeLog[1]).toEqual([1000, 1999]);
  });
});

describe('getUserBusyPeriods — class occurrences belong to ONE player', () => {
  // syncClassToCalendar writes each class meeting as a plain golf_events row on
  // the TEAM calendar (that is what puts classes on the calendar's "All" lens),
  // tagged `[class:<id>]` in the description and with no per-member column. The
  // team-event sweep therefore counted every player's class schedule as every
  // OTHER member's busy time — a coach filtering the calendar to their own
  // avatar saw the whole roster's classes (coach report, 2026-08-05).
  function classEvent(id: string, classId: string, title: string): Row {
    return {
      id,
      team_id: 't1',
      title,
      status: 'scheduled',
      start_time: '2026-06-10T18:30:00+00:00',
      end_time: '2026-06-10T19:30:00+00:00',
      created_by: null,
      description: `Instructor: Dr. Who\nCredits: 3\n[class:${classId}]`,
    };
  }

  /** Coach c1 (user u2) over org org1, which owns team t1. */
  function coachTables(): SeedTables {
    const tables = baseTables();
    tables.golf_coaches.push({ id: 'c1', user_id: 'u2', organization_id: 'org1' });
    tables.golf_teams.push({ id: 't1', organization_id: 'org1' });
    return tables;
  }

  const WINDOW: [Date, Date] = [
    new Date('2026-06-10T18:00:00Z'),
    new Date('2026-06-10T20:00:00Z'),
  ];

  it('keeps a player\'s class off the COACH\'s own busy calendar', async () => {
    const tables = coachTables();
    tables.golf_player_classes.push({ id: 'cls-p1', player_id: 'p1', class_name: 'Marketing Management' });
    tables.golf_events.push(
      classEvent('ev-class', 'cls-p1', 'BUS 324: Marketing Management'),
      // Control: a REAL team event must still count as the coach's busy time.
      { id: 'ev-team', team_id: 't1', title: 'Team Practice', status: 'scheduled',
        start_time: '2026-06-10T18:00:00+00:00', end_time: '2026-06-10T19:00:00+00:00',
        created_by: 'c1', description: 'Bring wedges' },
    );

    const busy = await getUserBusyPeriods('u2', WINDOW[0], WINDOW[1], createStubClient(tables));

    expect(busy.map((p) => p.title)).toEqual(['Team Practice']);
  });

  it('keeps a TEAMMATE\'s class off a player\'s busy calendar but keeps their own', async () => {
    const tables = baseTables();
    tables.golf_players.push({ id: 'p2', user_id: 'u2', first_name: 'Other', last_name: 'Player' });
    tables.golf_team_members.push({ team_id: 't1', player_id: 'p2', status: 'active' });
    tables.golf_player_classes.push(
      { id: 'cls-p1', player_id: 'p1', class_name: 'Marketing Management' },
      { id: 'cls-p2', player_id: 'p2', class_name: 'Econometrics' },
    );
    tables.golf_events.push(
      classEvent('ev-mine', 'cls-p1', 'BUS 324: Marketing Management'),
      classEvent('ev-theirs', 'cls-p2', 'ECON 350: Econometrics'),
    );

    const busy = await getUserBusyPeriods('u1', WINDOW[0], WINDOW[1], createStubClient(tables));

    expect(busy).toHaveLength(1);
    expect(busy[0]!.title).toBe('BUS 324: Marketing Management');
    // It is a class, not a team event — the overlay labels/colors on `type`.
    expect(busy[0]!.type).toBe('class');
  });

  it('drops a class occurrence whose class row is gone (orphan blocks nobody)', async () => {
    const tables = baseTables();
    tables.golf_events.push(classEvent('ev-orphan', 'cls-deleted', 'PHYS 101: Mechanics'));

    const busy = await getUserBusyPeriods('u1', WINDOW[0], WINDOW[1], createStubClient(tables));

    expect(busy).toHaveLength(0);
  });
});

describe('getUserBusyPeriods — unsynced classes expand within their term only', () => {
  // A class that never made it onto the calendar has to come from
  // golf_player_classes. `days` holds the SHORT codes the class UI writes
  // ('M', 'T', 'W', 'Th'), which the old expansion compared against full
  // lowercase weekday names — so it silently produced nothing.
  const MONDAY = new Date(2026, 8, 14); // 2026-09-14, inside Fall 2026
  const TUESDAY = new Date(2026, 8, 15);
  const THURSDAY = new Date(2026, 8, 17);

  function dayWindow(day: Date): [Date, Date] {
    const start = new Date(day); start.setHours(0, 0, 0, 0);
    const end = new Date(day); end.setHours(23, 59, 59, 999);
    return [start, end];
  }

  function classRow(over: Row = {}): Row {
    return {
      id: 'cls-1', player_id: 'p1', class_name: 'MATH 2415 - Calculus III',
      days: ['M', 'W', 'F'], start_time: '09:00', end_time: '10:15',
      semester: 'Fall 2026', ...over,
    };
  }

  it('expands a short-code meeting day the old full-name match missed', async () => {
    const tables = baseTables();
    tables.golf_player_classes.push(classRow());
    const [start, end] = dayWindow(MONDAY);

    const busy = await getUserBusyPeriods('u1', start, end, createStubClient(tables));

    expect(busy).toHaveLength(1);
    expect(busy[0]!.type).toBe('class');
    expect(busy[0]!.title).toBe('MATH 2415 - Calculus III');
    expect(busy[0]!.start.getHours()).toBe(9);
  });

  it("reads 'T' as Tuesday and 'Th' as Thursday, never both", async () => {
    const tables = baseTables();
    tables.golf_player_classes.push(classRow({ days: ['T'] }));
    const supabase = createStubClient(tables);

    const onTuesday = await getUserBusyPeriods('u1', ...dayWindow(TUESDAY), supabase);
    const onThursday = await getUserBusyPeriods('u1', ...dayWindow(THURSDAY), supabase);

    expect(onTuesday).toHaveLength(1);
    expect(onThursday).toHaveLength(0);
  });

  it('does not mark the player busy outside the class\'s term', async () => {
    const tables = baseTables();
    tables.golf_player_classes.push(classRow());
    // A Monday in July — Fall 2026 has not started. A weekly rule with no end
    // date would happily claim it.
    const [start, end] = dayWindow(new Date(2026, 6, 13));

    const busy = await getUserBusyPeriods('u1', start, end, createStubClient(tables));

    expect(busy).toHaveLength(0);
  });

  it('still expands a class whose term is unknown, within the query window', async () => {
    // REVERSED 2026-08-07, deliberately. This asserted `toHaveLength(0)` — that
    // an unreadable term expands to NOTHING rather than to a guess. The
    // reasoning was sound and the measurement behind it was missing: EVERY one
    // of the 43 golf_player_classes rows in production has `semester = NULL`,
    // so the refusal fired 100% of the time and class-conflict detection was
    // dead platform-wide. "Find a time" scheduled coaches straight over
    // players' lectures, silently.
    //
    // Expanding is bounded by the caller's own window (see the next test), so
    // the worst case is a finished class still reading as busy — visible and
    // correctable. A missed conflict is neither, and on a scheduling surface
    // that is the more expensive error.
    const tables = baseTables();
    tables.golf_player_classes.push(classRow({ semester: null }));
    const [start, end] = dayWindow(MONDAY);

    const busy = await getUserBusyPeriods('u1', start, end, createStubClient(tables));

    expect(busy).toHaveLength(1);
    expect(busy[0]?.type).toBe('class');
  });

  it('a term-less class is still bounded by the query window, not unbounded', async () => {
    // The guard the reversal above must not lose: no term means "use the
    // caller's window", never "walk forever". A window containing no meeting
    // day yields nothing.
    const tables = baseTables();
    // classRow() meets Monday/Wednesday; ask about a Sunday.
    const sunday = new Date(MONDAY); sunday.setDate(sunday.getDate() - 1);
    tables.golf_player_classes.push(classRow({ semester: null }));
    const [start, end] = dayWindow(sunday);

    const busy = await getUserBusyPeriods('u1', start, end, createStubClient(tables));

    expect(busy).toHaveLength(0);
  });

  it('does not double-count a class that already has synced calendar rows', async () => {
    const tables = baseTables();
    tables.golf_player_classes.push(classRow());
    const [start, end] = dayWindow(MONDAY);
    const synced = new Date(MONDAY); synced.setHours(9, 0, 0, 0);
    const syncedEnd = new Date(MONDAY); syncedEnd.setHours(10, 15, 0, 0);
    tables.golf_events.push({
      id: 'ev-1', team_id: 't1', title: 'MATH 2415: Calculus III', status: 'confirmed',
      start_time: synced.toISOString(), end_time: syncedEnd.toISOString(),
      created_by: null, description: 'Instructor: Dr. Who\n[class:cls-1]',
    });

    const busy = await getUserBusyPeriods('u1', start, end, createStubClient(tables));

    // One block, from the synced row — not a merged duplicate with a doubled title.
    expect(busy).toHaveLength(1);
    expect(busy[0]!.title).toBe('MATH 2415: Calculus III');
    expect(busy[0]!.eventId).toBe('ev-1');
  });
});

describe('checkEventConflicts — timed conflict across timezones', () => {
  it('flags an existing UTC-stored timed practice against an ET-proposed window', async () => {
    const tables = baseTables();
    tables.golf_events.push({
      id: 'e1', team_id: 't1', title: 'Team Practice', status: 'scheduled',
      start_time: '2026-06-10T18:30:00+00:00', end_time: '2026-06-10T19:30:00+00:00',
      created_by: 'c1',
    });
    const supabase = createStubClient(tables);

    // Coach proposes 2:00–4:00 PM ET on 2026-06-10 = 18:00–20:00Z (this is
    // exactly what checkScheduleConflicts builds via buildDateTimeString with
    // timezoneOffset 240).
    const proposedStart = new Date('2026-06-10T14:00-04:00');
    const proposedEnd = new Date('2026-06-10T16:00-04:00');

    const result = await checkEventConflicts(proposedStart, proposedEnd, ['p1'], supabase);

    expect(result.hasConflict).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.conflictingEvent.title).toBe('Team Practice');
  });

  it('does not flag a non-overlapping proposal and honors excludeEventId', async () => {
    const tables = baseTables();
    tables.golf_events.push({
      id: 'e1', team_id: 't1', title: 'Team Practice', status: 'scheduled',
      start_time: '2026-06-10T18:30:00+00:00', end_time: '2026-06-10T19:30:00+00:00',
      created_by: 'c1',
    });
    const supabase = createStubClient(tables);

    // Editing e1 itself must not self-conflict.
    const editingSelf = await checkEventConflicts(
      new Date('2026-06-10T18:00:00Z'),
      new Date('2026-06-10T20:00:00Z'),
      ['p1'],
      supabase,
      { excludeEventId: 'e1' },
    );
    expect(editingSelf.hasConflict).toBe(false);
  });
});

describe('periodsOverlap', () => {
  it('detects partial overlap and rejects touching-but-disjoint ranges', () => {
    const a = { start: new Date('2026-06-10T18:00:00Z'), end: new Date('2026-06-10T20:00:00Z') };
    expect(periodsOverlap(a, { start: new Date('2026-06-10T19:00:00Z'), end: new Date('2026-06-10T21:00:00Z') })).toBe(true);
    expect(periodsOverlap(a, { start: new Date('2026-06-10T20:00:00Z'), end: new Date('2026-06-10T21:00:00Z') })).toBe(false);
  });
});
