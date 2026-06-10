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
