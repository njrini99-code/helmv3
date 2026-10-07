/**
 * Unit tests for v3 W19 goal-suggestion writer + evaluator.
 *
 * Covers:
 *   - selectSuggestionsForPlayer (pure)
 *     * skips metrics with an active goal already targeting them
 *     * skips metrics without drill coverage
 *     * caps at maxSuggestions (default 1 since audit row 21)
 *     * ranks worst-first by cohort percentile
 *     * skips players at or above their cohort average (owner decision
 *       2026-09-28: the cohort is the anchor, the Tour is context)
 *     * skips unknown metric_ids
 *   - runSuggestionWriter (orchestration, mocked Supabase)
 *     * inserts exactly the expected rows
 *     * is idempotent — second run inserts 0
 *   - runSuggestionEvaluator
 *     * only expires pending/snoozed rows whose expires_at is past
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  selectSuggestionsForPlayer,
  computeTargetValue,
  runSuggestionWriter,
  runSuggestionEvaluator,
  reconcileSuggestionsForPlayer,
  severityForMetric,
  isWorseThanAnchor,
  MAX_ACTIVE_PENDING_PER_PLAYER,
  DEFAULT_SUGGESTION_TTL_DAYS,
  type StandingRowWithDirection,
  type SuggestionDraft,
} from '@/lib/coachhelm/v3/goals/suggestion-writer';

/**
 * Cohort fields for a fixture row whose second number is the anchor. The
 * percentile is shaped so a bigger gap behind the anchor ranks worse (lower
 * level_pct), which is what the production standing refresh produces.
 */
function cohortFields(
  player_value: number,
  anchor: number,
  direction: 'higher_better' | 'lower_better',
): { level_avg: number; level_n: number; level_pct: number } {
  const signedGap = direction === 'higher_better' ? anchor - player_value : player_value - anchor;
  const level_pct = Math.max(0, Math.min(100, 50 - signedGap * 100));
  return { level_avg: anchor, level_n: 20, level_pct };
}

// ---------------------------------------------------------------------------
// selectSuggestionsForPlayer
// ---------------------------------------------------------------------------

describe('selectSuggestionsForPlayer', () => {
  function row(
    metric_id: string,
    player_value: number,
    pga_value: number,
    direction: 'higher_better' | 'lower_better' = 'higher_better',
  ): StandingRowWithDirection {
    return {
      player_id: 'p1',
      metric_id,
      player_value,
      pga_value,
      pga_delta: player_value - pga_value,
      direction,
      ...cohortFields(player_value, pga_value, direction),
    };
  }

  it('caps at 1 suggestion per player by default, the worst cohort percentile', () => {
    // Make 5 candidates, all higher_better, all behind the cohort, all drilled.
    const standings = [
      row('sg_putting', 0.1, 0.5), // gap 0.4
      row('sg_approach', 0.0, 0.5), // gap 0.5 (worst)
      row('sg_total', 0.3, 0.5), // gap 0.2
      row('sg_ott', 0.2, 0.5), // gap 0.3
      row('sg_around_green', 0.4, 0.5), // gap 0.1 (mildest)
    ];

    const drafts = selectSuggestionsForPlayer({
      player_id: 'p1',
      standings,
      metricsWithDrillCoverage: new Set(standings.map((s) => s.metric_id)),
      activeGoalMetrics: new Set(),
      pendingSuggestionMetrics: new Set(),
    });

    expect(drafts).toHaveLength(1);
    expect(drafts.map((d) => d.metric_id)).toEqual(['sg_approach']);
  });

  it('respects custom maxSuggestions', () => {
    const standings = [row('sg_putting', 0.1, 0.5), row('sg_approach', 0.0, 0.5)];
    const drafts = selectSuggestionsForPlayer({
      player_id: 'p1',
      standings,
      metricsWithDrillCoverage: new Set(['sg_putting', 'sg_approach']),
      activeGoalMetrics: new Set(),
      pendingSuggestionMetrics: new Set(),
      maxSuggestions: 1,
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.metric_id).toBe('sg_approach');
  });

  it('skips metrics where the player already has an active goal', () => {
    const standings = [row('sg_putting', 0.1, 0.5), row('sg_approach', 0.0, 0.5)];
    const drafts = selectSuggestionsForPlayer({
      player_id: 'p1',
      standings,
      metricsWithDrillCoverage: new Set(['sg_putting', 'sg_approach']),
      activeGoalMetrics: new Set(['sg_approach']), // already on a goal
      pendingSuggestionMetrics: new Set(),
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.metric_id).toBe('sg_putting');
  });

  it('skips metrics with a pending (non-expired) suggestion already', () => {
    const standings = [row('sg_putting', 0.1, 0.5), row('sg_approach', 0.0, 0.5)];
    const drafts = selectSuggestionsForPlayer({
      player_id: 'p1',
      standings,
      metricsWithDrillCoverage: new Set(['sg_putting', 'sg_approach']),
      activeGoalMetrics: new Set(),
      pendingSuggestionMetrics: new Set(['sg_approach']),
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.metric_id).toBe('sg_putting');
  });

  it('skips metrics without drill coverage', () => {
    const standings = [row('sg_putting', 0.1, 0.5), row('sg_approach', 0.0, 0.5)];
    const drafts = selectSuggestionsForPlayer({
      player_id: 'p1',
      standings,
      metricsWithDrillCoverage: new Set(['sg_putting']), // approach undrilled
      activeGoalMetrics: new Set(),
      pendingSuggestionMetrics: new Set(),
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.metric_id).toBe('sg_putting');
  });

  it('skips players at or above their cohort average (no improvement gap)', () => {
    const standings = [
      row('sg_putting', 0.5, 0.5), // even
      row('sg_approach', 0.6, 0.5), // above
    ];
    const drafts = selectSuggestionsForPlayer({
      player_id: 'p1',
      standings,
      metricsWithDrillCoverage: new Set(['sg_putting', 'sg_approach']),
      activeGoalMetrics: new Set(),
      pendingSuggestionMetrics: new Set(),
    });
    expect(drafts).toEqual([]);
  });

  it('handles lower_better metrics with correct severity sign', () => {
    // For lower_better, player_value > pga_value = WORSE (positive severity).
    const standings = [
      row('penalty_rate_per_round', 0.8, 0.3, 'lower_better'), // worse by 0.5
      row('big_number_rate', 0.2, 0.3, 'lower_better'), // better — should skip
    ];
    const drafts = selectSuggestionsForPlayer({
      player_id: 'p1',
      standings,
      metricsWithDrillCoverage: new Set(['penalty_rate_per_round', 'big_number_rate']),
      activeGoalMetrics: new Set(),
      pendingSuggestionMetrics: new Set(),
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.metric_id).toBe('penalty_rate_per_round');
  });

  it('skips standing rows with unknown metric_ids (defensive)', () => {
    const standings = [
      // 'sg_putting' is canonical; 'not_a_real_metric' isn't.
      row('not_a_real_metric', 0.0, 0.5),
      row('sg_putting', 0.0, 0.5),
    ];
    const drafts = selectSuggestionsForPlayer({
      player_id: 'p1',
      standings,
      metricsWithDrillCoverage: new Set(['not_a_real_metric', 'sg_putting']),
      activeGoalMetrics: new Set(),
      pendingSuggestionMetrics: new Set(),
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.metric_id).toBe('sg_putting');
  });
});

describe('computeTargetValue', () => {
  it('returns the midpoint between the player and the anchor', () => {
    expect(computeTargetValue({ playerValue: 0.1, anchorValue: 0.5 })).toBeCloseTo(0.3, 6);
  });
  it('works downwards (lower_better case still numerically correct)', () => {
    expect(computeTargetValue({ playerValue: 0.8, anchorValue: 0.3 })).toBeCloseTo(0.55, 6);
  });
  // NUM-36: 5% sand scrambling vs a ~51% Tour figure produced a 28% target.
  it('caps the move at the catalog improveStep (sand: +5 points)', () => {
    expect(computeTargetValue({ playerValue: 5, anchorValue: 51, metricId: 'scrambling_pct_sand' })).toBe(10);
  });
  it('caps lower_better moves downward (par 4 average: -0.1)', () => {
    expect(computeTargetValue({ playerValue: 4.6, anchorValue: 4.0, metricId: 'scoring_par_4' })).toBeCloseTo(4.5, 6);
  });
  it('keeps the midpoint when it is already inside the step', () => {
    expect(computeTargetValue({ playerValue: 46, anchorValue: 50, metricId: 'scrambling_pct_sand' })).toBe(48);
  });
  it('keeps the plain midpoint for metrics with no catalog step', () => {
    expect(computeTargetValue({ playerValue: -1, anchorValue: 0, metricId: 'sg_total' })).toBeCloseTo(-0.5, 6);
  });
  it('selectSuggestionsForPlayer writes the capped target', () => {
    const drafts = selectSuggestionsForPlayer({
      player_id: 'p1',
      standings: [
        {
          player_id: 'p1',
          metric_id: 'scrambling_pct_sand',
          player_value: 5,
          pga_value: 51,
          pga_delta: -46,
          direction: 'higher_better',
          ...cohortFields(5, 51, 'higher_better'),
        },
      ],
      metricsWithDrillCoverage: new Set(['scrambling_pct_sand']),
      activeGoalMetrics: new Set(),
      pendingSuggestionMetrics: new Set(),
    });
    expect(drafts[0]?.suggested_target_value).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Mock helpers for runSuggestionWriter + runSuggestionEvaluator
// ---------------------------------------------------------------------------

interface FakeQuery {
  // Filters
  eq?: { col: string; val: unknown };
  in?: { col: string; vals: readonly unknown[] };
  gt?: { col: string; val: unknown };
  lt?: { col: string; val: unknown };
  not?: { col: string; op: string; val: unknown };
}

function makeSupabase(opts: {
  metrics?: Array<{ metric_id: string; direction: string; active: boolean }>;
  drills?: Array<{ impacts_metric_id: string | null }>;
  standings?: Array<{
    player_id: string;
    metric_id: string;
    player_value: number;
    pga_value: number;
    pga_delta: number | null;
  }>;
  activeGoals?: Array<{ player_id: string; metric_id: string }>;
  pendingSuggestions?: Array<{
    id?: string;
    player_id: string;
    metric_id: string;
    state: string;
    expires_at: string;
  }>;
  /** rows the evaluator-update should "match" (used by .update().lt().in().select()) */
  evalRowsToExpire?: Array<{ id: string }>;
}) {
  const inserts: unknown[] = [];

  function tableQuery(table: string) {
    // Each `.from(table)` returns an object that supports the chain used by
    // the writer. Methods that don't terminate return `this`; terminal
    // methods (`.select(...).eq().in().lt().gt()` etc.) are thenable.
    const filters: FakeQuery = {};
    let insertCountMode: 'exact' | 'planned' | 'estimated' | undefined;

    const builder = {
      // Read-side
      select(_cols?: string, opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
        if (opts?.count) insertCountMode = opts.count;
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.eq = { col, val };
        return builder;
      },
      in(col: string, vals: readonly unknown[]) {
        filters.in = { col, vals };
        return builder;
      },
      gt(col: string, val: unknown) {
        filters.gt = { col, val };
        return builder;
      },
      lt(col: string, val: unknown) {
        filters.lt = { col, val };
        return builder;
      },
      not(col: string, op: string, val: unknown) {
        filters.not = { col, op, val };
        return builder;
      },
      then(onfulfilled: (v: { data: unknown; error: unknown; count?: number }) => unknown) {
        // Terminal — resolve based on table.
        return Promise.resolve(resolve()).then(onfulfilled);
      },
      // Write-side
      insert(rows: unknown[], options?: { count?: 'exact' | 'planned' | 'estimated' }) {
        if (Array.isArray(rows)) inserts.push(...rows);
        else inserts.push(rows);
        insertCountMode = options?.count;
        return {
          then(
            onfulfilled: (v: { data: unknown; error: unknown; count?: number }) => unknown,
          ) {
            return Promise.resolve({
              data: null,
              error: null,
              count: insertCountMode === 'exact' ? (Array.isArray(rows) ? rows.length : 1) : undefined,
            }).then(onfulfilled);
          },
        };
      },
      update(_patch: Record<string, unknown>) {
        // Evaluator: .update().in().lt().select()
        return builder;
      },
    };

    function resolve(): { data: unknown; error: unknown; count?: number } {
      if (table === 'golf_metrics') {
        return { data: opts.metrics ?? [], error: null };
      }
      if (table === 'golf_drills') {
        return { data: opts.drills ?? [], error: null };
      }
      if (table === 'golf_player_standing') {
        // Fixture rows name one anchor (pga_value); the cohort sits there too
        // unless a test sets level_* itself.
        const dirOf = (m: string) =>
          (opts.metrics ?? []).find((x) => x.metric_id === m)?.direction === 'lower_better'
            ? 'lower_better'
            : 'higher_better';
        return {
          data: (opts.standings ?? []).map((r) => ({
            ...cohortFields(r.player_value, r.pga_value, dirOf(r.metric_id)),
            ...r,
          })),
          error: null,
        };
      }
      if (table === 'golf_goals') {
        return { data: opts.activeGoals ?? [], error: null };
      }
      if (table === 'golf_goal_suggestions') {
        // Evaluator path uses .update(...).in('state',...).lt('expires_at',...).select('id')
        // Writer pre-flight uses .select('player_id, metric_id, state, expires_at').in(...).in(...).gt(...)
        if (opts.evalRowsToExpire !== undefined && filters.lt?.col === 'expires_at') {
          return { data: opts.evalRowsToExpire, error: null };
        }
        return { data: opts.pendingSuggestions ?? [], error: null };
      }
      return { data: [], error: null };
    }

    return builder;
  }

  return {
    inserts,
    client: {
      from: vi.fn((table: string) => tableQuery(table)),
    } as never,
  };
}

// ---------------------------------------------------------------------------
// runSuggestionWriter
// ---------------------------------------------------------------------------

describe('runSuggestionWriter', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('inserts one suggestion per eligible player, the worst cohort percentile', async () => {
    const { client, inserts } = makeSupabase({
      metrics: [
        { metric_id: 'sg_putting', direction: 'higher_better', active: true },
        { metric_id: 'sg_approach', direction: 'higher_better', active: true },
        { metric_id: 'sg_total', direction: 'higher_better', active: true },
      ],
      drills: [
        { impacts_metric_id: 'sg_putting' },
        { impacts_metric_id: 'sg_approach' },
        { impacts_metric_id: 'sg_total' },
      ],
      standings: [
        // playerA: 3 weak metrics → expect the worst one.
        { player_id: 'A', metric_id: 'sg_putting', player_value: 0.0, pga_value: 0.5, pga_delta: -0.5 },
        { player_id: 'A', metric_id: 'sg_approach', player_value: 0.1, pga_value: 0.5, pga_delta: -0.4 },
        { player_id: 'A', metric_id: 'sg_total', player_value: 0.3, pga_value: 0.5, pga_delta: -0.2 },
      ],
      activeGoals: [],
      pendingSuggestions: [],
    });

    const result = await runSuggestionWriter(client);
    expect(result.error).toBeUndefined();
    expect(result.players_with_standings).toBe(1);
    expect(result.suggestions_inserted).toBe(1);
    expect(inserts).toHaveLength(1);

    const insertedMetrics = (inserts as Array<{ metric_id: string }>).map((r) => r.metric_id);
    expect(insertedMetrics).toEqual(['sg_putting']);

    // Validate insert payload shape per row.
    for (const r of inserts as Array<{
      player_id: string;
      metric_id: string;
      suggested_target_value: number;
      suggested_window_days: number;
      expires_at: string;
    }>) {
      expect(r.player_id).toBe('A');
      expect(r.suggested_window_days).toBe(30);
      expect(typeof r.suggested_target_value).toBe('number');
      expect(new Date(r.expires_at).getTime()).toBeGreaterThan(Date.now());
      // 14-day TTL → < 15 days from now is comfortably true.
      expect(new Date(r.expires_at).getTime()).toBeLessThan(
        Date.now() + (DEFAULT_SUGGESTION_TTL_DAYS + 1) * 86_400_000,
      );
    }
  });

  it('is idempotent — the second run finds existing pending suggestions and inserts 0', async () => {
    // Simulate post-first-run state: both metrics already pending.
    const { client, inserts } = makeSupabase({
      metrics: [
        { metric_id: 'sg_putting', direction: 'higher_better', active: true },
        { metric_id: 'sg_approach', direction: 'higher_better', active: true },
      ],
      drills: [
        { impacts_metric_id: 'sg_putting' },
        { impacts_metric_id: 'sg_approach' },
      ],
      standings: [
        { player_id: 'A', metric_id: 'sg_putting', player_value: 0.0, pga_value: 0.5, pga_delta: -0.5 },
        { player_id: 'A', metric_id: 'sg_approach', player_value: 0.1, pga_value: 0.5, pga_delta: -0.4 },
      ],
      activeGoals: [],
      pendingSuggestions: [
        {
          player_id: 'A',
          metric_id: 'sg_putting',
          state: 'pending',
          expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        },
        {
          player_id: 'A',
          metric_id: 'sg_approach',
          state: 'pending',
          expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        },
      ],
    });

    const result = await runSuggestionWriter(client);
    expect(result.error).toBeUndefined();
    expect(result.suggestions_inserted).toBe(0);
    expect(inserts).toHaveLength(0);
  });

  it('does not insert a suggestion for a metric the player already has an active goal on', async () => {
    const { client, inserts } = makeSupabase({
      metrics: [
        { metric_id: 'sg_putting', direction: 'higher_better', active: true },
        { metric_id: 'sg_approach', direction: 'higher_better', active: true },
      ],
      drills: [
        { impacts_metric_id: 'sg_putting' },
        { impacts_metric_id: 'sg_approach' },
      ],
      standings: [
        { player_id: 'A', metric_id: 'sg_putting', player_value: 0.0, pga_value: 0.5, pga_delta: -0.5 },
        { player_id: 'A', metric_id: 'sg_approach', player_value: 0.1, pga_value: 0.5, pga_delta: -0.4 },
      ],
      activeGoals: [
        // Worst metric already has an active goal → only the 2nd-worst should be suggested.
        { player_id: 'A', metric_id: 'sg_putting' },
      ],
      pendingSuggestions: [],
    });

    const result = await runSuggestionWriter(client);
    expect(result.suggestions_inserted).toBe(1);
    expect(inserts).toHaveLength(1);
    expect((inserts[0] as { metric_id: string }).metric_id).toBe('sg_approach');
  });

  it('returns zero work when there are no standing rows', async () => {
    const { client } = makeSupabase({
      metrics: [{ metric_id: 'sg_putting', direction: 'higher_better', active: true }],
      drills: [{ impacts_metric_id: 'sg_putting' }],
      standings: [],
      activeGoals: [],
      pendingSuggestions: [],
    });

    const result = await runSuggestionWriter(client);
    expect(result.error).toBeUndefined();
    expect(result.players_with_standings).toBe(0);
    expect(result.players_considered).toBe(0);
    expect(result.suggestions_inserted).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// runSuggestionEvaluator
// ---------------------------------------------------------------------------

describe('runSuggestionEvaluator', () => {
  it('returns the count of rows whose state was flipped to expired', async () => {
    const { client } = makeSupabase({
      evalRowsToExpire: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
    });
    const result = await runSuggestionEvaluator(client);
    expect(result.error).toBeUndefined();
    expect(result.expired).toBe(3);
  });

  it('returns 0 when nothing has expired', async () => {
    const { client } = makeSupabase({ evalRowsToExpire: [] });
    const result = await runSuggestionEvaluator(client);
    expect(result.error).toBeUndefined();
    expect(result.expired).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// reconcileSuggestionsForPlayer + severityForMetric (P1-08)
// ---------------------------------------------------------------------------

describe('severityForMetric', () => {
  function row(
    metric_id: string,
    player_value: number,
    pga_value: number,
    direction: 'higher_better' | 'lower_better' = 'higher_better',
  ): StandingRowWithDirection {
    return {
      player_id: 'p1',
      metric_id,
      player_value,
      pga_value,
      pga_delta: player_value - pga_value,
      direction,
      ...cohortFields(player_value, pga_value, direction),
    };
  }

  it('returns 100 - cohort percentile for a behind-cohort, drilled, windowed metric', () => {
    // cohortFields puts a 0.4 gap at the 10th percentile.
    const sev = severityForMetric([row('sg_putting', 0.1, 0.5)], 'sg_putting', new Set(['sg_putting']));
    expect(sev).toBeCloseTo(90, 6);
  });

  it('returns null when the metric has no drill coverage (stale target)', () => {
    expect(severityForMetric([row('sg_putting', 0.1, 0.5)], 'sg_putting', new Set())).toBeNull();
  });

  it('returns null when the player is at/above the cohort average (no gap)', () => {
    expect(severityForMetric([row('sg_putting', 0.6, 0.5)], 'sg_putting', new Set(['sg_putting']))).toBeNull();
  });

  it('returns null when the metric is absent from standings', () => {
    expect(severityForMetric([], 'sg_putting', new Set(['sg_putting']))).toBeNull();
  });

  it('returns null for a non-canonical metric_id', () => {
    expect(
      severityForMetric([row('not_a_metric', 0.1, 0.5)], 'not_a_metric', new Set(['not_a_metric'])),
    ).toBeNull();
  });

  it('returns null for an approach-proximity metric even when the row reads "worse" (A2 basis)', () => {
    // On-green-only player value vs the Tour's all-shot figure: the gap is
    // not a gap. A pending suggestion on this metric is therefore stale and
    // expires through P1-08 rather than being re-ranked.
    expect(
      severityForMetric(
        [row('approach_proximity_175_plus_ft', 52, 45, 'lower_better')],
        'approach_proximity_175_plus_ft',
        new Set(['approach_proximity_175_plus_ft']),
      ),
    ).toBeNull();
  });
});

describe('approach-proximity basis rule (addendum A2)', () => {
  function row(
    metric_id: string,
    player_value: number,
    pga_value: number,
    direction: 'higher_better' | 'lower_better' = 'lower_better',
  ): StandingRowWithDirection {
    return {
      player_id: 'p1',
      metric_id,
      player_value,
      pga_value,
      pga_delta: player_value - pga_value,
      direction,
      ...cohortFields(player_value, pga_value, direction),
    };
  }

  it('selectSuggestionsForPlayer never drafts an approach-proximity goal, in either direction', () => {
    const standings = [
      // "worse" than Tour on the face of it (52 ft vs 45) — still not comparable.
      row('approach_proximity_175_plus_ft', 52, 45),
      // "better" than Tour — the production shape (on-green 22.6 vs all-shot 30).
      row('approach_proximity_125_175ft', 22.6, 30),
      // A comparable lower_better metric that IS behind → the only draft.
      row('penalty_rate_per_round', 0.8, 0.3),
    ];
    const drafts = selectSuggestionsForPlayer({
      player_id: 'p1',
      standings,
      metricsWithDrillCoverage: new Set([
        'approach_proximity_175_plus_ft',
        'approach_proximity_125_175ft',
        'penalty_rate_per_round',
      ]),
      activeGoalMetrics: new Set(),
      pendingSuggestionMetrics: new Set(),
    });
    expect(drafts.map((d) => d.metric_id)).toEqual(['penalty_rate_per_round']);
  });

  it('runSuggestionWriter states how many rows the basis rule skipped', async () => {
    const { client, inserts } = makeSupabase({
      metrics: [
        { metric_id: 'approach_proximity_50_125ft', direction: 'lower_better', active: true },
        { metric_id: 'approach_proximity_175_plus_ft', direction: 'lower_better', active: true },
        { metric_id: 'sg_putting', direction: 'higher_better', active: true },
      ],
      drills: [
        { impacts_metric_id: 'approach_proximity_50_125ft' },
        { impacts_metric_id: 'approach_proximity_175_plus_ft' },
        { impacts_metric_id: 'sg_putting' },
      ],
      standings: [
        { player_id: 'A', metric_id: 'approach_proximity_50_125ft', player_value: 25, pga_value: 18, pga_delta: 7 },
        { player_id: 'A', metric_id: 'approach_proximity_175_plus_ft', player_value: 52, pga_value: 45, pga_delta: 7 },
        { player_id: 'A', metric_id: 'sg_putting', player_value: 0.0, pga_value: 0.5, pga_delta: -0.5 },
      ],
      activeGoals: [],
      pendingSuggestions: [],
    });

    const result = await runSuggestionWriter(client);
    expect(result.error).toBeUndefined();
    expect(result.rows_skipped_basis_mismatch).toBe(2);
    expect(result.suggestions_inserted).toBe(1);
    expect((inserts as Array<{ metric_id: string }>).map((r) => r.metric_id)).toEqual(['sg_putting']);
  });
});

describe('isWorseThanAnchor', () => {
  it('higher_better: behind only when below the anchor', () => {
    expect(isWorseThanAnchor(40, 50, 'higher_better')).toBe(true);
    expect(isWorseThanAnchor(50, 50, 'higher_better')).toBe(false);
    expect(isWorseThanAnchor(55, 50, 'higher_better')).toBe(false);
  });

  it('lower_better: behind only when above the anchor', () => {
    expect(isWorseThanAnchor(26, 18, 'lower_better')).toBe(true);
    expect(isWorseThanAnchor(18, 18, 'lower_better')).toBe(false);
    expect(isWorseThanAnchor(17, 18, 'lower_better')).toBe(false);
  });

  it('non-finite inputs are never "behind"', () => {
    expect(isWorseThanAnchor(Number.NaN, 18, 'lower_better')).toBe(false);
    expect(isWorseThanAnchor(20, Number.POSITIVE_INFINITY, 'lower_better')).toBe(false);
  });
});

describe('reconcileSuggestionsForPlayer', () => {
  function draft(metric_id: string, severity: number): SuggestionDraft {
    return { player_id: 'p1', metric_id: metric_id as SuggestionDraft['metric_id'], suggested_target_value: 0.3, severity };
  }

  it('defaults to ONE active pending suggestion per player (audit row 21)', () => {
    expect(MAX_ACTIVE_PENDING_PER_PLAYER).toBe(1);
    const plan = reconcileSuggestionsForPlayer({
      existing: [],
      candidates: [draft('sg_approach', 0.5), draft('sg_putting', 0.4)],
      severityByExistingMetric: new Map(),
    });
    expect(plan.toInsert.map((d) => d.metric_id)).toEqual(['sg_approach']);
  });

  // The cases below exercise the reconcile rules with two slots (cap: 2) —
  // the rules are cap-general; only the default changed.
  it('never produces more than `cap` active pending suggestions per player', () => {
    // No existing rows; 5 candidates → only top 2 inserted.
    const plan = reconcileSuggestionsForPlayer({
      existing: [],
      candidates: [
        draft('sg_approach', 0.5),
        draft('sg_putting', 0.4),
        draft('sg_ott', 0.3),
        draft('sg_total', 0.2),
        draft('sg_around_green', 0.1),
      ],
      severityByExistingMetric: new Map(),
      cap: 2,
    });
    expect(plan.toInsert).toHaveLength(2);
    expect(plan.toInsert.map((d) => d.metric_id)).toEqual(['sg_approach', 'sg_putting']);
    expect(plan.toExpireIds).toEqual([]);
  });

  it('is idempotent — re-running with the same two pending rows inserts/expires nothing', () => {
    const plan = reconcileSuggestionsForPlayer({
      existing: [
        { id: 's-app', metric_id: 'sg_approach' },
        { id: 's-put', metric_id: 'sg_putting' },
      ],
      // Same metrics still appear as candidates (writer no longer pre-excludes).
      candidates: [draft('sg_approach', 0.5), draft('sg_putting', 0.4)],
      severityByExistingMetric: new Map([
        ['sg_approach', 0.5],
        ['sg_putting', 0.4],
      ]),
      cap: 2,
    });
    expect(plan.toInsert).toEqual([]);
    expect(plan.toExpireIds).toEqual([]);
  });

  it('replaces a lower-ranked stale pending suggestion with a higher-ranked candidate', () => {
    // Existing weak row (sev 0.1) competes with a strong new candidate (sev 0.9).
    // Cap is 2: keep the strong existing (0.5) + the strong candidate (0.9),
    // expire the weak existing (0.1).
    const plan = reconcileSuggestionsForPlayer({
      existing: [
        { id: 's-strong', metric_id: 'sg_approach' },
        { id: 's-weak', metric_id: 'sg_around_green' },
      ],
      candidates: [draft('sg_putting', 0.9), draft('sg_approach', 0.5), draft('sg_around_green', 0.1)],
      severityByExistingMetric: new Map([
        ['sg_approach', 0.5],
        ['sg_around_green', 0.1],
      ]),
      cap: 2,
    });
    expect(plan.toInsert.map((d) => d.metric_id)).toEqual(['sg_putting']);
    expect(plan.toExpireIds).toEqual(['s-weak']);
  });

  it('expires a pending suggestion whose metric is no longer a valid target (stale)', () => {
    // sg_around_green has no live severity (absent from the map) → expire it,
    // and fill the freed slot with the best remaining candidate.
    const plan = reconcileSuggestionsForPlayer({
      existing: [
        { id: 's-keep', metric_id: 'sg_approach' },
        { id: 's-stale', metric_id: 'sg_around_green' },
      ],
      candidates: [draft('sg_putting', 0.3), draft('sg_approach', 0.5)],
      severityByExistingMetric: new Map([['sg_approach', 0.5]]), // around_green omitted = stale
      cap: 2,
    });
    expect(plan.toExpireIds).toEqual(['s-stale']);
    expect(plan.toInsert.map((d) => d.metric_id)).toEqual(['sg_putting']);
  });

  it('never double-suggests a metric already held by a kept existing row', () => {
    // Candidate for sg_approach exists but sg_approach is already pending & kept.
    const plan = reconcileSuggestionsForPlayer({
      existing: [{ id: 's-app', metric_id: 'sg_approach' }],
      candidates: [draft('sg_approach', 0.9), draft('sg_putting', 0.2)],
      severityByExistingMetric: new Map([['sg_approach', 0.5]]),
      cap: 2,
    });
    // sg_approach kept (existing), sg_putting added → fills the 2nd slot.
    expect(plan.toInsert.map((d) => d.metric_id)).toEqual(['sg_putting']);
    expect(plan.toExpireIds).toEqual([]);
  });
});

describe('runSuggestionWriter — reconciliation (P1-08)', () => {
  it('expires a stale pending row and inserts a stronger candidate in its place', async () => {
    const { client, inserts } = makeSupabase({
      metrics: [
        { metric_id: 'sg_putting', direction: 'higher_better', active: true },
        { metric_id: 'sg_approach', direction: 'higher_better', active: true },
      ],
      drills: [{ impacts_metric_id: 'sg_putting' }, { impacts_metric_id: 'sg_approach' }],
      standings: [
        // Strong gap on putting; approach is now even (no gap) → its pending row is stale.
        { player_id: 'A', metric_id: 'sg_putting', player_value: 0.0, pga_value: 0.5, pga_delta: -0.5 },
        { player_id: 'A', metric_id: 'sg_approach', player_value: 0.5, pga_value: 0.5, pga_delta: 0 },
      ],
      activeGoals: [],
      pendingSuggestions: [
        {
          id: 's-app',
          player_id: 'A',
          metric_id: 'sg_approach', // stale — player caught up to baseline
          state: 'pending',
          expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        },
      ],
    });

    const result = await runSuggestionWriter(client);
    expect(result.error).toBeUndefined();
    expect(result.suggestions_expired).toBe(1);
    expect(result.suggestions_inserted).toBe(1);
    expect((inserts[0] as { metric_id: string }).metric_id).toBe('sg_putting');
  });
});

describe('cohort anchor (audit row 21, owner decision 2026-09-28)', () => {
  const base = { player_id: 'p1', pga_delta: null, direction: 'higher_better' as const };
  const select = (standings: StandingRowWithDirection[]) =>
    selectSuggestionsForPlayer({
      player_id: 'p1',
      standings,
      metricsWithDrillCoverage: new Set(standings.map((s) => s.metric_id)),
      activeGoalMetrics: new Set(),
      pendingSuggestionMetrics: new Set(),
      maxSuggestions: 5,
    });

  it('does not ask a player already past their cohort to chase the Tour', () => {
    // -0.5 is behind the Tour (0) but ahead of the cohort (-1.2).
    expect(
      select([{ ...base, metric_id: 'sg_putting', player_value: -0.5, pga_value: 0, level_avg: -1.2, level_n: 40, level_pct: 70 }]),
    ).toEqual([]);
  });

  it('aims halfway to the cohort, not to the Tour', () => {
    const [d] = select([
      { ...base, metric_id: 'sg_putting', player_value: -3, pga_value: 0, level_avg: -1, level_n: 40, level_pct: 12 },
    ]);
    expect(d?.suggested_target_value).toBeCloseTo(-2, 6);
  });

  it('ranks by cohort percentile, so units do not decide (feet vs strokes)', () => {
    const drafts = select([
      { ...base, metric_id: 'penalty_rate_per_round', direction: 'lower_better', player_value: 1.4, pga_value: 0.3, level_avg: 0.9, level_n: 40, level_pct: 8 },
      { ...base, metric_id: 'gir_pct', player_value: 40, pga_value: 66, level_avg: 60, level_n: 40, level_pct: 30 },
    ]);
    expect(drafts.map((x) => x.metric_id)).toEqual(['penalty_rate_per_round', 'gir_pct']);
  });

  it('skips a cohort of fewer than 5 players and metrics a goal cannot track', () => {
    expect(
      select([
        { ...base, metric_id: 'sg_putting', player_value: -3, pga_value: 0, level_avg: -1, level_n: 3, level_pct: 10 },
        { ...base, metric_id: 'scoring_par_4', direction: 'lower_better', player_value: 4.6, pga_value: 3.97, level_avg: 4.2, level_n: 40, level_pct: 5 },
      ]),
    ).toEqual([]);
  });
});
