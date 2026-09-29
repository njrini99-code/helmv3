/**
 * Audit row 10 — weekly coach recap numbers.
 * 'Insights surfaced' counted rows CREATED in the week (15) while 474 of 521
 * visible insights were refreshed that week, and rounds were not filtered by
 * isCountableRound.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/coachhelm/v3/insight-visibility', () => ({
  applyInsightVisibility: <Q,>(q: Q) => q,
}));

import { buildWeeklyRecap } from '@/lib/coachhelm/v3/recap/builder';

/** Chainable stub: every filter is a no-op, awaiting resolves the table's rows.
 *  The builder classifies rows itself, so filters don't need emulating. */
function stubSb(tables: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'lt', 'gt', 'is', 'or', 'neq', 'order', 'limit']) {
        chain[m] = () => chain;
      }
      chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: rows, error: null, count: rows.length });
      return chain;
    },
  } as never;
}

const eighteen = (score_to_par: number, total_score: number) => ({
  holes_played: 18,
  total_score,
  front_nine: Math.floor(total_score / 2),
  back_nine: total_score - Math.floor(total_score / 2),
  total_putts: 30,
  score_to_par,
});

describe('buildWeeklyRecap', () => {
  it('splits insights into new vs updated this week and drops non-countable rounds', async () => {
    const recap = await buildWeeklyRecap(
      stubSb({
        golf_teams: [{ name: 'Team' }],
        golf_coaches: [{ full_name: 'Casey Coach' }],
        golf_team_members: [{ player_id: 'p1', player: { id: 'p1', first_name: 'A', last_name: 'B' } }],
        golf_rounds: [
          { player_id: 'p1', ...eighteen(2, 74) },
          { player_id: 'p1', ...eighteen(4, 76) },
          // 37-stroke 18-hole round: implausible, not countable
          { player_id: 'p1', ...eighteen(-35, 37) },
        ],
        golf_coach_insights: [
          // created this week
          { insight_type: 'putt_distance', player_id: 'p1', created_at: '2026-09-25T10:00:00Z', updated_at: '2026-09-26T10:00:00Z' },
          // created before, refreshed this week
          { insight_type: 'approach_miss', player_id: 'p1', created_at: '2026-08-01T10:00:00Z', updated_at: '2026-09-24T10:00:00Z' },
          // created before, not touched this week
          { insight_type: 'par_scoring', player_id: 'p1', created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-02T10:00:00Z' },
        ],
        golf_goals: [],
      }),
      { coach_id: 'c1', team_id: 't1', week_end_iso: '2026-09-27T23:00:00Z' },
    );

    expect(recap).not.toBeNull();
    expect(recap!.totals.rounds_played).toBe(2);
    expect(recap!.totals.avg_score_to_par).toBe(3);
    expect(recap!.totals.insights_new).toBe(1);
    expect(recap!.totals.insights_updated).toBe(1);
    expect(recap!.top_patterns.map((p) => p.insight_type).sort()).toEqual(['approach_miss', 'putt_distance']);
  });
});
