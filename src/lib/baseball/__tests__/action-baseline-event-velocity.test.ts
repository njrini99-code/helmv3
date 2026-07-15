// =============================================================================
// #852 residual: buildActionOutcomeSeed must thread event-derived velocity
// into its baseline capture -- a box-score-migrated player's baseline must
// read the elite event layer (never a legacy scalar) per #379 design rule 4,
// while a zero-event player's legacy scalar keeps seeding the ledger exactly
// as before.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { buildActionOutcomeSeed, type BaselineClient } from '@/lib/baseball/coachhelm/action-baseline';

const TEAM = 'team-1';

/**
 * Minimal in-memory Supabase-shaped stub with REAL filtering (eq/in/is mutate
 * the row set), matching action-baseline.test.ts's established style.
 */
function makeClient(tables: {
  baseball_player_stats?: Array<Record<string, unknown>>;
  baseball_games?: Array<Record<string, unknown>>;
  baseball_box_score_batting?: Array<Record<string, unknown>>;
  baseball_box_score_pitching?: Array<Record<string, unknown>>;
  baseball_pitch_events?: Array<Record<string, unknown>>;
  baseball_batted_ball_events?: Array<Record<string, unknown>>;
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

describe('buildActionOutcomeSeed — #852 event-derived velocity wiring', () => {
  it('captures the baseline from event-derived avg exit velocity, WINNING over the legacy scalar for the same player', async () => {
    const client = makeClient({
      baseball_player_stats: [
        {
          id: 's1', team_id: TEAM, player_id: 'p1', stat_type: 'game', session_date: '2026-04-01',
          at_bats: 4, hits: 1, walks: 0, strikeouts: 1, exit_velocity: 80,
        },
      ],
      baseball_batted_ball_events: [
        { id: 'bb1', team_id: TEAM, batter_id: 'p1', exit_velocity: 100, measured_at: '2026-04-01T00:00:00.000Z', superseded_by_run_id: null },
        { id: 'bb2', team_id: TEAM, batter_id: 'p1', exit_velocity: 104, measured_at: '2026-04-02T00:00:00.000Z', superseded_by_run_id: null },
      ],
    });

    const seed = await buildActionOutcomeSeed(client, TEAM, 'p1', 'avg_exit_velocity');
    expect(seed.outcome_metric).toBe('avg_exit_velocity');
    // (100 + 104) / 2 = 102, NOT the legacy scalar of 80.
    expect(seed.outcome_baseline_value).toBe(102);
    expect(seed.outcome_verdict).toBeNull();
  });

  it('falls back to the legacy exit-velocity scalar for a player with zero event rows', async () => {
    const client = makeClient({
      baseball_player_stats: [
        {
          id: 's2', team_id: TEAM, player_id: 'p2', stat_type: 'game', session_date: '2026-04-01',
          at_bats: 4, hits: 1, walks: 0, strikeouts: 1, exit_velocity: 90,
        },
      ],
      baseball_batted_ball_events: [],
    });

    const seed = await buildActionOutcomeSeed(client, TEAM, 'p2', 'avg_exit_velocity');
    expect(seed.outcome_metric).toBe('avg_exit_velocity');
    expect(seed.outcome_baseline_value).toBe(90);
    expect(seed.outcome_verdict).toBeNull();
  });
});
