// =============================================================================
// Regression test for the SHARED action outcome-ledger SEED (V10 — did-it-move).
//
// THE BUG this guards: the signal-native converter (convertSignalToAction) did
// NOT seed the outcome ledger, so a signal-born action — the primary mechanic —
// was created without a baseline and could never be measured by the sweep. The
// fix unified both converters onto buildActionOutcomeSeed + resolveSignalTarget-
// Metric in action-baseline.ts. These lock the unified business rule:
//   * the metric resolves from the cited insight's primary driver, else the
//     generator fallback, else null (team/composite/manual);
//   * a captured baseline leaves the verdict null (the sweep fills it);
//   * no player / no metric / no value => 'insufficient_sample' (tracked but
//     honestly unmeasurable), NEVER a fabricated baseline.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  resolveSignalTargetMetric,
  buildActionOutcomeSeed,
  citedInsightIdFromSignal,
  primaryMetricOfInsightMetadata,
  type BaselineClient,
} from '@/lib/baseball/coachhelm/action-baseline';

// ---------------------------------------------------------------------------
// A tiny in-memory Supabase-shaped stub. Each .from(table) returns a chainable
// query that resolves to the rows seeded for that table. Only the methods the
// helper uses are implemented (select/eq/in/order/range/limit/maybeSingle).
// The canned sets stay far under the 1000-row page size, so the shared stat
// read's pagination loop (loadEngineStatRows -> fetchAllRowsResult) terminates
// after one page.
// ---------------------------------------------------------------------------
function makeClient(tables: {
  baseball_coach_insights?: Array<{ id: string; team_id: string; metadata: unknown }>;
  baseball_player_stats?: Array<Record<string, unknown>>;
  baseball_games?: Array<Record<string, unknown>>;
  baseball_box_score_batting?: Array<Record<string, unknown>>;
  baseball_box_score_pitching?: Array<Record<string, unknown>>;
}): BaselineClient {
  return {
    from(table: string) {
      let rows: Array<Record<string, unknown>> =
        (tables as Record<string, Array<Record<string, unknown>>>)[table] ?? [];
      const api = {
        select() {
          return api;
        },
        eq(col: string, val: unknown) {
          rows = rows.filter((r) => r[col] === val);
          return api;
        },
        in(col: string, vals: unknown[]) {
          rows = rows.filter((r) => vals.includes(r[col]));
          return api;
        },
        // #852 residual: buildActionOutcomeSeed now also reads
        // baseball_pitch_events/baseball_batted_ball_events (event-derived
        // velocity) via the #813 superseded-row filter. Mirrors .eq()'s exact
        // equality semantics so a fixture row can opt into (or out of) the
        // supersede filter by setting `superseded_by_run_id` explicitly.
        is(col: string, val: unknown) {
          rows = rows.filter((r) => r[col] === val);
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return Promise.resolve({ data: rows, error: null });
        },
        range() {
          return Promise.resolve({ data: rows, error: null });
        },
        maybeSingle() {
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
      };
      return api;
    },
  };
}

const HIT_ROWS = (playerId: string) =>
  Array.from({ length: 12 }).map((_, i) => ({
    id: `s${i}`,
    team_id: 'team-1',
    player_id: playerId,
    stat_type: 'hitting',
    session_date: `2026-05-${String(i + 1).padStart(2, '0')}`,
    at_bats: 4,
    hits: 1,
    doubles: 0,
    triples: 0,
    home_runs: 0,
    walks: 1,
    strikeouts: 1,
    innings_pitched: null,
    earned_runs: null,
    walks_allowed: null,
    strikeouts_thrown: null,
    exit_velocity: null,
    pitch_velocity: null,
  }));

describe('primaryMetricOfInsightMetadata', () => {
  it('reads the first driver metric when it is a real metric id', () => {
    const meta = { evidence: { diagnosis: { drivers: [{ metric: 'k_rate' }] } } };
    expect(primaryMetricOfInsightMetadata(meta)).toBe('k_rate');
  });
  it('returns null for an unknown / missing driver metric', () => {
    expect(primaryMetricOfInsightMetadata({ evidence: { diagnosis: { drivers: [{ metric: 'not_a_metric' }] } } })).toBeNull();
    expect(primaryMetricOfInsightMetadata(null)).toBeNull();
    expect(primaryMetricOfInsightMetadata({})).toBeNull();
  });
});

describe('citedInsightIdFromSignal', () => {
  it('extracts the cited insight id from source_refs', () => {
    const refs = [
      { source_table: 'baseball_coach_insights', source_id: 'ins-1' },
      { source_table: 'baseball_player_stats', source_id: 'st-1' },
    ];
    expect(citedInsightIdFromSignal(refs)).toBe('ins-1');
  });
  it('returns null when no insight is cited (manual signal)', () => {
    expect(citedInsightIdFromSignal([{ source_table: 'baseball_player_stats', source_id: 'x' }])).toBeNull();
    expect(citedInsightIdFromSignal(null)).toBeNull();
  });
});

describe('resolveSignalTargetMetric — insight-path / signal-path convergence', () => {
  it("prefers the cited insight's primary driver (byte-identical to the insight path)", async () => {
    const client = makeClient({
      baseball_coach_insights: [
        { id: 'ins-1', team_id: 'team-1', metadata: { evidence: { diagnosis: { drivers: [{ metric: 'k_rate' }] } } } },
      ],
    });
    const metric = await resolveSignalTargetMetric(client, 'team-1', {
      signal_type: 'two_strike_chase',
      source_refs: [{ source_table: 'baseball_coach_insights', source_id: 'ins-1' }],
    });
    // The insight's driver (k_rate) wins over the generator fallback.
    expect(metric).toBe('k_rate');
  });

  it('falls back to the generator map when the insight is not resolvable', async () => {
    const client = makeClient({});
    const metric = await resolveSignalTargetMetric(client, 'team-1', {
      signal_type: 'two_strike_chase',
      source_refs: [],
    });
    expect(metric).toBe('two_strike_chase_pct');
  });

  it('returns null for a team-level / composite generator (no honest per-player metric)', async () => {
    const client = makeClient({});
    expect(
      await resolveSignalTargetMetric(client, 'team-1', { signal_type: 'schedule_conflict', source_refs: [] }),
    ).toBeNull();
    expect(
      await resolveSignalTargetMetric(client, 'team-1', { signal_type: 'composite_command_decay', source_refs: [] }),
    ).toBeNull();
  });

  it('resolves a direct metric id used as signal_type (manual signal)', async () => {
    const client = makeClient({});
    expect(
      await resolveSignalTargetMetric(client, 'team-1', { signal_type: 'era', source_refs: [] }),
    ).toBe('era');
  });
});

describe('buildActionOutcomeSeed — the unified ledger seed', () => {
  it("captures a baseline + leaves verdict null when a player has a value (the sweep will fill it)", async () => {
    const client = makeClient({ baseball_player_stats: HIT_ROWS('p1') });
    const seed = await buildActionOutcomeSeed(client, 'team-1', 'p1', 'k_rate');
    expect(seed.outcome_metric).toBe('k_rate');
    expect(seed.outcome_baseline_value).not.toBeNull();
    expect(seed.outcome_verdict).toBeNull();
  });

  it("returns 'insufficient_sample' with no player (team-level action)", async () => {
    const client = makeClient({});
    const seed = await buildActionOutcomeSeed(client, 'team-1', null, 'k_rate');
    expect(seed).toEqual({ outcome_metric: null, outcome_baseline_value: null, outcome_verdict: 'insufficient_sample' });
  });

  it("returns 'insufficient_sample' with no resolvable metric", async () => {
    const client = makeClient({ baseball_player_stats: HIT_ROWS('p1') });
    const seed = await buildActionOutcomeSeed(client, 'team-1', 'p1', null);
    expect(seed).toEqual({ outcome_metric: null, outcome_baseline_value: null, outcome_verdict: 'insufficient_sample' });
  });

  it("marks 'insufficient_sample' (never fabricates) when the player has no value for the metric", async () => {
    // A hitter has no pitching value → baseline null → honest insufficient_sample.
    const client = makeClient({ baseball_player_stats: HIT_ROWS('p1') });
    const seed = await buildActionOutcomeSeed(client, 'team-1', 'p1', 'era');
    expect(seed.outcome_metric).toBe('era');
    expect(seed.outcome_baseline_value).toBeNull();
    expect(seed.outcome_verdict).toBe('insufficient_sample');
  });

  it('computes the baseline from CANONICAL box-score rows, dropping the same player\'s legacy GAME rows (#379 precedence)', async () => {
    // Legacy game rows scream strikeouts (k_rate 1.0); canonical box-score rows
    // for the same player show k_rate 3/27 = 1/9. Under the #379 rule the
    // canonical layer owns the game context outright — the seed must equal the
    // canonical-only figure, not a blend (blend would be 15/39 ≈ 0.385). Each
    // legacy row shares its calendar day with one canonical game below (#379
    // is (player, date)-scoped, not player-only), so all three are dropped.
    const legacyGameRows = Array.from({ length: 3 }).map((_, i) => ({
      id: `lg${i}`,
      team_id: 'team-1',
      player_id: 'p1',
      stat_type: 'game',
      session_date: `2026-04-0${i + 1}`,
      at_bats: 4,
      hits: 0,
      strikeouts: 4,
      walks: 0,
    }));
    const client = makeClient({
      baseball_player_stats: legacyGameRows,
      baseball_games: Array.from({ length: 3 }).map((_, i) => ({
        id: `g${i}`,
        team_id: 'team-1',
        game_date: `2026-04-0${i + 1}`,
      })),
      baseball_box_score_batting: Array.from({ length: 3 }).map((_, i) => ({
        id: `bb${i}`,
        team_id: 'team-1',
        game_id: `g${i}`,
        player_id: 'p1',
        ab: 8,
        h: 3,
        doubles: 0,
        triples: 0,
        hr: 0,
        bb: 1,
        k: 1,
        hbp: 0,
        sf: 0,
      })),
    });
    const seed = await buildActionOutcomeSeed(client, 'team-1', 'p1', 'k_rate');
    expect(seed.outcome_metric).toBe('k_rate');
    expect(seed.outcome_baseline_value).toBeCloseTo(3 / 27, 5);
    expect(seed.outcome_verdict).toBeNull();
  });
});
