import { describe, it, expect, vi, beforeEach } from 'vitest';

// Same FIFO-per-table mock idiom as team-detail.test.ts: each table name
// gets its own queue of canned results, consumed in call order. `.rpc()` is
// mocked separately since it's the one non-table call this module makes
// (the bounded flight-trace existence check).
const mocks = vi.hoisted(() => ({
  tableQueue: {} as Record<string, Array<{ data: unknown; error: unknown; count?: number | null }>>,
  rpcQueue: [] as Array<{ data: unknown; error: unknown }>,
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
    range: (from: number, to: number) => {
      const r = nextResult(table);
      return Promise.resolve({
        data: Array.isArray(r.data) ? r.data.slice(from, to + 1) : r.data,
        error: r.error,
        count: r.count,
      });
    },
    maybeSingle: () => Promise.resolve(nextResult(table)),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(nextResult(table)).then(resolve, reject),
  };
  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => makeChain(table),
    rpc: (_name: string, _args: Record<string, unknown>) => {
      const next = mocks.rpcQueue.shift();
      return Promise.resolve(next ?? { data: [], error: null });
    },
  }),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

import {
  classifyPlayerRoundTier,
  computeHoursIdle,
  sortPlayerRoundsByUrgency,
  summarizePlayerRounds,
  computeQualifierRoundGaps,
  buildTraceCandidateRoundIds,
  classifyProfileQuality,
  fetchPlayerDetail,
  type PlayerRoundTier,
} from '@/lib/admin/data/player-detail';
import { logServerError } from '@/lib/server-error-logger';

const mockedLogServerError = vi.mocked(logServerError);

const ONE_HOUR_MS = 60 * 60 * 1000;
const NOW = new Date('2026-08-26T12:00:00Z').getTime();

describe('classifyPlayerRoundTier', () => {
  it('treats a missing updated_at as stale (worst case, never fabricated as fresh)', () => {
    expect(classifyPlayerRoundTier(null, NOW)).toBe('stale');
  });

  it('classifies a round touched moments ago as in_progress', () => {
    const updatedAt = new Date(NOW - 0.5 * ONE_HOUR_MS).toISOString();
    expect(classifyPlayerRoundTier(updatedAt, NOW)).toBe('in_progress');
  });

  it('classifies a round idle 1h-24h as stuck', () => {
    const updatedAt = new Date(NOW - 5 * ONE_HOUR_MS).toISOString();
    expect(classifyPlayerRoundTier(updatedAt, NOW)).toBe('stuck');
  });

  it('classifies a round idle 24h-30d as abandoned', () => {
    const updatedAt = new Date(NOW - 48 * ONE_HOUR_MS).toISOString();
    expect(classifyPlayerRoundTier(updatedAt, NOW)).toBe('abandoned');
  });

  it('classifies a round idle beyond 30 days as stale, unlike the Tracer feed which drops it', () => {
    const updatedAt = new Date(NOW - 31 * 24 * ONE_HOUR_MS).toISOString();
    expect(classifyPlayerRoundTier(updatedAt, NOW)).toBe('stale');
  });
});

describe('computeHoursIdle', () => {
  it('returns null for a missing timestamp', () => {
    expect(computeHoursIdle(null, NOW)).toBeNull();
  });

  it('returns null for an unparseable timestamp rather than NaN', () => {
    expect(computeHoursIdle('not-a-date', NOW)).toBeNull();
  });

  it('computes real elapsed hours', () => {
    const updatedAt = new Date(NOW - 3 * ONE_HOUR_MS).toISOString();
    expect(computeHoursIdle(updatedAt, NOW)).toBeCloseTo(3, 5);
  });
});

describe('sortPlayerRoundsByUrgency', () => {
  it('orders stuck > abandoned > stale > in_progress', () => {
    const rows: Array<{ id: string; tier: PlayerRoundTier; hoursIdle: number | null }> = [
      { id: 'stale-round', tier: 'stale', hoursIdle: 1000 },
      { id: 'progress-round', tier: 'in_progress', hoursIdle: 0.2 },
      { id: 'abandoned-round', tier: 'abandoned', hoursIdle: 48 },
      { id: 'stuck-round', tier: 'stuck', hoursIdle: 5 },
    ];
    const sorted = sortPlayerRoundsByUrgency(rows);
    expect(sorted.map((r) => r.id)).toEqual(['stuck-round', 'abandoned-round', 'stale-round', 'progress-round']);
  });

  it('breaks ties within the same tier by longest idle first', () => {
    const rows: Array<{ id: string; tier: PlayerRoundTier; hoursIdle: number | null }> = [
      { id: 'shorter', tier: 'stuck', hoursIdle: 2 },
      { id: 'longer', tier: 'stuck', hoursIdle: 20 },
    ];
    const sorted = sortPlayerRoundsByUrgency(rows);
    expect(sorted.map((r) => r.id)).toEqual(['longer', 'shorter']);
  });

  it('does not mutate the input array', () => {
    const rows: Array<{ id: string; tier: PlayerRoundTier; hoursIdle: number | null }> = [
      { id: 'a', tier: 'in_progress', hoursIdle: 0.1 },
      { id: 'b', tier: 'stuck', hoursIdle: 2 },
    ];
    const copy = [...rows];
    sortPlayerRoundsByUrgency(rows);
    expect(rows).toEqual(copy);
  });
});

describe('summarizePlayerRounds', () => {
  it('counts completed and non-terminal rounds, averaging only over scored completed rounds', () => {
    const summary = summarizePlayerRounds([
      { status: 'completed', total_score: 72, created_at: '2026-08-01T00:00:00Z' },
      { status: 'completed', total_score: 80, created_at: '2026-08-10T00:00:00Z' },
      { status: 'completed', total_score: null, created_at: '2026-08-05T00:00:00Z' },
      { status: 'in_progress', total_score: null, created_at: '2026-08-12T00:00:00Z' },
      { status: 'draft', total_score: null, created_at: '2026-08-02T00:00:00Z' },
    ]);
    expect(summary.completed).toBe(3);
    expect(summary.nonTerminal).toBe(2);
    expect(summary.averageScore).toBe(76);
    expect(summary.lastRoundAt).toBe('2026-08-12T00:00:00Z');
  });

  it('reports null (not 0) average when no completed round carries a score', () => {
    const summary = summarizePlayerRounds([{ status: 'completed', total_score: null, created_at: '2026-08-01T00:00:00Z' }]);
    expect(summary.averageScore).toBeNull();
  });

  it('handles an empty round list without throwing', () => {
    const summary = summarizePlayerRounds([]);
    expect(summary).toEqual({ completed: 0, nonTerminal: 0, averageScore: null, lastRoundAt: null });
  });

  it('ignores an unrecognized status for the completed/non-terminal counts but still tracks lastRoundAt', () => {
    const summary = summarizePlayerRounds([{ status: 'deleted', total_score: null, created_at: '2026-08-20T00:00:00Z' }]);
    expect(summary.completed).toBe(0);
    expect(summary.nonTerminal).toBe(0);
    expect(summary.lastRoundAt).toBe('2026-08-20T00:00:00Z');
  });
});

describe('computeQualifierRoundGaps', () => {
  it('finds a single missing round number', () => {
    const { used, missing } = computeQualifierRoundGaps(3, [1, 2]);
    expect(used).toEqual([1, 2]);
    expect(missing).toEqual([3]);
  });

  it('dedupes and sorts used round numbers', () => {
    const { used, missing } = computeQualifierRoundGaps(3, [1, 1, 3]);
    expect(used).toEqual([1, 3]);
    expect(missing).toEqual([2]);
  });

  it('drops null/undefined/non-positive round numbers rather than treating them as real', () => {
    const { used, missing } = computeQualifierRoundGaps(2, [null, undefined, 0, -1, 1]);
    expect(used).toEqual([1]);
    expect(missing).toEqual([2]);
  });

  it('reports no gaps when every round number is used', () => {
    const { missing } = computeQualifierRoundGaps(2, [1, 2]);
    expect(missing).toEqual([]);
  });

  it('handles a zero-round qualifier without producing spurious gaps', () => {
    const { used, missing } = computeQualifierRoundGaps(0, [1]);
    expect(used).toEqual([1]);
    expect(missing).toEqual([]);
  });
});

describe('buildTraceCandidateRoundIds', () => {
  it('includes every non-terminal round plus the most recent round', () => {
    const ids = buildTraceCandidateRoundIds({ nonTerminalRoundIds: ['r1', 'r2'], mostRecentRoundId: 'r3' });
    expect(ids).toEqual(['r1', 'r2', 'r3']);
  });

  it('does not duplicate the most recent round when it is already non-terminal', () => {
    const ids = buildTraceCandidateRoundIds({ nonTerminalRoundIds: ['r1'], mostRecentRoundId: 'r1' });
    expect(ids).toEqual(['r1']);
  });

  it('caps the candidate set at the given limit', () => {
    const ids = buildTraceCandidateRoundIds(
      { nonTerminalRoundIds: ['r1', 'r2', 'r3', 'r4'], mostRecentRoundId: 'r5' },
      2,
    );
    expect(ids).toHaveLength(2);
    expect(ids).toEqual(['r1', 'r2']);
  });

  it('returns an empty array when there is nothing to check', () => {
    expect(buildTraceCandidateRoundIds({ nonTerminalRoundIds: [], mostRecentRoundId: null })).toEqual([]);
  });
});

describe('classifyProfileQuality', () => {
  it('is complete when onboarding_completed is true regardless of other fields', () => {
    expect(
      classifyProfileQuality({ onboardingCompleted: true, profileComplete: false, email: null, firstName: null, lastName: null }),
    ).toBe('complete');
  });

  it('is complete when profile_complete is true', () => {
    expect(
      classifyProfileQuality({ onboardingCompleted: false, profileComplete: true, email: null, firstName: null, lastName: null }),
    ).toBe('complete');
  });

  it('is partial when any identifying field is present without either completion flag', () => {
    expect(
      classifyProfileQuality({
        onboardingCompleted: false,
        profileComplete: false,
        email: 'p@example.com',
        firstName: null,
        lastName: null,
      }),
    ).toBe('partial');
  });

  it('is missing when nothing is present', () => {
    expect(
      classifyProfileQuality({ onboardingCompleted: null, profileComplete: null, email: null, firstName: null, lastName: null }),
    ).toBe('missing');
  });
});

describe('fetchPlayerDetail', () => {
  beforeEach(() => {
    mocks.tableQueue = {};
    mocks.rpcQueue = [];
    mockedLogServerError.mockClear();
  });

  it('returns player: null (not a thrown error) when the account has no golf_players row', async () => {
    mocks.tableQueue.golf_players = [{ data: null, error: null }];
    const result = await fetchPlayerDetail('user-without-golf');
    expect(result.player).toBeNull();
    expect(result.degraded).toEqual([]);
    expect(result.errors).toEqual({ count7d: null, recent: [] });
  });

  it('degrades the rounds section on a query failure instead of throwing or faking zeros', async () => {
    mocks.tableQueue.golf_players = [
      {
        data: {
          id: 'player-1', user_id: 'user-1', first_name: 'Pat', last_name: 'Golfer', email: 'pat@example.com',
          graduation_year: 2027, handicap_index: 4.2, onboarding_completed: true, profile_complete: true,
          created_at: '2026-01-01T00:00:00Z',
        },
        error: null,
      },
    ];
    mocks.tableQueue.golf_team_members = [{ data: [], error: null }];
    mocks.tableQueue.users = [{ data: { last_seen: '2026-08-20T00:00:00Z' }, error: null }];
    // count query first, then the bounded rounds fetch — same call order as
    // the Promise.all in fetchPlayerDetail.
    mocks.tableQueue.golf_rounds = [
      { data: null, error: { message: 'connection reset' } },
      { data: [], error: null },
    ];
    mocks.tableQueue.golf_qualifier_entries = [{ data: [], error: null }];
    mocks.tableQueue.admin_events = [
      { data: null, error: null, count: 0 },
      { data: [], error: null },
    ];

    const result = await fetchPlayerDetail('user-1');

    expect(result.degraded).toContain('rounds');
    expect(result.roundsSummary.totalCount).toBeNull();
    expect(result.roundsSummary.fetchedCount).toBe(0);
    expect(result.player?.name).toBe('Pat Golfer');

    // A real section failure IS worth logging — but never with the
    // inspected player's own `userId`: `admin_events.user_id` is what THIS
    // module's own "errors attributed to this player" section filters on,
    // so passing it here would make opening the page manufacture a row the
    // very next load counts as one of "their" errors.
    expect(mockedLogServerError).toHaveBeenCalledTimes(1);
    const [, loggedContext] = mockedLogServerError.mock.calls[0]!;
    expect(loggedContext).toMatchObject({ action: 'admin.getPlayerDetail', playerId: 'player-1' });
    expect(loggedContext).not.toHaveProperty('userId');
  });

  it('degrades only "traces" (never logs) when the flight-trace RPC is unavailable — the production shape today', async () => {
    // public.helm_debug_list_traces does not exist in production yet (see
    // traces/page.tsx's own loadTraces() comment) — every golf player page
    // view hits this exact path there. It must never write an admin_events
    // row: that would fire on every single load in the one environment this
    // panel matters most in.
    mocks.tableQueue.golf_players = [
      {
        data: {
          id: 'player-3', user_id: 'user-3', first_name: 'Jo', last_name: 'Rookie', email: 'jo@example.com',
          graduation_year: null, handicap_index: null, onboarding_completed: false, profile_complete: false,
          created_at: '2026-01-01T00:00:00Z',
        },
        error: null,
      },
    ];
    mocks.tableQueue.golf_team_members = [{ data: [], error: null }];
    mocks.tableQueue.users = [{ data: { last_seen: null }, error: null }];
    const stuckUpdatedAt = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    mocks.tableQueue.golf_rounds = [
      { data: null, error: null, count: 1 },
      {
        data: [
          {
            id: 'round-x', status: 'in_progress', round_date: '2026-08-25', created_at: '2026-08-25T10:00:00Z',
            updated_at: stuckUpdatedAt, course_name: 'Pebble Beach', total_score: null, score_to_par: null,
            current_hole: 9, holes_played: 8, qualifier_id: null, qualifier_round_number: null,
          },
        ],
        error: null,
      },
    ];
    mocks.rpcQueue = [{ data: null, error: { code: '42883', message: 'function helm_debug_list_traces does not exist' } }];
    mocks.tableQueue.golf_qualifier_entries = [{ data: [], error: null }];
    mocks.tableQueue.admin_events = [
      { data: null, error: null, count: 0 },
      { data: [], error: null },
    ];

    const result = await fetchPlayerDetail('user-3');

    expect(result.degraded).toEqual(['traces']);
    expect(result.stuckRounds).toHaveLength(1);
    expect(result.stuckRounds[0]!.traceHref).toBeNull();
    expect(result.mostRecentRoundTraceHref).toBeNull();
    expect(mockedLogServerError).not.toHaveBeenCalled();
  });

  it('surfaces a stuck round with its trace link when the flight recorder found one', async () => {
    mocks.tableQueue.golf_players = [
      {
        data: {
          id: 'player-2', user_id: 'user-2', first_name: 'Sam', last_name: 'Player', email: 'sam@example.com',
          graduation_year: null, handicap_index: null, onboarding_completed: false, profile_complete: false,
          created_at: '2026-01-01T00:00:00Z',
        },
        error: null,
      },
    ];
    mocks.tableQueue.golf_team_members = [{ data: [{ team_id: 'team-1', golf_teams: { name: 'Rini U' } }], error: null }];
    mocks.tableQueue.users = [{ data: { last_seen: null }, error: null }];
    const stuckUpdatedAt = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    mocks.tableQueue.golf_rounds = [
      { data: null, error: null, count: 1 },
      {
        data: [
          {
            id: 'round-stuck', status: 'in_progress', round_date: '2026-08-25', created_at: '2026-08-25T10:00:00Z',
            updated_at: stuckUpdatedAt, course_name: 'Pebble Beach', total_score: null, score_to_par: null,
            current_hole: 9, holes_played: 8, qualifier_id: null, qualifier_round_number: null,
          },
        ],
        error: null,
      },
    ];
    mocks.rpcQueue = [{ data: [{ trace_id: 'trace-abc' }], error: null }];
    mocks.tableQueue.golf_qualifier_entries = [{ data: [], error: null }];
    mocks.tableQueue.admin_events = [
      { data: null, error: null, count: 0 },
      { data: [], error: null },
    ];

    const result = await fetchPlayerDetail('user-2');

    expect(result.degraded).toEqual([]);
    expect(result.stuckRounds).toHaveLength(1);
    expect(result.stuckRounds[0]!.tier).toBe('stuck');
    expect(result.stuckRounds[0]!.traceHref).toBe('/admin/golf/tracer?trace=trace-abc');
    expect(result.player?.team).toEqual({ id: 'team-1', name: 'Rini U' });
  });
});
