// =============================================================================
// #852 residual: sweepActionOutcomes must thread event-derived velocity into
// its per-action `loadPlayerMetrics` call, scoped to the SAME after-window
// honesty rule as the box-score read (measured strictly after the action's
// created_at) -- a pre-action batted-ball event must never count toward
// "did it move" measurement.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { sweepActionOutcomes } from '@/lib/baseball/coachhelm/outcome-sweep';

const TEAM = 'team-1';

interface UpdateCall {
  table: string;
  payload: Record<string, unknown>;
}

/**
 * Minimal chainable Supabase fake with REAL filtering (eq/in/is mutate the
 * in-scope row set) so the after-window date filter inside sweepActionOutcomes
 * is exercised honestly, not just smoke-tested.
 */
function makeClient(opts: {
  actions: Array<Record<string, unknown>>;
  stats: Array<Record<string, unknown>>;
  battedBallEvents?: Array<Record<string, unknown>>;
  pitchEvents?: Array<Record<string, unknown>>;
  updates: UpdateCall[];
}) {
  function from(table: string) {
    let rows: Array<Record<string, unknown>> =
      table === 'baseball_actions'
        ? opts.actions
        : table === 'baseball_player_stats'
          ? opts.stats
          : table === 'baseball_batted_ball_events'
            ? (opts.battedBallEvents ?? [])
            : table === 'baseball_pitch_events'
              ? (opts.pitchEvents ?? [])
              : [];
    const state: { isUpdate: boolean; payload: Record<string, unknown> | null } = {
      isUpdate: false,
      payload: null,
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] === val);
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        rows = rows.filter((r) => vals.includes(r[col]));
        return builder;
      },
      is: (col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] === val);
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      update(payload: Record<string, unknown>) {
        state.isUpdate = true;
        state.payload = payload;
        return builder;
      },
      then(resolve: (v: { data: unknown; error: null }) => unknown) {
        if (state.isUpdate && state.payload) {
          opts.updates.push({ table, payload: state.payload });
          return resolve({ data: null, error: null });
        }
        return resolve({ data: rows, error: null });
      },
    };
    return builder;
  }
  return { from } as unknown as Parameters<typeof sweepActionOutcomes>[0];
}

describe('sweepActionOutcomes — #852 event-derived velocity wiring', () => {
  it('measures avg_exit_velocity from event-derived data, WINNING over the after-window legacy scalar for the same player', async () => {
    const actions = [
      {
        id: 'act-1',
        team_id: TEAM,
        player_id: 'p1',
        created_at: '2026-01-01T00:00:00.000Z',
        outcome_metric: 'avg_exit_velocity',
        outcome_baseline_value: 80,
        outcome_observed_value: null,
        signal_id: null,
        status: 'open',
      },
    ];
    // Legacy after-window box-score row would give avg_exit_velocity = 80.
    const stats = [
      {
        id: 's1', team_id: TEAM, player_id: 'p1', stat_type: 'game', session_date: '2026-03-01',
        at_bats: 4, hits: 1, walks: 0, strikeouts: 1, exit_velocity: 80,
      },
    ];
    const battedBallEvents = [
      { id: 'bb1', team_id: TEAM, batter_id: 'p1', exit_velocity: 100, measured_at: '2026-03-01T00:00:00.000Z', superseded_by_run_id: null },
      { id: 'bb2', team_id: TEAM, batter_id: 'p1', exit_velocity: 104, measured_at: '2026-03-05T00:00:00.000Z', superseded_by_run_id: null },
      // BEFORE the action's created_at -- must be EXCLUDED by the after-window
      // filter. If wrongly included, the average would shift far from 102.
      { id: 'bb-before', team_id: TEAM, batter_id: 'p1', exit_velocity: 20, measured_at: '2025-12-01T00:00:00.000Z', superseded_by_run_id: null },
    ];
    const updates: UpdateCall[] = [];
    const client = makeClient({ actions, stats, battedBallEvents, updates });

    const res = await sweepActionOutcomes(client, TEAM);
    expect(res.measured).toBe(1);

    const actionUpdate = updates.find((u) => u.table === 'baseball_actions');
    // (100 + 104) / 2 = 102 -- the event-derived value, NOT the legacy 80, and
    // NOT skewed by the pre-action bb-before row.
    expect(actionUpdate?.payload.outcome_observed_value).toBe(102);
    expect(actionUpdate?.payload.outcome_sample_n).toBe(2);
  });

  it('falls back to the legacy exit-velocity scalar for a player with zero event rows', async () => {
    const actions = [
      {
        id: 'act-2',
        team_id: TEAM,
        player_id: 'p2',
        created_at: '2026-01-01T00:00:00.000Z',
        outcome_metric: 'avg_exit_velocity',
        outcome_baseline_value: 70,
        outcome_observed_value: null,
        signal_id: null,
        status: 'open',
      },
    ];
    const stats = [
      {
        id: 's2', team_id: TEAM, player_id: 'p2', stat_type: 'game', session_date: '2026-03-01',
        at_bats: 4, hits: 1, walks: 0, strikeouts: 1, exit_velocity: 90,
      },
    ];
    const updates: UpdateCall[] = [];
    // No batted-ball events at all for p2 -- honest legacy fallback.
    const client = makeClient({ actions, stats, battedBallEvents: [], updates });

    const res = await sweepActionOutcomes(client, TEAM);
    expect(res.measured).toBe(1);

    const actionUpdate = updates.find((u) => u.table === 'baseball_actions');
    expect(actionUpdate?.payload.outcome_observed_value).toBe(90);
  });
});
