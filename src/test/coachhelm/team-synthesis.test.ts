/**
 * The coach's signals feed has always had a Team bucket, and nothing has ever
 * put anything in it.
 *
 * `groupSignals` buckets by `playerId ?? '__team__'` and PINS the team bucket
 * first — the surface was built for roster-wide signals. Measured against
 * production 2026-08-18: of 615 rows in `golf_coach_insights`, `player_id IS
 * NULL` on ZERO, and `category = 'team_trend'` on ZERO. The bucket has been
 * empty since it was written.
 *
 * WHAT A TEAM SIGNAL IS NOT. The obvious synthesis — "several players share
 * this insight" — is noise here, and the data says so: all 12 Guilford players
 * carry an `approach_proximity_175_plus_ft` insight, because the generator
 * emits one per player whether or not it is a leak. Shared PRESENCE measures
 * coverage, not a team pattern.
 *
 * WHAT IT IS. Shared RECOVERABLE STROKES. Grouping active insights by metric
 * and summing |strokes_impact| across the roster:
 *
 *     Guilford, active insights          players   combined strokes/round
 *     practice_tournament_delta              4            18.01
 *     putts_made_3_5ft_pct                   6             9.95
 *     scrambling_pct_sand                    5             6.27
 *     putts_made_5_10ft_pct                  6             5.09
 *
 * "Six of your twelve are leaking a combined 9.95 strokes a round inside five
 * feet" is a practice-block decision, and no per-player card makes it.
 *
 * This composes with the `readStrokeImpact` fix in the same series: until the
 * feed read stroke impact off `evidence`, every one of these sums would have
 * been zero.
 */
import { describe, it, expect } from 'vitest';
import { synthesizeTeamSignals, TEAM_SIGNAL_MIN_PLAYERS } from '@/lib/coachhelm/v3/insights/team-synthesis';
import type { GroupedSignal } from '@/lib/coachhelm/signal-grouping';

function sig(
  playerId: string,
  metric: string,
  strokeImpact: number | null,
  over: Partial<GroupedSignal> = {},
): GroupedSignal {
  return {
    id: `${playerId}:${metric}`,
    kind: 'insight',
    category: 'putting',
    severity: 'medium',
    title: `${metric} leak`,
    claim: 'A leak.',
    ageDays: 3,
    status: 'active',
    strokeImpact,
    playerId,
    supersededCount: 0,
    evidence: { metric, metric_label: 'Putts Made 3-5 ft' },
    ...over,
  };
}

describe('synthesizeTeamSignals', () => {
  it('emits one team signal for a leak shared across the roster', () => {
    const team = synthesizeTeamSignals([
      sig('p1', 'putts_made_3_5ft_pct', 2.0),
      sig('p2', 'putts_made_3_5ft_pct', 1.5),
      sig('p3', 'putts_made_3_5ft_pct', 1.0),
    ]);

    expect(team).toHaveLength(1);
    expect(team[0]!.playerId).toBeNull();
    expect(team[0]!.strokeImpact).toBeCloseTo(4.5, 5);
    expect(team[0]!.claim).toMatch(/3 players/);
  });

  it('names the metric label a coach would recognize, not the metric id', () => {
    const team = synthesizeTeamSignals([
      sig('p1', 'putts_made_3_5ft_pct', 2.0),
      sig('p2', 'putts_made_3_5ft_pct', 1.5),
      sig('p3', 'putts_made_3_5ft_pct', 1.0),
    ]);

    expect(team[0]!.title).toMatch(/Putts Made 3-5 ft/);
  });

  it('stays silent below the shared-player floor — two players is not a team pattern', () => {
    const team = synthesizeTeamSignals([
      sig('p1', 'putts_made_3_5ft_pct', 2.0),
      sig('p2', 'putts_made_3_5ft_pct', 1.5),
    ]);

    expect(team).toEqual([]);
    expect(TEAM_SIGNAL_MIN_PLAYERS).toBe(3);
  });

  it('counts a player once even when they carry the metric twice', () => {
    const team = synthesizeTeamSignals([
      sig('p1', 'putts_made_3_5ft_pct', 2.0, { id: 'a' }),
      sig('p1', 'putts_made_3_5ft_pct', 2.0, { id: 'b' }),
      sig('p2', 'putts_made_3_5ft_pct', 1.5),
    ]);

    // Two distinct players — below the floor, so nothing is emitted.
    expect(team).toEqual([]);
  });

  it('ignores shared PRESENCE with no recoverable strokes behind it', () => {
    // The 12-of-12 approach_proximity case: everyone has the insight, nobody
    // has a measured leak. Coverage is not a signal.
    const team = synthesizeTeamSignals([
      sig('p1', 'approach_proximity_175_plus_ft', null),
      sig('p2', 'approach_proximity_175_plus_ft', null),
      sig('p3', 'approach_proximity_175_plus_ft', 0),
      sig('p4', 'approach_proximity_175_plus_ft', null),
    ]);

    expect(team).toEqual([]);
  });

  it('requires the floor in players who actually carry a leak, not merely the metric', () => {
    const team = synthesizeTeamSignals([
      sig('p1', 'putts_made_3_5ft_pct', 2.0),
      sig('p2', 'putts_made_3_5ft_pct', null),
      sig('p3', 'putts_made_3_5ft_pct', null),
    ]);

    expect(team).toEqual([]);
  });

  it('ranks the biggest combined leak first', () => {
    const team = synthesizeTeamSignals([
      ...['p1', 'p2', 'p3'].map((p) => sig(p, 'scrambling_pct_sand', 2.0)),
      ...['p1', 'p2', 'p3', 'p4'].map((p) => sig(p, 'putts_made_3_5ft_pct', 3.0)),
    ]);

    expect(team.map((t) => t.strokeImpact)).toEqual([12, 6]);
  });

  it('sums magnitude — a leak is material in either direction', () => {
    const team = synthesizeTeamSignals([
      sig('p1', 'putts_made_3_5ft_pct', -2.0),
      sig('p2', 'putts_made_3_5ft_pct', 1.5),
      sig('p3', 'putts_made_3_5ft_pct', -1.0),
    ]);

    expect(team[0]!.strokeImpact).toBeCloseTo(4.5, 5);
  });

  it('never synthesizes from an existing team-scoped signal', () => {
    // Guards against a second pass folding its own output back in.
    const alreadyTeam: GroupedSignal[] = ['a', 'b', 'c'].map((id) => ({
      ...sig('x', 'putts_made_3_5ft_pct', 2),
      id,
      playerId: null,
    }));

    expect(synthesizeTeamSignals(alreadyTeam)).toEqual([]);
  });

  it('skips signals with no metric on their evidence', () => {
    const team = synthesizeTeamSignals([
      sig('p1', 'm', 2, { evidence: null }),
      sig('p2', 'm', 2, { evidence: null }),
      sig('p3', 'm', 2, { evidence: null }),
    ]);

    expect(team).toEqual([]);
  });
});

/**
 * A roll-up must be distinguishable from a detection.
 *
 * Emitting these as `kind: 'insight'` caused two live regressions the moment
 * they reached the feed, both found by rendering the real component:
 *
 *   - `TeamSignalSummary` flattens every group INCLUDING the pinned team
 *     bucket and sums `strokeImpact`. Three leaks totalling 4.5 rendered as
 *     "4 live | 9.0 est. strokes" — each leak counted once on its player and
 *     again inside the roster total synthesized from it.
 *   - `TriageDesk.runSignalAction` passes `signal.id` to
 *     acknowledgeInsight/dismissInsight. These ids are synthetic
 *     (`team:<metric>`) and match no row.
 *
 * The `kind` is what lets aggregates skip them and actions refuse them.
 */
describe('synthesizeTeamSignals — roll-ups are typed as roll-ups', () => {
  it('marks every emitted signal team_synthesis, never insight', () => {
    const team = synthesizeTeamSignals([
      sig('p1', 'putts_made_3_5ft_pct', 2.0),
      sig('p2', 'putts_made_3_5ft_pct', 1.5),
      sig('p3', 'putts_made_3_5ft_pct', 1.0),
    ]);

    expect(team).toHaveLength(1);
    expect(team[0]!.kind).toBe('team_synthesis');
  });

  it('still refuses to fold a roll-up back in on a second pass', () => {
    const once = synthesizeTeamSignals([
      sig('p1', 'putts_made_3_5ft_pct', 2.0),
      sig('p2', 'putts_made_3_5ft_pct', 1.5),
      sig('p3', 'putts_made_3_5ft_pct', 1.0),
    ]);
    expect(synthesizeTeamSignals(once)).toEqual([]);
  });
});
