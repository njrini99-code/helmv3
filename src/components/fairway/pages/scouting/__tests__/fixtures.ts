import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { ScoutingRound } from '../scouting-model';

type EvidenceOverrides = Partial<EvidenceInsight['evidence']>;

let seq = 0;

export function makeInsight(
  overrides: Partial<Omit<EvidenceInsight, 'evidence'>> & { evidence?: EvidenceOverrides } = {},
): EvidenceInsight {
  seq += 1;
  const { evidence, ...rest } = overrides;
  return {
    id: `ins-${seq}`,
    player_id: 'p-1',
    category: 'putting',
    title: `5-10 ft putting: 35% (${seq})`,
    content: 'Across the window, putts from 5-10 ft drop at 35%.',
    signature: null,
    metadata: null,
    lifecycle_state: 'detected',
    status: 'active',
    priority: 'medium',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-09-13T12:00:00.000Z',
    updated_at: '2026-09-13T12:00:00.000Z',
    ...rest,
    evidence: {
      metric: 'putts_made_5_10ft_pct',
      metric_label: 'Putts Made 5-10 ft',
      unit: 'percent',
      your_value: 34.5,
      your_value_display: '35%',
      comparison_value: 62.2,
      comparison_label: 'PGA Tour avg',
      comparison_source: 'pga_baseline',
      sample_n: 55,
      window_days: 78,
      window_start: '2026-06-27T12:00:00.000Z',
      window_end: '2026-09-13T12:00:00.000Z',
      strokes_impact: 0.83,
      strokes_impact_method: 'sg_baseline',
      confidence: 0.98,
      confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5, factors_measured: false },
      ...evidence,
    },
  };
}

export function makeRound(i: number, toPar: number, extra: Partial<ScoutingRound> = {}): ScoutingRound {
  const day = String(28 - i).padStart(2, '0');
  return {
    id: `r-${i}`,
    round_date: `2026-08-${day}`,
    created_at: `2026-08-${day}T12:00:00.000Z`,
    total_score: 72 + toPar,
    holes_played: 18,
    score_to_par: toPar,
    ...extra,
  };
}
