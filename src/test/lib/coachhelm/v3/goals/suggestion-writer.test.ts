/**
 * Unit tests for v3 W19 goal-suggestion writer + evaluator.
 *
 * Covers:
 *   - selectSuggestionsForPlayer (pure)
 *     * skips metrics with an active goal already targeting them
 *     * skips metrics without drill coverage
 *     * caps at maxSuggestions (default 2)
 *     * ranks worst-first via direction-aware severity
 *     * skips players who are at or above PGA baseline
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
  DEFAULT_SUGGESTION_TTL_DAYS,
  type StandingRowWithDirection,
} from '@/lib/coachhelm/v3/goals/suggestion-writer';

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
    };
  }

  it('caps at 2 suggestions per player by default, worst-first', () => {
    // Make 5 candidates, all higher_better, all below PGA, all drilled.
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

    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => d.metric_id)).toEqual(['sg_approach', 'sg_putting']);
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

  it('skips players at or above baseline (no improvement gap)', () => {
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
  it('returns the midpoint between player and PGA values', () => {
    expect(computeTargetValue({ playerValue: 0.1, pgaValue: 0.5 })).toBeCloseTo(0.3, 6);
  });
  it('works downwards (lower_better case still numerically correct)', () => {
    expect(computeTargetValue({ playerValue: 0.8, pgaValue: 0.3 })).toBeCloseTo(0.55, 6);
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
        return { data: opts.standings ?? [], error: null };
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

  it('inserts up to 2 suggestions per eligible player', async () => {
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
        // playerA: 3 weak metrics → expect top 2.
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
    expect(result.suggestions_inserted).toBe(2);
    expect(inserts).toHaveLength(2);

    const insertedMetrics = (inserts as Array<{ metric_id: string }>).map((r) => r.metric_id);
    expect(insertedMetrics.sort()).toEqual(['sg_approach', 'sg_putting']);

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
