import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal chainable Supabase mock, keyed per-table with a FIFO queue so two
// different queries against the SAME table (golf_rounds is queried twice —
// once completed-only for the roster, once unfiltered for the header badge)
// can return two different canned results, in call order.
const mocks = vi.hoisted(() => ({
  tableQueue: {} as Record<string, Array<{ data: unknown; error: unknown }>>,
}));

function nextResult(table: string) {
  const queue = mocks.tableQueue[table];
  if (queue && queue.length > 0) return queue.shift()!;
  return { data: [], error: null };
}

function makeChain(table: string) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    not: () => chain,
    in: () => chain,
    gte: () => chain,
    order: () => chain,
    limit: () => chain,
    // fetchAllRowsResult-driven queries (team-detail.ts's CoachHelm cost30d
    // paginate-past-1000-cap fix) terminate on `.range(from, to)` instead of
    // `.then()` — mirror dashboard-data.test.ts's idiom (slice by the actual
    // from/to bounds) so a page shorter than the requested size correctly
    // ends the loop instead of throwing `range is not a function`.
    range: (from: number, to: number) => {
      const r = nextResult(table);
      return Promise.resolve({
        data: Array.isArray(r.data) ? r.data.slice(from, to + 1) : r.data,
        error: r.error,
      });
    },
    maybeSingle: () => Promise.resolve(nextResult(table)),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(nextResult(table)).then(resolve, reject),
  };
  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => makeChain(table) }),
}));

// resolveTeamUserIds has its own multi-table query shape unrelated to this
// bug fix — stub it so the daily-activity section's login lookup is a no-op.
vi.mock('@/lib/admin/data/team-scope', () => ({
  resolveTeamUserIds: () => Promise.resolve(new Set<string>()),
}));

import { buildDailyActivity, groupTeamErrorsByFingerprint, fetchTeamDetail } from '@/lib/admin/data/team-detail';

describe('buildDailyActivity', () => {
  const now = new Date('2026-07-02T12:00:00Z');

  it('pre-fills every day in the window with zeros', () => {
    const days = buildDailyActivity([], [], 3, now);
    expect(days).toEqual([
      { date: '2026-06-30', rounds: 0, logins: 0 },
      { date: '2026-07-01', rounds: 0, logins: 0 },
      { date: '2026-07-02', rounds: 0, logins: 0 },
    ]);
  });

  it('buckets round and login timestamps onto their day', () => {
    const days = buildDailyActivity(
      ['2026-07-01T08:00:00Z', '2026-07-01T20:00:00Z'],
      ['2026-07-02T01:00:00Z'],
      3,
      now,
    );
    const byDate = new Map(days.map((d) => [d.date, d]));
    expect(byDate.get('2026-07-01')?.rounds).toBe(2);
    expect(byDate.get('2026-07-02')?.logins).toBe(1);
    expect(byDate.get('2026-06-30')?.rounds).toBe(0);
  });

  it('drops timestamps outside the window instead of throwing', () => {
    const days = buildDailyActivity(['2026-01-01T00:00:00Z'], [], 3, now);
    expect(days.every((d) => d.rounds === 0)).toBe(true);
  });
});

describe('groupTeamErrorsByFingerprint', () => {
  it('groups by fingerprint and counts occurrences', () => {
    const clusters = groupTeamErrorsByFingerprint([
      { id: '1', created_at: '2026-07-01T00:00:00Z', title: 'Save failed', severity: 'error', fingerprint: 'fp-1' },
      { id: '2', created_at: '2026-07-01T01:00:00Z', title: 'Save failed', severity: 'error', fingerprint: 'fp-1' },
      { id: '3', created_at: '2026-07-01T02:00:00Z', title: 'Other', severity: 'critical', fingerprint: 'fp-2' },
    ]);
    expect(clusters).toHaveLength(2);
    const fp1 = clusters.find((c) => c.fingerprint === 'fp-1');
    expect(fp1?.occurrences).toBe(2);
    expect(fp1?.href).toBe('/admin/errors/fp-1');
  });

  it('treats a null fingerprint as its own singleton cluster keyed by row id', () => {
    const clusters = groupTeamErrorsByFingerprint([
      { id: '1', created_at: '2026-07-01T00:00:00Z', title: 'A', severity: 'error', fingerprint: null },
      { id: '2', created_at: '2026-07-01T00:00:00Z', title: 'B', severity: 'error', fingerprint: null },
    ]);
    expect(clusters).toHaveLength(2);
    expect(clusters.map((c) => c.fingerprint).sort()).toEqual(['row:1', 'row:2']);
  });

  it('sorts most-recent cluster first and uses the latest row for title/severity', () => {
    const clusters = groupTeamErrorsByFingerprint([
      { id: '1', created_at: '2026-07-01T00:00:00Z', title: 'Old title', severity: 'warning', fingerprint: 'fp-1' },
      { id: '2', created_at: '2026-07-02T00:00:00Z', title: 'New title', severity: 'critical', fingerprint: 'fp-1' },
      { id: '3', created_at: '2026-06-30T00:00:00Z', title: 'Other', severity: 'error', fingerprint: 'fp-2' },
    ]);
    expect(clusters[0]!.fingerprint).toBe('fp-1');
    expect(clusters[0]!.title).toBe('New title');
    expect(clusters[0]!.severity).toBe('critical');
    expect(clusters[0]!.lastSeen).toBe('2026-07-02T00:00:00Z');
  });

  it('returns an empty array for no rows', () => {
    expect(groupTeamErrorsByFingerprint([])).toEqual([]);
  });
});

describe('fetchTeamDetail — teamLastActivity (header health-badge parity with /admin/golf)', () => {
  beforeEach(() => {
    mocks.tableQueue = {};
  });

  function seedTeam() {
    mocks.tableQueue.golf_teams = [
      {
        data: {
          id: 'team-1', name: 'Rini U', gender: 'M', season: null, season_active: true,
          organization_id: null, join_code: 'ABC123', created_at: null,
        },
        error: null,
      },
    ];
    mocks.tableQueue.golf_team_coach_staff = [{ data: [], error: null }];
    mocks.tableQueue.golf_team_members = [{ data: [], error: null }];
    mocks.tableQueue.admin_events = [{ data: [], error: null }];
  }

  it('is sourced from the unfiltered latest golf_rounds row, independent of the roster reduce', async () => {
    seedTeam();
    // golf_rounds is queried twice, in this order: (1) roundsForTeam —
    // status=completed, feeds the roster table's per-player lastRoundAt;
    // (2) teamLastActivity — no status filter, no roster join.
    mocks.tableQueue.golf_rounds = [
      { data: [], error: null }, // (1) no completed rounds for the active roster
      { data: { created_at: '2026-07-01T09:00:00Z' }, error: null }, // (2) latest round overall
    ];

    const result = await fetchTeamDetail('team-1');

    expect(result.teamLastActivity).toBe('2026-07-01T09:00:00Z');
    // The old bug: with an empty roster, `roster.reduce(...)` collapses to
    // null (dormant) even though a round exists — teamLastActivity must not
    // do that.
    expect(result.roster).toEqual([]);
  });

  it('degrades to null (not a thrown error) when the query fails', async () => {
    seedTeam();
    mocks.tableQueue.golf_rounds = [
      { data: [], error: null },
      { data: null, error: { message: 'boom' } },
    ];

    const result = await fetchTeamDetail('team-1');
    expect(result.teamLastActivity).toBeNull();
  });
});
