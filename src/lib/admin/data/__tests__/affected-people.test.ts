import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression coverage for the PostgREST 1,000-row cap trap
 * (`.claude/rules/database.md`): `fetchAffectedPeopleForFingerprint` used to
 * ask for `.limit(IDENTITY_ROW_LIMIT = 2000)` in one request, which
 * PostgREST silently truncated to 1,000 — a fingerprint with more than 1,000
 * distinct identity rows under-reported "who" without any error. This test
 * drives a fake `admin_events` table with more than one page of rows and
 * asserts the fetch pages via `.range()` up to the 2,000-row TOTAL bound,
 * never in a single unbounded request.
 */

type EventRow = { user_id: string | null; user_email: string | null };

const mocks = vi.hoisted(() => ({
  rangeCalls: [] as Array<[number, number]>,
  eventRows: [] as EventRow[],
}));

function genericBuilder() {
  const result = { data: [], error: null };
  const b: Record<string, unknown> = {};
  for (const method of ['select', 'neq', 'eq', 'order', 'in']) {
    b[method] = (method === 'in' ? () => Promise.resolve(result) : () => b);
  }
  return b;
}

function pagedEventsBuilder() {
  // Mirrors the real call order in affected-people.ts: `.range()` is chained
  // BEFORE the terminal `.eq('fingerprint' | 'id', ...)`, matching the real
  // PostgREST builder — every method before the terminal one just narrows the
  // query synchronously; only the last call in the chain resolves.
  let pending: [number, number] = [0, 0];
  const b: Record<string, unknown> = {};
  for (const method of ['select', 'neq', 'order']) {
    b[method] = () => b;
  }
  b.range = (from: number, to: number) => {
    pending = [from, to];
    return b;
  };
  b.eq = () => {
    mocks.rangeCalls.push(pending);
    const [from, to] = pending;
    const page = mocks.eventRows.slice(from, to + 1);
    return Promise.resolve({ data: page, error: null });
  };
  return b;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => (table === 'admin_events' ? pagedEventsBuilder() : genericBuilder()),
  }),
}));

import { fetchAffectedPeopleForFingerprint } from '@/lib/admin/data/affected-people';

beforeEach(() => {
  mocks.rangeCalls = [];
  mocks.eventRows = [];
});

function rowsFor(n: number): EventRow[] {
  return Array.from({ length: n }, (_, i) => ({ user_id: `user-${i}`, user_email: null }));
}

describe('fetchAffectedPeopleForFingerprint — PostgREST row-cap pagination', () => {
  it('pages past 1,000 rows instead of silently truncating there', async () => {
    mocks.eventRows = rowsFor(1500);

    const { total, known } = await fetchAffectedPeopleForFingerprint('abc123');

    expect(known).toBe(true);
    expect(total).toBe(1500);
    // Two pages, each within the PostgREST cap.
    expect(mocks.rangeCalls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    for (const [from, to] of mocks.rangeCalls) {
      expect(to - from + 1).toBeLessThanOrEqual(1000);
    }
  });

  it('stops at the 2,000-row total bound even when more rows exist upstream', async () => {
    mocks.eventRows = rowsFor(5000);

    const { total } = await fetchAffectedPeopleForFingerprint('abc123');

    expect(total).toBe(2000);
    expect(mocks.rangeCalls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    // A third page reaching into row 2000+ would be the old silent-truncation
    // bug's mirror image — fetching unbounded cost instead of an unbounded
    // undercount. Neither is acceptable, so the loop must stop at exactly two
    // pages here.
    expect(mocks.rangeCalls.length).toBe(2);
  });

  it('stops short of 2,000 when the source has fewer rows (no phantom third page)', async () => {
    mocks.eventRows = rowsFor(250);

    const { total } = await fetchAffectedPeopleForFingerprint('abc123');

    expect(total).toBe(250);
    expect(mocks.rangeCalls).toEqual([[0, 999]]);
  });
});
