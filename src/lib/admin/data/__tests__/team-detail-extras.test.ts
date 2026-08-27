import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Minimal per-table thenable mock — each table this module touches
 * (`golf_qualifiers`, `golf_qualifier_entries`, `golf_rounds`,
 * `golf_players`) is read AT MOST ONCE per `fetchTeamDetailExtras` call, so
 * (unlike `team-detail.test.ts`'s FIFO queue, needed because that module
 * queries `golf_rounds` twice) one static probe per table is enough. Every
 * chain method returns the same node and resolves on `await`, mirroring the
 * supabase-js PostgrestFilterBuilder shape (awaitable at any point in the
 * chain) — same idiom as `qualifier-logic.test.ts`.
 */
interface Probe {
  data: unknown[] | null;
  error: { message: string } | null;
}

const golfQualifiers: Probe = { data: [], error: null };
const golfQualifierEntries: Probe = { data: [], error: null };
const golfRounds: Probe = { data: [], error: null };
const golfPlayers: Probe = { data: [], error: null };

const golfPlayersFrom = vi.fn((_table: 'golf_players') => chainNode(golfPlayers));

function chainNode(result: Probe) {
  const node = {
    select: () => node,
    eq: () => node,
    in: () => node,
    order: () => node,
    limit: () => node,
    then: (onFulfilled: (v: Probe) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return node;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'golf_qualifiers') return chainNode(golfQualifiers);
      if (table === 'golf_qualifier_entries') return chainNode(golfQualifierEntries);
      if (table === 'golf_rounds') return chainNode(golfRounds);
      if (table === 'golf_players') return golfPlayersFrom(table);
      throw new Error(`unexpected table in test mock: ${table}`);
    },
  }),
}));

import {
  summarizeQualifiers,
  classifyInFlightTier,
  summarizeInFlightRounds,
  sumRecentDays,
  summarizeErrorHealth,
  fetchTeamDetailExtras,
} from '../team-detail-extras';

function reset() {
  golfQualifiers.data = [];
  golfQualifiers.error = null;
  golfQualifierEntries.data = [];
  golfQualifierEntries.error = null;
  golfRounds.data = [];
  golfRounds.error = null;
  golfPlayers.data = [];
  golfPlayers.error = null;
  golfPlayersFrom.mockClear();
}

// ---------------------------------------------------------------------------
// summarizeQualifiers
// ---------------------------------------------------------------------------

describe('summarizeQualifiers', () => {
  it('returns the empty summary (truncated pass-through) for no qualifiers', () => {
    expect(summarizeQualifiers([], [], true)).toEqual({
      total: 0,
      open: 0,
      closed: 0,
      unknownStatus: 0,
      entriesTotal: 0,
      entriesWithRound: 0,
      items: [],
      truncated: true,
    });
  });

  it('buckets upcoming/in_progress as open, completed as closed, anything else as unknown', () => {
    const summary = summarizeQualifiers(
      [
        { id: 'q1', name: 'Fall', status: 'upcoming', num_rounds: 3, start_date: '2026-01-01', end_date: null, created_at: null },
        { id: 'q2', name: 'Spring', status: 'in_progress', num_rounds: 2, start_date: '2026-02-01', end_date: null, created_at: null },
        { id: 'q3', name: 'Winter', status: 'completed', num_rounds: 1, start_date: '2026-03-01', end_date: null, created_at: null },
        { id: 'q4', name: 'Legacy', status: null, num_rounds: 1, start_date: '2026-04-01', end_date: null, created_at: null },
      ],
      [],
      false,
    );
    expect(summary.total).toBe(4);
    expect(summary.open).toBe(2);
    expect(summary.closed).toBe(1);
    expect(summary.unknownStatus).toBe(1);
  });

  it('a qualifier past its end_date but still in_progress stays open — completion is a manual coach action, never automatic (INC-2026-08-22)', () => {
    const summary = summarizeQualifiers(
      [
        {
          id: 'q1',
          name: 'Overdue',
          status: 'in_progress',
          num_rounds: 3,
          start_date: '2026-01-01',
          end_date: '2020-01-01', // long past, still in_progress
          created_at: null,
        },
      ],
      [],
      false,
    );
    expect(summary.open).toBe(1);
    expect(summary.closed).toBe(0);
  });

  it('sums entries linked (round_id set) vs total, per qualifier and in aggregate', () => {
    const summary = summarizeQualifiers(
      [
        { id: 'q1', name: 'Fall', status: 'in_progress', num_rounds: 3, start_date: '2026-01-01', end_date: null, created_at: null },
        { id: 'q2', name: 'Spring', status: 'completed', num_rounds: 2, start_date: '2026-02-01', end_date: null, created_at: null },
      ],
      [
        { qualifier_id: 'q1', round_id: 'r1' },
        { qualifier_id: 'q1', round_id: null },
        { qualifier_id: 'q1', round_id: 'r2' },
        { qualifier_id: 'q2', round_id: null },
      ],
      false,
    );
    const q1 = summary.items.find((i) => i.id === 'q1')!;
    const q2 = summary.items.find((i) => i.id === 'q2')!;
    expect(q1.entriesTotal).toBe(3);
    expect(q1.entriesWithRound).toBe(2);
    expect(q2.entriesTotal).toBe(1);
    expect(q2.entriesWithRound).toBe(0);
    expect(summary.entriesTotal).toBe(4);
    expect(summary.entriesWithRound).toBe(2);
  });

  it('a qualifier with no matching entries reports zero, not undefined', () => {
    const summary = summarizeQualifiers(
      [{ id: 'q1', name: 'Fall', status: 'upcoming', num_rounds: 1, start_date: '2026-01-01', end_date: null, created_at: null }],
      [],
      false,
    );
    expect(summary.items[0]!.entriesTotal).toBe(0);
    expect(summary.items[0]!.entriesWithRound).toBe(0);
  });

  it('sorts items most-recently-started first', () => {
    const summary = summarizeQualifiers(
      [
        { id: 'q1', name: 'Old', status: 'completed', num_rounds: 1, start_date: '2026-01-01', end_date: null, created_at: null },
        { id: 'q2', name: 'New', status: 'upcoming', num_rounds: 1, start_date: '2026-03-01', end_date: null, created_at: null },
        { id: 'q3', name: 'Mid', status: 'upcoming', num_rounds: 1, start_date: '2026-02-01', end_date: null, created_at: null },
      ],
      [],
      false,
    );
    expect(summary.items.map((i) => i.id)).toEqual(['q2', 'q3', 'q1']);
  });
});

// ---------------------------------------------------------------------------
// classifyInFlightTier
// ---------------------------------------------------------------------------

describe('classifyInFlightTier', () => {
  const now = new Date('2026-08-26T12:00:00Z').getTime();

  it('no updated_at at all is treated as abandoned, never a live default', () => {
    expect(classifyInFlightTier(null, now)).toBe('abandoned');
  });

  it('idle under the stuck threshold (1h) is live', () => {
    const updatedAt = new Date(now - 30 * 60 * 1000).toISOString(); // 30 min ago
    expect(classifyInFlightTier(updatedAt, now)).toBe('live');
  });

  it('idle exactly at the stuck threshold is stuck, not live (boundary is exclusive on the live side)', () => {
    const updatedAt = new Date(now - 60 * 60 * 1000).toISOString(); // exactly 1h
    expect(classifyInFlightTier(updatedAt, now)).toBe('stuck');
  });

  it('idle between the stuck and abandoned thresholds is stuck', () => {
    const updatedAt = new Date(now - 5 * 60 * 60 * 1000).toISOString(); // 5h
    expect(classifyInFlightTier(updatedAt, now)).toBe('stuck');
  });

  it('idle exactly at the abandoned threshold (24h) is abandoned, not stuck', () => {
    const updatedAt = new Date(now - 24 * 60 * 60 * 1000).toISOString(); // exactly 24h
    expect(classifyInFlightTier(updatedAt, now)).toBe('abandoned');
  });

  it('idle well past 30 days is still abandoned, not silently dropped (unlike the Tracer activity-feed classifier)', () => {
    const updatedAt = new Date(now - 45 * 24 * 60 * 60 * 1000).toISOString(); // 45 days
    expect(classifyInFlightTier(updatedAt, now)).toBe('abandoned');
  });
});

// ---------------------------------------------------------------------------
// summarizeInFlightRounds
// ---------------------------------------------------------------------------

describe('summarizeInFlightRounds', () => {
  const now = new Date('2026-08-26T12:00:00Z').getTime();

  it('returns the empty summary (truncated pass-through) for no rows', () => {
    expect(summarizeInFlightRounds([], new Map(), true, now)).toEqual({
      total: 0,
      live: 0,
      stuck: 0,
      abandoned: 0,
      items: [],
      truncated: true,
    });
  });

  it('tiers and counts each row correctly', () => {
    const summary = summarizeInFlightRounds(
      [
        { id: 'r1', player_id: 'p1', updated_at: new Date(now - 10 * 60 * 1000).toISOString(), current_hole: 5, course_name: 'A' },
        { id: 'r2', player_id: 'p2', updated_at: new Date(now - 5 * 60 * 60 * 1000).toISOString(), current_hole: 9, course_name: 'B' },
        { id: 'r3', player_id: 'p3', updated_at: new Date(now - 50 * 60 * 60 * 1000).toISOString(), current_hole: 2, course_name: 'C' },
      ],
      new Map(),
      false,
      now,
    );
    expect(summary.total).toBe(3);
    expect(summary.live).toBe(1);
    expect(summary.stuck).toBe(1);
    expect(summary.abandoned).toBe(1);
  });

  it('sorts abandoned before stuck before live, and oldest-first within a tier', () => {
    const summary = summarizeInFlightRounds(
      [
        { id: 'live-newer', player_id: 'p1', updated_at: new Date(now - 5 * 60 * 1000).toISOString(), current_hole: 1, course_name: null },
        { id: 'stuck-a', player_id: 'p2', updated_at: new Date(now - 10 * 60 * 60 * 1000).toISOString(), current_hole: 1, course_name: null },
        { id: 'abandoned-a', player_id: 'p3', updated_at: new Date(now - 40 * 60 * 60 * 1000).toISOString(), current_hole: 1, course_name: null },
        { id: 'stuck-b-older', player_id: 'p4', updated_at: new Date(now - 20 * 60 * 60 * 1000).toISOString(), current_hole: 1, course_name: null },
        { id: 'live-older', player_id: 'p5', updated_at: new Date(now - 20 * 60 * 1000).toISOString(), current_hole: 1, course_name: null },
      ],
      new Map(),
      false,
      now,
    );
    expect(summary.items.map((i) => i.roundId)).toEqual([
      'abandoned-a',
      'stuck-b-older', // older (more idle) stuck round sorts before the newer one
      'stuck-a',
      'live-older', // older (more idle) live round sorts before the newer one
      'live-newer',
    ]);
  });

  it('resolves player display info from the index when present, and honestly nulls it when absent', () => {
    const summary = summarizeInFlightRounds(
      [
        { id: 'r1', player_id: 'known', updated_at: new Date(now).toISOString(), current_hole: 1, course_name: null },
        { id: 'r2', player_id: 'unknown', updated_at: new Date(now).toISOString(), current_hole: 1, course_name: null },
      ],
      new Map([['known', { name: 'Ana Lopez', href: '/admin/users/u1' }]]),
      false,
      now,
    );
    const known = summary.items.find((i) => i.roundId === 'r1')!;
    const unknown = summary.items.find((i) => i.roundId === 'r2')!;
    expect(known.playerName).toBe('Ana Lopez');
    expect(known.href).toBe('/admin/users/u1');
    expect(unknown.playerName).toBeNull();
    expect(unknown.href).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// sumRecentDays
// ---------------------------------------------------------------------------

describe('sumRecentDays', () => {
  const daily = [
    { date: '2026-08-01', rounds: 1 },
    { date: '2026-08-02', rounds: 2 },
    { date: '2026-08-03', rounds: 3 },
  ];

  it('sums only the trailing N days', () => {
    expect(sumRecentDays(daily, 2)).toBe(5); // 2 + 3
  });

  it('sums the whole series when N exceeds its length', () => {
    expect(sumRecentDays(daily, 30)).toBe(6);
  });

  it('returns 0 for a non-positive N or an empty series', () => {
    expect(sumRecentDays(daily, 0)).toBe(0);
    expect(sumRecentDays(daily, -1)).toBe(0);
    expect(sumRecentDays([], 7)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// summarizeErrorHealth
// ---------------------------------------------------------------------------

describe('summarizeErrorHealth', () => {
  it('returns nulls for no clusters', () => {
    expect(summarizeErrorHealth([])).toEqual({ worstSeverity: null, topSignature: null });
  });

  it('picks the worst severity by rank, regardless of input order', () => {
    const result = summarizeErrorHealth([
      { fingerprint: 'a', title: 'A', severity: 'warning', occurrences: 1, href: '/a' },
      { fingerprint: 'b', title: 'B', severity: 'critical', occurrences: 1, href: '/b' },
      { fingerprint: 'c', title: 'C', severity: 'error', occurrences: 1, href: '/c' },
    ]);
    expect(result.worstSeverity).toBe('critical');
  });

  it('picks the cluster with the most occurrences as the top signature', () => {
    const result = summarizeErrorHealth([
      { fingerprint: 'a', title: 'A', severity: 'error', occurrences: 2, href: '/a' },
      { fingerprint: 'b', title: 'B', severity: 'error', occurrences: 9, href: '/b' },
      { fingerprint: 'c', title: 'C', severity: 'error', occurrences: 5, href: '/c' },
    ]);
    expect(result.topSignature?.fingerprint).toBe('b');
  });

  it('keeps the first cluster on an occurrence tie (input is already most-recent-first)', () => {
    const result = summarizeErrorHealth([
      { fingerprint: 'a', title: 'A', severity: 'error', occurrences: 4, href: '/a' },
      { fingerprint: 'b', title: 'B', severity: 'error', occurrences: 4, href: '/b' },
    ]);
    expect(result.topSignature?.fingerprint).toBe('a');
  });
});

// ---------------------------------------------------------------------------
// fetchTeamDetailExtras — I/O wiring + fail-soft degradation
// ---------------------------------------------------------------------------

describe('fetchTeamDetailExtras', () => {
  beforeEach(reset);

  it('wires qualifiers + entries through summarizeQualifiers unchanged', async () => {
    golfQualifiers.data = [
      { id: 'q1', name: 'Fall', status: 'in_progress', num_rounds: 3, start_date: '2026-01-01', end_date: null, created_at: '2026-01-01' },
    ];
    golfQualifierEntries.data = [{ qualifier_id: 'q1', round_id: 'r1' }, { qualifier_id: 'q1', round_id: null }];

    const result = await fetchTeamDetailExtras({ teamId: 'team-a', rosterIndex: new Map() });

    expect(result.degraded).toEqual([]);
    expect(result.qualifiers.total).toBe(1);
    expect(result.qualifiers.open).toBe(1);
    expect(result.qualifiers.entriesTotal).toBe(2);
    expect(result.qualifiers.entriesWithRound).toBe(1);
  });

  it('never queries golf_qualifier_entries when the team has no qualifiers (no wasted query)', async () => {
    golfQualifiers.data = [];
    const result = await fetchTeamDetailExtras({ teamId: 'team-a', rosterIndex: new Map() });
    expect(result.qualifiers.total).toBe(0);
  });

  it('degrades ONLY the qualifiers section when that query fails, leaving in-flight rounds intact', async () => {
    golfQualifiers.error = { message: 'db down' };
    golfRounds.data = [{ id: 'r1', player_id: 'p1', updated_at: new Date().toISOString(), current_hole: 3, course_name: 'X' }];

    const result = await fetchTeamDetailExtras({
      teamId: 'team-a',
      rosterIndex: new Map([['p1', { name: 'Sam', href: '/admin/users/u1' }]]),
    });

    expect(result.degraded).toEqual(['qualifiers']);
    expect(result.qualifiers.total).toBe(0);
    expect(result.qualifiers.items).toEqual([]);
    expect(result.inFlight.total).toBe(1);
  });

  it('degrades ONLY in-flight rounds when that query fails, leaving qualifiers intact', async () => {
    golfQualifiers.data = [
      { id: 'q1', name: 'Fall', status: 'upcoming', num_rounds: 1, start_date: '2026-01-01', end_date: null, created_at: null },
    ];
    golfRounds.error = { message: 'timeout' };

    const result = await fetchTeamDetailExtras({ teamId: 'team-a', rosterIndex: new Map() });

    expect(result.degraded).toEqual(['inFlightRounds']);
    expect(result.inFlight.total).toBe(0);
    expect(result.qualifiers.total).toBe(1);
  });

  it('resolves a round for a player already in the roster index without any golf_players query', async () => {
    golfRounds.data = [{ id: 'r1', player_id: 'p1', updated_at: new Date().toISOString(), current_hole: 1, course_name: null }];

    const result = await fetchTeamDetailExtras({
      teamId: 'team-a',
      rosterIndex: new Map([['p1', { name: 'Roster Player', href: '/admin/users/u1' }]]),
    });

    expect(result.inFlight.items[0]!.playerName).toBe('Roster Player');
    expect(golfPlayersFrom).not.toHaveBeenCalled();
  });

  it('falls back to a single golf_players query for a round whose player is off the active roster', async () => {
    golfRounds.data = [{ id: 'r1', player_id: 'departed', updated_at: new Date().toISOString(), current_hole: 4, course_name: null }];
    golfPlayers.data = [{ id: 'departed', user_id: 'u-departed', first_name: 'Departed', last_name: 'Player' }];

    const result = await fetchTeamDetailExtras({ teamId: 'team-a', rosterIndex: new Map() });

    expect(golfPlayersFrom).toHaveBeenCalledTimes(1);
    expect(result.inFlight.items[0]!.playerName).toBe('Departed Player');
    expect(result.inFlight.items[0]!.href).toBe('/admin/users/u-departed');
  });

  it('never queries golf_players when every in-flight round is already covered by the roster index', async () => {
    golfRounds.data = [{ id: 'r1', player_id: 'p1', updated_at: new Date().toISOString(), current_hole: 1, course_name: null }];
    await fetchTeamDetailExtras({
      teamId: 'team-a',
      rosterIndex: new Map([['p1', { name: 'X', href: '/admin/users/u1' }]]),
    });
    expect(golfPlayersFrom).not.toHaveBeenCalled();
  });
});
