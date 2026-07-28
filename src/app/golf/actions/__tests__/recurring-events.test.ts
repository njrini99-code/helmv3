/**
 * Unit suite for recurring-event server actions (2026-06-10 calendar audit).
 *
 * Covers the two P0 fixes plus the P2 expressiveness layer:
 *   - P0 #1 root-delete cascade wipe → root promotion (children repointed,
 *     rule transferred, no orphans, promote-before-delete ordering)
 *   - P0 #2 series-edit date collapse → per-row deltas; title-only edits
 *     never touch date columns
 *   - P2: multi-weekday create, series extension via a new rule, caps
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

// ---------------------------------------------------------------------------
// Mocks — the fake client is swapped per test via `fake`
// ---------------------------------------------------------------------------

let fake: FakeSupabase;

// The notify fan-outs run via next/server's after(), which throws outside a
// request scope — collect callbacks instead (same idiom as
// golf-events.test.ts) so the actions succeed and fan-outs stay testable.
let afterCallbacks: Array<() => Promise<void> | void> = [];

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('next/server', () => ({
  after: vi.fn((cb: () => Promise<void> | void) => {
    afterCallbacks.push(cb);
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));

vi.mock('@/lib/golf/resolve-team', () => ({
  resolveCoachTeamId: vi.fn(async () => 'team-1'),
}));

// The action now resolves the coach's team via the cookie-aware wrapper
// (program-head team switcher) — same stub, new import path.
vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1'),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  createRecurringEvent,
  editRecurringEvent,
  deleteRecurringEvent,
} from '../recurring-events';
import { MAX_SERIES_OCCURRENCES } from '@/lib/golf/recurrence';

type Row = Record<string, unknown>;
type RowFilter = (row: Row) => boolean;

// ---------------------------------------------------------------------------
// Fake-supabase augmentation: the production code uses PostgREST `.or()` on
// reads and `.or()/.gte()/.neq()` on writes, which the shared fixture does
// not implement. Patch the builder prototypes (runtime-visible despite the
// TS-private fields) so series filters behave like PostgREST.
// ---------------------------------------------------------------------------

function orFilter(expr: string): RowFilter {
  const clauses = expr.split(',').map((clause): RowFilter => {
    const firstDot = clause.indexOf('.');
    const secondDot = clause.indexOf('.', firstDot + 1);
    if (firstDot < 0 || secondDot < 0) throw new Error(`fake .or(): cannot parse "${clause}"`);
    const col = clause.slice(0, firstDot);
    const op = clause.slice(firstDot + 1, secondDot);
    const value = clause.slice(secondDot + 1);
    if (op !== 'eq') throw new Error(`fake .or(): unsupported operator "${op}"`);
    return (row) => row[col] === value;
  });
  return (row) => clauses.some((clause) => clause(row));
}

interface PatchableQuery {
  state: { filters: RowFilter[] };
}
interface PatchableWrite {
  filters: RowFilter[];
}

function patchFakeBuilders(client: FakeSupabase): void {
  const queryProto = Object.getPrototypeOf(client.from('golf_events').select('*')) as Record<
    string,
    unknown
  >;
  queryProto.or = function (this: PatchableQuery, expr: string) {
    this.state.filters.push(orFilter(expr));
    return this;
  };

  const writeProto = Object.getPrototypeOf(client.from('golf_events').update({})) as Record<
    string,
    unknown
  >;
  writeProto.or = function (this: PatchableWrite, expr: string) {
    this.filters.push(orFilter(expr));
    return this;
  };
  writeProto.gte = function (this: PatchableWrite, col: string, value: unknown) {
    this.filters.push((row) => String(row[col] ?? '') >= String(value));
    return this;
  };
  writeProto.neq = function (this: PatchableWrite, col: string, value: unknown) {
    this.filters.push((row) => row[col] !== value);
    return this;
  };
}

// ---------------------------------------------------------------------------
// Seed data
//
// team-1: coach-1 (user u-coach) owns a 3-occurrence weekly series:
//   ev-root (Jun 1, holds the rule) ← ev-c2 (Jun 8) + ev-c3 (Jun 15).
// All times stored UTC; tests pass timezoneOffset: 0 so expectations are
// machine-timezone independent.
// ---------------------------------------------------------------------------

const RULE = 'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=3';

function eventRow(overrides: Row): Row {
  return {
    team_id: 'team-1',
    created_by: 'coach-1',
    title: 'Practice',
    event_type: 'practice',
    description: null,
    location: null,
    status: 'confirmed',
    requires_rsvp: false,
    rsvp_deadline: null,
    max_attendees: null,
    recurrence_rule: null,
    parent_event_id: null,
    ...overrides,
  };
}

function seriesTables(): Record<string, Row[]> {
  return {
    golf_coaches: [
      { id: 'coach-1', user_id: 'u-coach', organization_id: 'org-1' },
      { id: 'coach-2', user_id: 'u-other', organization_id: 'org-2' },
    ],
    golf_events: [
      eventRow({
        id: 'ev-root',
        start_time: '2026-06-01T14:00:00+00:00',
        end_time: '2026-06-01T15:00:00+00:00',
        recurrence_rule: RULE,
      }),
      eventRow({
        id: 'ev-c2',
        start_time: '2026-06-08T14:00:00+00:00',
        end_time: '2026-06-08T15:00:00+00:00',
        parent_event_id: 'ev-root',
      }),
      eventRow({
        id: 'ev-c3',
        start_time: '2026-06-15T14:00:00+00:00',
        end_time: '2026-06-15T15:00:00+00:00',
        parent_event_id: 'ev-root',
      }),
    ],
  };
}

let tables: Record<string, Row[]>;

function seed(userId: string, seedTables: Record<string, Row[]> = seriesTables()): void {
  tables = seedTables;
  fake = createFakeSupabase({ user: { id: userId }, tables });
  patchFakeBuilders(fake);
}

function events(): Row[] {
  return tables.golf_events ?? [];
}

function eventById(id: string): Row | undefined {
  return events().find((row) => row.id === id);
}

/** Every surviving parent_event_id must point at a surviving row. */
function expectNoOrphans(): void {
  const ids = new Set(events().map((row) => row.id));
  for (const row of events()) {
    if (row.parent_event_id !== null) {
      expect(ids.has(row.parent_event_id)).toBe(true);
    }
  }
}

/** Record every golf_events UPDATE payload (for "dates untouched" asserts). */
function spyOnUpdatePayloads(): Row[] {
  const payloads: Row[] = [];
  const origFrom = fake.from.bind(fake);
  fake.from = ((table: string) => {
    const api = origFrom(table);
    if (table !== 'golf_events') return api;
    return {
      ...api,
      update(payload: Row) {
        payloads.push(payload);
        return api.update(payload);
      },
    };
  }) as typeof fake.from;
  return payloads;
}

interface FailingResult {
  data: null;
  error: { message: string };
}
interface FailingBuilder extends PromiseLike<FailingResult> {
  eq: (...args: unknown[]) => FailingBuilder;
  neq: (...args: unknown[]) => FailingBuilder;
  in: (...args: unknown[]) => FailingBuilder;
  gte: (...args: unknown[]) => FailingBuilder;
  or: (...args: unknown[]) => FailingBuilder;
  select: (...args: unknown[]) => FailingBuilder;
  single: () => Promise<FailingResult>;
  maybeSingle: () => Promise<FailingResult>;
}

function makeFailingBuilder(message: string): FailingBuilder {
  const result: FailingResult = { data: null, error: { message } };
  const builder: FailingBuilder = {
    eq: () => builder,
    neq: () => builder,
    in: () => builder,
    gte: () => builder,
    or: () => builder,
    select: () => builder,
    single: async () => result,
    maybeSingle: async () => result,
    then: (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected),
  };
  return builder;
}

/** Make every golf_events UPDATE fail — simulates a crash during promotion. */
function failUpdates(): void {
  const origFrom = fake.from.bind(fake);
  fake.from = ((table: string) => {
    const api = origFrom(table);
    if (table !== 'golf_events') return api;
    return {
      ...api,
      update: () => makeFailingBuilder('update boom'),
    };
  }) as typeof fake.from;
}

/** Make the Nth golf_events INSERT fail — exercises create rollback. */
function failNthInsert(n: number): void {
  let count = 0;
  const origFrom = fake.from.bind(fake);
  fake.from = ((table: string) => {
    const api = origFrom(table);
    if (table !== 'golf_events') return api;
    return {
      ...api,
      insert(payload: unknown) {
        count += 1;
        if (count === n) return makeFailingBuilder('insert boom');
        return api.insert(payload);
      },
    };
  }) as typeof fake.from;
}

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks = [];
  seed('u-coach');
});

// ===========================================================================
// deleteRecurringEvent — root promotion (P0 #1)
// ===========================================================================

describe('deleteRecurringEvent — root promotion', () => {
  it("scope 'this' on the ROOT promotes the earliest child instead of cascade-wiping (2-arg form)", async () => {
    const result = await deleteRecurringEvent('ev-root', 'this');

    expect(result.success).toBe(true);
    expect(eventById('ev-root')).toBeUndefined();

    // Earliest child became the new root and inherited the rule.
    const newRoot = eventById('ev-c2');
    expect(newRoot?.recurrence_rule).toBe(RULE);
    expect(newRoot?.parent_event_id).toBeNull();

    // Remaining sibling repointed at the new root.
    expect(eventById('ev-c3')?.parent_event_id).toBe('ev-c2');
    expect(events()).toHaveLength(2);
    expectNoOrphans();
  });

  it('3-arg legacy call form behaves identically', async () => {
    const result = await deleteRecurringEvent('ev-root', '2026-06-01', 'this');

    expect(result.success).toBe(true);
    expect(eventById('ev-root')).toBeUndefined();
    expect(eventById('ev-c2')?.recurrence_rule).toBe(RULE);
    expect(eventById('ev-c2')?.parent_event_id).toBeNull();
    expect(eventById('ev-c3')?.parent_event_id).toBe('ev-c2');
    expectNoOrphans();
  });

  it("scope 'this' on a CHILD plain-deletes without touching the series", async () => {
    const result = await deleteRecurringEvent('ev-c2', 'this');

    expect(result.success).toBe(true);
    expect(eventById('ev-c2')).toBeUndefined();
    expect(eventById('ev-root')?.recurrence_rule).toBe(RULE);
    expect(eventById('ev-c3')?.parent_event_id).toBe('ev-root');
    expect(events()).toHaveLength(2);
  });

  it("scope 'this' on a childless root plain-deletes", async () => {
    seed('u-coach', {
      golf_coaches: [{ id: 'coach-1', user_id: 'u-coach', organization_id: 'org-1' }],
      golf_events: [
        eventRow({
          id: 'ev-solo',
          start_time: '2026-06-01T14:00:00+00:00',
          end_time: null,
          recurrence_rule: RULE,
        }),
      ],
    });

    const result = await deleteRecurringEvent('ev-solo', 'this');
    expect(result.success).toBe(true);
    expect(events()).toHaveLength(0);
  });

  it('aborts BEFORE deleting when promotion fails — series never left headless', async () => {
    failUpdates();
    const result = await deleteRecurringEvent('ev-root', 'this');

    expect(result.success).toBe(false);
    // Nothing was deleted, nothing was repointed: promote-first ordering.
    expect(events()).toHaveLength(3);
    expect(eventById('ev-root')?.recurrence_rule).toBe(RULE);
    expect(eventById('ev-c2')?.parent_event_id).toBe('ev-root');
    expect(eventById('ev-c3')?.parent_event_id).toBe('ev-root');
  });

  it("'thisAndFuture' from a child deletes forward and keeps the root", async () => {
    const result = await deleteRecurringEvent('ev-c2', '2026-06-08', 'thisAndFuture');

    expect(result.success).toBe(true);
    expect(events().map((row) => row.id)).toEqual(['ev-root']);
    expect(eventById('ev-root')?.recurrence_rule).toBe(RULE);
  });

  it("'thisAndFuture' 2-arg form derives the cutoff from the target's own start", async () => {
    const result = await deleteRecurringEvent('ev-c2', 'thisAndFuture');

    expect(result.success).toBe(true);
    expect(events().map((row) => row.id)).toEqual(['ev-root']);
  });

  it("'thisAndFuture' that catches a rescheduled-late ROOT promotes an earlier child first", async () => {
    // Root was moved to Jun 20 by a single-occurrence edit; children sit earlier.
    seed('u-coach', {
      golf_coaches: [{ id: 'coach-1', user_id: 'u-coach', organization_id: 'org-1' }],
      golf_events: [
        eventRow({
          id: 'ev-root',
          start_time: '2026-06-20T14:00:00+00:00',
          end_time: '2026-06-20T15:00:00+00:00',
          recurrence_rule: RULE,
        }),
        eventRow({
          id: 'ev-c1',
          start_time: '2026-06-01T14:00:00+00:00',
          end_time: '2026-06-01T15:00:00+00:00',
          parent_event_id: 'ev-root',
        }),
        eventRow({
          id: 'ev-c2',
          start_time: '2026-06-08T14:00:00+00:00',
          end_time: '2026-06-08T15:00:00+00:00',
          parent_event_id: 'ev-root',
        }),
      ],
    });

    const result = await deleteRecurringEvent('ev-root', '2026-06-10', 'thisAndFuture');

    expect(result.success).toBe(true);
    expect(eventById('ev-root')).toBeUndefined();
    expect(eventById('ev-c1')?.recurrence_rule).toBe(RULE);
    expect(eventById('ev-c1')?.parent_event_id).toBeNull();
    expect(eventById('ev-c2')?.parent_event_id).toBe('ev-c1');
    expectNoOrphans();
  });

  it("'thisAndFuture' spanning the whole series deletes everything", async () => {
    const result = await deleteRecurringEvent('ev-root', '2026-01-01', 'thisAndFuture');

    expect(result.success).toBe(true);
    expect(events()).toHaveLength(0);
  });

  it("scope 'all' deletes the entire series from any member", async () => {
    const result = await deleteRecurringEvent('ev-c2', 'all');

    expect(result.success).toBe(true);
    expect(events()).toHaveLength(0);
  });

  it('rejects a 2-arg call whose second argument is not a scope', async () => {
    const result = await deleteRecurringEvent('ev-root', '2026-06-01');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid delete scope');
    expect(events()).toHaveLength(3);
  });

  it('requires authentication', async () => {
    fake = createFakeSupabase({ user: null, tables });
    const result = await deleteRecurringEvent('ev-root', 'this');
    expect(result).toEqual({ success: false, error: 'Not authenticated' });
  });

  it('rejects a coach who does not own the event', async () => {
    seed('u-other');
    const result = await deleteRecurringEvent('ev-root', 'this');
    expect(result).toEqual({ success: false, error: 'Not authorized' });
    expect(events()).toHaveLength(3);
  });

  it('returns an error for an unknown event', async () => {
    const result = await deleteRecurringEvent('nope', 'this');
    expect(result).toEqual({ success: false, error: 'Event not found' });
  });
});

// ===========================================================================
// editRecurringEvent — per-row deltas (P0 #2)
// ===========================================================================

describe('editRecurringEvent — per-row date deltas', () => {
  it("scope 'all' +2h shifts every occurrence by the delta, preserving each row's date", async () => {
    const result = await editRecurringEvent({
      eventId: 'ev-root',
      originalStartDate: '2026-06-01',
      scope: 'all',
      timezoneOffset: 0,
      updates: {
        title: 'Practice',
        startDate: '2026-06-01',
        startTime: '16:00',
        endDate: '2026-06-01',
        endTime: '17:00',
      },
    });

    expect(result.success).toBe(true);
    const expected: Array<[string, string, string]> = [
      ['ev-root', '2026-06-01T16:00:00Z', '2026-06-01T17:00:00Z'],
      ['ev-c2', '2026-06-08T16:00:00Z', '2026-06-08T17:00:00Z'],
      ['ev-c3', '2026-06-15T16:00:00Z', '2026-06-15T17:00:00Z'],
    ];
    for (const [id, start, end] of expected) {
      const row = eventById(id);
      expect(Date.parse(String(row?.start_time))).toBe(Date.parse(start));
      expect(Date.parse(String(row?.end_time))).toBe(Date.parse(end));
    }
  });

  it('title-only edit never touches date columns', async () => {
    const payloads = spyOnUpdatePayloads();
    const result = await editRecurringEvent({
      eventId: 'ev-root',
      originalStartDate: '2026-06-01',
      scope: 'all',
      timezoneOffset: 0,
      updates: {
        title: 'Renamed Practice',
        // Callers always re-send the (unchanged) schedule.
        startDate: '2026-06-01',
        startTime: '14:00',
        endDate: '2026-06-01',
        endTime: '15:00',
      },
    });

    expect(result.success).toBe(true);
    expect(payloads.length).toBeGreaterThan(0);
    for (const payload of payloads) {
      expect(payload).not.toHaveProperty('start_time');
      expect(payload).not.toHaveProperty('end_time');
    }
    // No date collapse: every occurrence keeps its own stored timestamp.
    expect(eventById('ev-root')?.start_time).toBe('2026-06-01T14:00:00+00:00');
    expect(eventById('ev-c2')?.start_time).toBe('2026-06-08T14:00:00+00:00');
    expect(eventById('ev-c3')?.start_time).toBe('2026-06-15T14:00:00+00:00');
    for (const id of ['ev-root', 'ev-c2', 'ev-c3']) {
      expect(eventById(id)?.title).toBe('Renamed Practice');
    }
  });

  it("scope 'thisAndFuture' shifts only the target occurrence and later ones", async () => {
    const result = await editRecurringEvent({
      eventId: 'ev-c2',
      originalStartDate: '2026-06-08',
      scope: 'thisAndFuture',
      timezoneOffset: 0,
      updates: { startDate: '2026-06-08', startTime: '16:00' },
    });

    expect(result.success).toBe(true);
    expect(eventById('ev-root')?.start_time).toBe('2026-06-01T14:00:00+00:00');
    expect(Date.parse(String(eventById('ev-c2')?.start_time))).toBe(
      Date.parse('2026-06-08T16:00:00Z'),
    );
    expect(Date.parse(String(eventById('ev-c3')?.start_time))).toBe(
      Date.parse('2026-06-15T16:00:00Z'),
    );
    // Ends shift by the same delta when only the start moved.
    expect(Date.parse(String(eventById('ev-c3')?.end_time))).toBe(
      Date.parse('2026-06-15T17:00:00Z'),
    );
  });

  it("scope 'this' updates only the single occurrence", async () => {
    const result = await editRecurringEvent({
      eventId: 'ev-c2',
      originalStartDate: '2026-06-08',
      scope: 'this',
      timezoneOffset: 0,
      updates: { startDate: '2026-06-08', startTime: '16:00' },
    });

    expect(result.success).toBe(true);
    expect(Date.parse(String(eventById('ev-c2')?.start_time))).toBe(
      Date.parse('2026-06-08T16:00:00Z'),
    );
    expect(eventById('ev-root')?.start_time).toBe('2026-06-01T14:00:00+00:00');
    expect(eventById('ev-c3')?.start_time).toBe('2026-06-15T14:00:00+00:00');
  });

  it('rejects a coach who does not own the event', async () => {
    seed('u-other');
    const result = await editRecurringEvent({
      eventId: 'ev-root',
      originalStartDate: '2026-06-01',
      scope: 'all',
      updates: { title: 'Hijacked' },
    });
    expect(result).toEqual({ success: false, error: 'Not authorized' });
    expect(eventById('ev-root')?.title).toBe('Practice');
  });

  // -------------------------------------------------------------------------
  // `golf_events_end_after_start` CHECK (end_time IS NULL OR start_time IS NULL
  // OR end_time >= start_time). Moving a 14:00–15:00 occurrence to 16:00 while
  // leaving end_time at 15:00 is rejected outright with SQLSTATE 23514 — and
  // Postgres rejects it EVERY time, which is why the two production attempts 30
  // seconds apart on 2026-07-27 both failed. The fake client below does not
  // enforce check constraints, so only these payload assertions can catch it.
  //
  // 'thisAndFuture' and 'all' already carried the end with the start; 'this'
  // did not, so the same drag succeeded or failed depending on which scope the
  // coach picked.
  // -------------------------------------------------------------------------
  describe('end_time never lands before start_time', () => {
    const invariant = (row: Row | undefined) => {
      const start = Date.parse(String(row?.start_time));
      const end = Date.parse(String(row?.end_time));
      expect(Number.isFinite(start)).toBe(true);
      expect(Number.isFinite(end)).toBe(true);
      expect(end).toBeGreaterThanOrEqual(start);
    };

    it("scope 'this' carries the end forward when only the start time moves", async () => {
      const result = await editRecurringEvent({
        eventId: 'ev-c2',
        originalStartDate: '2026-06-08',
        scope: 'this',
        timezoneOffset: 0,
        updates: { startDate: '2026-06-08', startTime: '16:00' },
      });

      expect(result.success).toBe(true);
      const row = eventById('ev-c2');
      invariant(row);
      // The occurrence keeps its one-hour duration: 16:00 → 17:00.
      expect(Date.parse(String(row?.end_time))).toBe(Date.parse('2026-06-08T17:00:00Z'));
      // Siblings are untouched.
      expect(eventById('ev-c3')?.start_time).toBe('2026-06-15T14:00:00+00:00');
      expect(eventById('ev-c3')?.end_time).toBe('2026-06-15T15:00:00+00:00');
    });

    it("scope 'this' still honours an explicit end time over the carried one", async () => {
      const result = await editRecurringEvent({
        eventId: 'ev-c2',
        originalStartDate: '2026-06-08',
        scope: 'this',
        timezoneOffset: 0,
        updates: { startDate: '2026-06-08', startTime: '16:00', endTime: '18:30' },
      });

      expect(result.success).toBe(true);
      const row = eventById('ev-c2');
      invariant(row);
      expect(Date.parse(String(row?.end_time))).toBe(Date.parse('2026-06-08T18:30:00Z'));
    });

    it("scope 'this' does not touch end_time when the start does not move", async () => {
      const payloads = spyOnUpdatePayloads();
      const result = await editRecurringEvent({
        eventId: 'ev-c2',
        originalStartDate: '2026-06-08',
        scope: 'this',
        timezoneOffset: 0,
        updates: { title: 'Short game' },
      });

      expect(result.success).toBe(true);
      expect(payloads.every((p) => !('end_time' in p))).toBe(true);
      expect(eventById('ev-c2')?.end_time).toBe('2026-06-08T15:00:00+00:00');
    });

    it('holds for every scope on the same forward drag', async () => {
      for (const scope of ['this', 'thisAndFuture', 'all'] as const) {
        seed('u-coach');
        const result = await editRecurringEvent({
          eventId: 'ev-c2',
          originalStartDate: '2026-06-08',
          scope,
          timezoneOffset: 0,
          updates: { startDate: '2026-06-08', startTime: '16:00' },
        });
        expect(result.success, scope).toBe(true);
        invariant(eventById('ev-c2'));
      }
    });
  });
});

// ===========================================================================
// editRecurringEvent — series rule update + extension (P2 d)
// ===========================================================================

describe('editRecurringEvent — series extension', () => {
  it("scope 'all' with a longer rule appends the missing occurrences and stores the canonical rule", async () => {
    const result = await editRecurringEvent({
      eventId: 'ev-root',
      originalStartDate: '2026-06-01',
      scope: 'all',
      timezoneOffset: 0,
      updates: { recurrenceRule: 'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=5' },
    });

    expect(result.success).toBe(true);
    expect(events()).toHaveLength(5);
    expect(eventById('ev-root')?.recurrence_rule).toBe('RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=5');

    const appended = events()
      .filter((row) => !['ev-root', 'ev-c2', 'ev-c3'].includes(String(row.id)))
      .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
    expect(appended).toHaveLength(2);
    expect(Date.parse(String(appended[0]?.start_time))).toBe(Date.parse('2026-06-22T14:00:00Z'));
    expect(Date.parse(String(appended[1]?.start_time))).toBe(Date.parse('2026-06-29T14:00:00Z'));
    for (const row of appended) {
      expect(row.parent_event_id).toBe('ev-root');
      expect(row.recurrence_rule).toBeNull();
      expect(row.title).toBe('Practice');
    }
    // Existing occurrences untouched.
    expect(eventById('ev-c2')?.start_time).toBe('2026-06-08T14:00:00+00:00');
    expect(eventById('ev-c3')?.start_time).toBe('2026-06-15T14:00:00+00:00');
  });

  it('extension respects the MAX_SERIES_OCCURRENCES cap', async () => {
    // 2-row daily series → capacity is MAX−2, and a runaway daily rule has
    // more than enough future dates to hit it exactly.
    seed('u-coach', {
      golf_coaches: [{ id: 'coach-1', user_id: 'u-coach', organization_id: 'org-1' }],
      golf_events: [
        eventRow({
          id: 'ev-root',
          start_time: '2026-06-01T14:00:00+00:00',
          end_time: '2026-06-01T15:00:00+00:00',
          recurrence_rule: 'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2',
        }),
        eventRow({
          id: 'ev-c2',
          start_time: '2026-06-02T14:00:00+00:00',
          end_time: '2026-06-02T15:00:00+00:00',
          parent_event_id: 'ev-root',
        }),
      ],
    });

    const result = await editRecurringEvent({
      eventId: 'ev-root',
      originalStartDate: '2026-06-01',
      scope: 'all',
      timezoneOffset: 0,
      updates: { recurrenceRule: 'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=9999' },
    });

    expect(result.success).toBe(true);
    expect(events()).toHaveLength(MAX_SERIES_OCCURRENCES);
  });

  it('rejects an unparseable rule', async () => {
    const result = await editRecurringEvent({
      eventId: 'ev-root',
      originalStartDate: '2026-06-01',
      scope: 'all',
      timezoneOffset: 0,
      updates: { recurrenceRule: 'garbage' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid recurrence rule');
    expect(events()).toHaveLength(3);
  });
});

// ===========================================================================
// createRecurringEvent — transactional generation
// ===========================================================================

describe('createRecurringEvent', () => {
  it('creates a root + children series with parent links', async () => {
    seed('u-coach', {
      golf_coaches: [{ id: 'coach-1', user_id: 'u-coach', organization_id: 'org-1' }],
      golf_events: [],
    });

    const result = await createRecurringEvent({
      title: 'Lifting',
      eventType: 'training',
      startDate: '2026-06-01',
      startTime: '09:00',
      endTime: '10:00',
      recurrenceRule: 'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=3',
      timezoneOffset: 0,
    });

    expect(result.success).toBe(true);
    expect(events()).toHaveLength(3);

    const roots = events().filter((row) => row.recurrence_rule !== null);
    expect(roots).toHaveLength(1);
    const root = roots[0]!;
    expect(root.parent_event_id).toBeNull();
    expect(root.id).toBe(result.data?.eventId);
    expect(Date.parse(String(root.start_time))).toBe(Date.parse('2026-06-01T09:00:00Z'));

    const children = events().filter((row) => row.recurrence_rule === null);
    expect(children).toHaveLength(2);
    const childStarts = children.map((row) => Date.parse(String(row.start_time))).sort((a, b) => a - b);
    expect(childStarts).toEqual([
      Date.parse('2026-06-08T09:00:00Z'),
      Date.parse('2026-06-15T09:00:00Z'),
    ]);
    for (const child of children) {
      expect(child.parent_event_id).toBe(root.id);
    }
  });

  it('expands a Mon/Wed/Fri multi-weekday rule across a month boundary', async () => {
    seed('u-coach', {
      golf_coaches: [{ id: 'coach-1', user_id: 'u-coach', organization_id: 'org-1' }],
      golf_events: [],
    });

    const result = await createRecurringEvent({
      title: 'Short game',
      eventType: 'practice',
      startDate: '2026-06-29', // Monday
      startTime: '09:00',
      recurrenceRule: 'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR;COUNT=6',
      timezoneOffset: 0,
    });

    expect(result.success).toBe(true);
    const starts = events()
      .map((row) => String(row.start_time).slice(0, 10))
      .sort();
    expect(starts).toEqual([
      '2026-06-29',
      '2026-07-01',
      '2026-07-03',
      '2026-07-06',
      '2026-07-08',
      '2026-07-10',
    ]);
  });

  it('rolls back the root when the child insert fails (no half-built series)', async () => {
    seed('u-coach', {
      golf_coaches: [{ id: 'coach-1', user_id: 'u-coach', organization_id: 'org-1' }],
      golf_events: [],
    });
    failNthInsert(2); // first insert = root, second = children

    const result = await createRecurringEvent({
      title: 'Lifting',
      eventType: 'training',
      startDate: '2026-06-01',
      startTime: '09:00',
      recurrenceRule: 'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=3',
      timezoneOffset: 0,
    });

    expect(result.success).toBe(false);
    expect(events()).toHaveLength(0);
  });

  it('rejects an invalid recurrence rule', async () => {
    seed('u-coach', {
      golf_coaches: [{ id: 'coach-1', user_id: 'u-coach', organization_id: 'org-1' }],
      golf_events: [],
    });

    const result = await createRecurringEvent({
      title: 'Lifting',
      eventType: 'training',
      startDate: '2026-06-01',
      recurrenceRule: 'RRULE:NOPE',
      timezoneOffset: 0,
    });

    expect(result).toEqual({ success: false, error: 'Invalid recurrence rule' });
    expect(events()).toHaveLength(0);
  });
});
