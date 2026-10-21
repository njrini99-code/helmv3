/** Synthetic reads for the lifecycle tests. No production data. */
import type { LifecycleEvidence, LifecycleReadRow } from '../types';

export const NOW = '2026-10-20T03:00:00.000Z';

export function read(id: string, partial: Partial<LifecycleReadRow> = {}, evidence: Partial<LifecycleEvidence> = {}): LifecycleReadRow {
  return {
    id,
    player_id: 'player-1',
    insight_type: 'putt_distance',
    signature: `putt_distance:${id}`,
    title: '3-5 ft putts',
    lifecycle_state: 'detected',
    dismissed: false,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    metadata: {},
    ...partial,
    evidence: {
      metric: 'putts_made_3_5ft_pct',
      metric_label: '3-5 ft putts',
      unit: 'percent',
      your_value: 62,
      your_value_display: '62%',
      comparison_value: 72,
      comparison_label: 'Team',
      sample_n: 95,
      window_end: '2026-10-15',
      strokes_impact: 0.4,
      strokes_impact_method: 'peer_delta',
      source_round_ids: ['r0', 'r1', 'r2'],
      ...evidence,
    },
  };
}
