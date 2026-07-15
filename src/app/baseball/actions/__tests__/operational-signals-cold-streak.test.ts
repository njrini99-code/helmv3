// =============================================================================
// src/app/baseball/actions/__tests__/operational-signals-cold-streak.test.ts
//
// #379 Phase 2 regression coverage for operational-signals.ts's
// loadPlayerHittingSpans season-baseline fix, exercised through the real
// runOperationalSignalDetection wrapped action (loadPlayerHittingSpans itself
// is a plain, unexported internal helper — see its header comment for why).
//
// Before this fix, the 'player_cold_streak' rule's season/career OPS baseline
// came from a `baseball_player_stats` row with stat_type='season' — a value
// no writer in this codebase has ever produced (imports.ts / stats.ts's
// uploadStatsCSV only ever write 'practice' | 'game' | 'other') — so that
// lookup always returned [], seasonOPS could never be resolved for any
// player, and the cold-streak rule could never fire in production regardless
// of how much real stat history a team had. This test proves the fix: with a
// realistic recent-slump-vs-season scenario and the baseline sourced through
// the shared legacy-flat adapter (box-score-era baseball_player_season_stats
// preferred, legacy baseball_player_aggregates as fallback), the rule now
// actually emits a signal.
//
// withBaseballAction is mocked to a passthrough that injects a known ctx
// (same pattern as upload-stats-csv.test.ts); createClient is a table-aware
// recorder where every OTHER fact-loader's table defaults to an empty result
// (each loader in this module already degrades gracefully to [] on an empty
// source — see the module header comment), isolating this test to the
// cold-streak rule's own inputs.
//
// A 4th case (below, mirroring roster-aggregates-merge.test.ts's identical
// pure-pitcher/DH fixture) pins the PER-FIELD legacy fallback: a box-score-era
// season row can exist for a player with g=0 and every rate field null (a
// pure pitcher/DH who appears in a completed game's pitching box score but
// never bats), which must fall back to the legacy career_ops rather than
// silently masking it and producing 0 signals.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- module mocks (must be declared before importing the action) -----------

vi.mock('@/lib/baseball/with-baseball-action', () => ({
  withBaseballAction:
    (_name: string, _opts: unknown, fn: (ctx: unknown, ...a: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(
        {
          user: { id: 'user-1' },
          targetTeamId: 'team-1',
          activeTeamId: 'team-1',
          activeCoachId: 'coach-1',
        },
        ...args,
      ),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// ---- table-aware Supabase recorder -----------------------------------------

type Row = Record<string, unknown>;

const TABLES: Record<string, Row[]> = {};

function baseChain(result: { data: unknown; error: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'order', 'limit', 'in', 'or', 'not']) {
    chain[m] = () => chain;
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
  chain.single = async () => result;
  chain.maybeSingle = async () => result;
  chain.upsert = async () => ({ error: null });
  chain.update = () => ({ eq: async () => ({ data: null, error: null }) });
  chain.delete = () => chain;
  return chain;
}

function tableHandle(table: string) {
  return baseChain({ data: TABLES[table] ?? [], error: null });
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => tableHandle(table),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
  })),
}));

// ---- import AFTER mocks -----------------------------------------------------

import { runOperationalSignalDetection } from '@/app/baseball/actions/operational-signals';

// A slumping hitter: 5 recent games (>= coldStreakMinGames, so NOT flagged
// sample_too_small) each with a poor line, well below a strong season mark.
const RECENT_GAME_ROWS: Row[] = Array.from({ length: 5 }, (_, i) => ({
  player_id: 'p1',
  session_date: `2026-07-0${i + 1}`,
  at_bats: 4,
  hits: 1,
  doubles: 0,
  triples: 0,
  home_runs: 0,
  walks: 0,
  hit_by_pitch: 0,
  sacrifice_flies: 0,
})); // each game: AVG .25 / OBP .25 / SLG .25 -> OPS .50 -> recentOPS = .50

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(TABLES)) delete TABLES[key];
  TABLES.baseball_player_stats = RECENT_GAME_ROWS;
  TABLES.baseball_players = [{ id: 'p1', first_name: 'Mike', last_name: 'Trout' }];
});

describe('runOperationalSignalDetection — #379 cold-streak season-baseline fix', () => {
  it('fires player_cold_streak when the box-score-era season roll-up shows a real drop (baseline no longer stuck on the dead stat_type=\'season\' query)', async () => {
    TABLES.baseball_player_season_stats = [
      { player_id: 'p1', avg: 0.31, obp: 0.38, slg: 0.46, ops: 0.7, g: 20, last_updated: '2026-07-01T00:00:00.000Z' },
    ];
    TABLES.baseball_player_aggregates = []; // no legacy row at all for this player

    const result = await runOperationalSignalDetection();

    expect(result.success).toBe(true);
    expect(result.stats?.byRule.player_cold_streak).toBe(1);
  });

  it('falls back to the legacy aggregates row\'s career OPS when no box-score-era season row exists yet', async () => {
    TABLES.baseball_player_season_stats = []; // team hasn't logged any box scores yet
    TABLES.baseball_player_aggregates = [
      {
        player_id: 'p1',
        team_id: 'team-1',
        total_sessions: 30,
        practice_sessions: 0,
        game_sessions: 30,
        career_avg: 0.31,
        career_obp: 0.38,
        career_slg: 0.46,
        career_ops: 0.7,
        practice_avg: null,
        game_avg: 0.31,
        pressure_gap: null,
        recent_trend: 'stable',
        trend_magnitude: null,
        trend_velocity: null,
        last_5_avg: null,
        last_10_avg: null,
        season_avg: null,
        avg_pitch_velocity: null,
        max_pitch_velocity: null,
        development_stage: null,
        last_calculated_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ];

    const result = await runOperationalSignalDetection();

    expect(result.success).toBe(true);
    expect(result.stats?.byRule.player_cold_streak).toBe(1);
  });

  it('does not fire when neither a box-score-era season row nor a legacy aggregates row exists (no fabricated baseline)', async () => {
    TABLES.baseball_player_season_stats = [];
    TABLES.baseball_player_aggregates = [];

    const result = await runOperationalSignalDetection();

    expect(result.success).toBe(true);
    expect(result.stats?.byRule.player_cold_streak).toBe(0);
  });

  it('falls back to the legacy career OPS when a box-score-era season row exists for the player but its own rate fields are null (pure-pitcher/DH shape, g=0 this season)', async () => {
    // recalculate_baseball_season_stats sets avg/obp/slg/ops to NULL whenever
    // plate appearances = 0 for that row. A pure pitcher/DH who appears in a
    // completed game's PITCHING box score (but never bats) gets exactly this
    // shape: a real baseball_player_season_stats row with g=0 and every rate
    // field null. Before the fix, this present-but-null box-score row masked
    // a real legacy career_ops and the rule silently produced 0 signals
    // instead of using the legacy value as the baseline.
    TABLES.baseball_player_season_stats = [
      { player_id: 'p1', avg: null, obp: null, slg: null, ops: null, g: 0, last_updated: '2026-07-01T00:00:00.000Z' },
    ];
    TABLES.baseball_player_aggregates = [
      {
        player_id: 'p1',
        team_id: 'team-1',
        total_sessions: 30,
        practice_sessions: 0,
        game_sessions: 30,
        career_avg: 0.31,
        career_obp: 0.38,
        career_slg: 0.46,
        career_ops: 0.7,
        practice_avg: null,
        game_avg: 0.31,
        pressure_gap: null,
        recent_trend: 'stable',
        trend_magnitude: null,
        trend_velocity: null,
        last_5_avg: null,
        last_10_avg: null,
        season_avg: null,
        avg_pitch_velocity: null,
        max_pitch_velocity: null,
        development_stage: null,
        last_calculated_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ];

    const result = await runOperationalSignalDetection();

    expect(result.success).toBe(true);
    // Same recent slump (recentOPS .50) vs the legacy career_ops of .7 baseline
    // (a .20 drop, above the .15 threshold) — the rule must still fire using
    // the legacy career_ops, not silently produce 0 signals because the
    // box-score row's own OPS field was null.
    expect(result.stats?.byRule.player_cold_streak).toBe(1);
  });
});
