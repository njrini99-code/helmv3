/**
 * Team correlations: computes Pearson correlations across team players'
 * cached stats so the Intelligence Hub Correlations tab shows real data
 * instead of hardcoded placeholders.
 *
 * Reads `golf_player_stats_cache` (one row per player). Pairs we compute
 * are limited to the highest-signal coaching relationships:
 *   - driving_accuracy_percentage   ↔  gir_percentage      (Fairways → Greens)
 *   - putts_per_round               ↔  scoring_average     (Putting → Score)
 *   - scrambling_percentage         ↔  scoring_average     (Scrambling → Score)
 *   - three_putt_percentage         ↔  scoring_average     (3-Putts → Score)
 *
 * We need at least 4 players with non-null values on BOTH sides of a
 * pair before reporting a correlation (n<4 = noise). Anything that
 * doesn't clear the threshold is omitted.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface RealCorrelation {
  id: string;
  title: string;
  description: string;
  metrics: [string, string];
  /** Pearson r in [-1, 1]. */
  correlation: number;
  /** Rough strokes-per-round impact estimate, used by the UI for sorting. */
  strokeImpact: number;
  /** Number of players whose data contributed. */
  playerCount: number;
}

const MIN_PLAYERS = 4;

interface PlayerStatsRow {
  player_id: string;
  driving_accuracy_percentage: number | null;
  gir_percentage: number | null;
  putts_per_round: number | null;
  scoring_average: number | null;
  scrambling_percentage: number | null;
  three_putt_percentage: number | null;
}

interface PairDef {
  id: string;
  title: string;
  description: (r: number) => string;
  metricA: keyof PlayerStatsRow;
  metricB: keyof PlayerStatsRow;
  /** Multiplier applied to |r| to estimate stroke impact. */
  strokeWeight: number;
}

const PAIRS: PairDef[] = [
  {
    id: 'fairway-gir',
    title: 'Fairways → Greens Hit',
    metricA: 'driving_accuracy_percentage',
    metricB: 'gir_percentage',
    description: (r) =>
      r >= 0
        ? `Players who hit more fairways consistently hit more greens (r=${r.toFixed(2)}). Tee accuracy sets up easier approaches.`
        : `Hitting fairways is not currently translating to greens for this team (r=${r.toFixed(2)}). Worth reviewing approach distance control.`,
    strokeWeight: 0.8,
  },
  {
    id: 'putts-score',
    title: 'Putts/Round → Scoring Average',
    metricA: 'putts_per_round',
    metricB: 'scoring_average',
    description: (r) =>
      r >= 0
        ? `Higher putts/round drive higher scores (r=${r.toFixed(2)}). Reducing putts is the fastest path to lower scores for this team.`
        : `Unusual: more putts is not raising scores here (r=${r.toFixed(2)}). Likely small sample.`,
    strokeWeight: 1.0,
  },
  {
    id: 'scramble-score',
    title: 'Scrambling % → Scoring Average',
    metricA: 'scrambling_percentage',
    metricB: 'scoring_average',
    description: (r) =>
      r <= 0
        ? `Better scramblers post lower scores (r=${r.toFixed(2)}). Short-game work pays off when greens are missed.`
        : `Scrambling is not currently saving strokes (r=${r.toFixed(2)}). Worth checking proximity from rough.`,
    strokeWeight: 0.7,
  },
  {
    id: 'three-putt-score',
    title: '3-Putt % → Scoring Average',
    metricA: 'three_putt_percentage',
    metricB: 'scoring_average',
    description: (r) =>
      r >= 0
        ? `3-putts are the dominant scoring penalty for this team (r=${r.toFixed(2)}). Lag-putting drills are high-leverage.`
        : `3-putts are not driving scoring variation here (r=${r.toFixed(2)}). Other factors dominate.`,
    strokeWeight: 0.9,
  },
];

/**
 * Compute team correlations directly from the cached stats. Returns an
 * empty array on error — callers fall back to "no data yet" UX.
 */
export async function computeTeamCorrelations(
  supabase: SupabaseClient,
  teamId: string,
): Promise<RealCorrelation[]> {
  // Players on the team
  const { data: memberRows, error: memberErr } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('status', 'active');

  if (memberErr || !memberRows || memberRows.length === 0) return [];

  const playerIds = memberRows
    .map((r) => (r as { player_id: string | null }).player_id)
    .filter((id): id is string => !!id);
  if (playerIds.length < MIN_PLAYERS) return [];

  const { data: statsData, error: statsErr } = await supabase
    .from('golf_player_stats_cache')
    .select(
      'player_id, driving_accuracy_percentage, gir_percentage, putts_per_round, scoring_average, scrambling_percentage, three_putt_percentage',
    )
    .in('player_id', playerIds);

  if (statsErr || !statsData || statsData.length === 0) return [];

  const rows = statsData as unknown as PlayerStatsRow[];

  const out: RealCorrelation[] = [];

  for (const pair of PAIRS) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const row of rows) {
      const a = row[pair.metricA];
      const b = row[pair.metricB];
      if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)) {
        xs.push(a);
        ys.push(b);
      }
    }

    if (xs.length < MIN_PLAYERS) continue;

    const r = pearson(xs, ys);
    if (r === null) continue;

    out.push({
      id: `team-${teamId}-${pair.id}`,
      title: pair.title,
      description: pair.description(r),
      metrics: [pair.metricA as string, pair.metricB as string],
      correlation: r,
      strokeImpact: Math.abs(r) * pair.strokeWeight,
      playerCount: xs.length,
    });
  }

  // Sort by strongest signal.
  out.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  return out;
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i] as number;
    sumY += ys[i] as number;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denomX = 0;
  let denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] as number) - meanX;
    const dy = (ys[i] as number) - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  if (denom === 0) return null;
  const r = num / denom;
  if (!Number.isFinite(r)) return null;
  return Math.max(-1, Math.min(1, r));
}
