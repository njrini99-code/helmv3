/** Serializable vitals snapshot from `golf_player_stats_cache` for roster teasers. */
export interface FairwayPlayerStatsSummary {
  rounds_played: number;
  scoring_average: number | null;
  gir_pct: number | null;
  fairway_pct: number | null;
  putts_per_round: number | null;
  best_round: number | null;
  sg_total: number | null;
  trend: 'improving' | 'declining' | 'stable' | null;
}

type StatsCacheRow = {
  rounds_played: number | null;
  scoring_average: number | null;
  gir_percentage: number | null;
  driving_accuracy_percentage: number | null;
  putts_per_round: number | null;
  best_round: number | null;
  strokes_gained_total: number | null;
  trend_direction: string | null;
};

function trendOf(raw: string | null | undefined): FairwayPlayerStatsSummary['trend'] {
  if (raw === 'improving' || raw === 'declining' || raw === 'stable') return raw;
  return null;
}

export function statsSummaryFromCache(row: StatsCacheRow | null | undefined): FairwayPlayerStatsSummary | null {
  if (!row) return null;
  return {
    rounds_played: row.rounds_played ?? 0,
    scoring_average: row.scoring_average ?? null,
    gir_pct: row.gir_percentage ?? null,
    fairway_pct: row.driving_accuracy_percentage ?? null,
    putts_per_round: row.putts_per_round ?? null,
    best_round: row.best_round ?? null,
    sg_total: row.strokes_gained_total ?? null,
    trend: trendOf(row.trend_direction),
  };
}

export function formatSgTotal(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  if (Math.abs(value) < 0.005) return 'E';
  const fixed = Math.abs(value).toFixed(2);
  return value > 0 ? `+${fixed}` : `−${fixed}`;
}
