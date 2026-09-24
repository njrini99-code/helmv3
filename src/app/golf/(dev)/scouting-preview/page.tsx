// THROWAWAY preview for the Scouting Report redesign audit. Delete before merge.
// Fixture = read-only SELECT of Owen's rows (2026-09-23); two putting rows are
// archived in prod and included only to show a full three-claim memo.
import { notFound } from 'next/navigation';
import { fairwayScope } from '@/lib/redesign/flag';
import { ScoutingReport } from '@/components/fairway/pages/scouting/ScoutingReport';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';

const cf = { recency: 1, variance: 0.5, sample_adequacy: 1, factors_measured: false };
const base = {
  player_id: '8091da4b-dbc9-47f3-80f1-be37c96b2c91',
  signature: null,
  status: 'active' as const,
  priority: 'medium' as const,
  acknowledged_at: null,
  resolved_at: null,
  created_at: '2026-06-22T01:28:03Z',
  updated_at: '2026-09-23T02:40:50Z',
  content: '',
};

const insights: EvidenceInsight[] = [
  {
    ...base, id: 'i-putt-5-10', category: 'putting', title: '5-10 ft putting: 35%', lifecycle_state: 'detected', metadata: null,
    evidence: { metric: 'putts_made_5_10ft_pct', metric_label: 'Putts Made 5-10 ft', unit: 'percent', your_value: 34.5, your_value_display: '35%', comparison_value: 62.2, comparison_label: 'PGA Tour avg', comparison_source: 'pga_baseline', sample_n: 55, window_days: 78, window_start: '2026-06-27T12:00:00Z', window_end: '2026-09-13T12:00:00Z', strokes_impact: 0.831, strokes_impact_method: 'peer_delta', confidence: 0.98, confidence_factors: cf },
  },
  {
    ...base, id: '48a33e5a-671e-4e75-9fc8-49cdcdf8e4e2', category: 'short_game', title: "Bunkers: it's the lag, not the escape (14% up-and-down)", lifecycle_state: 'detected',
    metadata: { movement: { to: 14.3, from: 17.6, direction: 'down', percent_change: -0.1875 } },
    evidence: { metric: 'scrambling_pct_sand', metric_label: 'Sand Save %', unit: 'percent', your_value: 14.3, your_value_display: '14%', comparison_value: 50, comparison_label: 'PGA Tour sand save avg', comparison_source: 'pga_baseline', sample_n: 21, window_days: 90, window_start: '', window_end: '', strokes_impact: 0.637, strokes_impact_method: 'peer_delta', confidence: 1, confidence_factors: cf, causality_level: 'inferred_hypothesis' },
  },
  {
    ...base, id: 'i-putt-10-15', category: 'putting', title: '10-15 ft putting: 21%', lifecycle_state: 'detected', metadata: null,
    evidence: { metric: 'putts_made_10_15ft_pct', metric_label: 'Putts Made 10-15 ft', unit: 'percent', your_value: 20.6, your_value_display: '21%', comparison_value: 35.7, comparison_label: 'PGA Tour avg', comparison_source: 'pga_baseline', sample_n: 63, window_days: 78, window_start: '2026-06-27T12:00:00Z', window_end: '2026-09-13T12:00:00Z', strokes_impact: 0.302, strokes_impact_method: 'peer_delta', confidence: 0.98, confidence_factors: cf },
  },
  {
    ...base, id: '827cda2e-9fe2-4742-8d02-3383a0a92a52', category: 'pressure', title: 'Opening hole gap: +0.19 strokes vs round avg', lifecycle_state: 'detected',
    metadata: { movement: { to: 0.191, from: 0.253, direction: 'down', percent_change: -0.24 } },
    evidence: { metric: 'opening_hole_delta', metric_label: 'Opening Hole Delta', unit: 'strokes', your_value: 0.191, your_value_display: '+0.19', comparison_value: 0.1, comparison_label: 'PGA Tour opening-hole tax', comparison_source: 'pga_baseline', sample_n: 12, window_days: 90, window_start: '', window_end: '', strokes_impact: 0, strokes_impact_method: 'peer_delta', confidence: 0.6, confidence_factors: { ...cf, sample_adequacy: 0.6 } },
  },
  {
    ...base, id: 'i-break', category: 'putting', title: 'Putting break check: no directional bias detected', lifecycle_state: 'detected', metadata: null,
    evidence: { metric: 'putt_miss_bias_left_pct', metric_label: 'Break-direction make %', unit: 'percent', your_value: 0, your_value_display: '—', comparison_value: 0, comparison_label: 'Even across break directions', comparison_source: 'your_baseline', sample_n: 12, window_days: 90, window_start: '', window_end: '', strokes_impact: 0, strokes_impact_method: 'peer_delta', confidence: 0.4, confidence_factors: cf },
  },
];

const rounds = [
  ['ff74226b', '2026-07-10', 74, 2, 8, 12, 30, 14], ['f3df82e7', '2026-07-09', 73, 1, 12, 11, 29, 14], ['186f37f7', '2026-07-08', 82, 10, 8, 10, 30, 14],
  ['cc475959', '2026-07-03', 79, 8, 7, 10, 30, 14], ['d6e5a8cb', '2026-07-02', 77, 6, 10, 11, 33, 14], ['df17bc06', '2026-07-02', 80, 9, 9, 8, 33, 14],
  ['cce4ebdb', '2026-06-18', 75, 3, 11, 14, 37, 14], ['fc8ec2ea', '2026-06-12', 75, 3, 10, 10, 30, 13], ['9bba1d95', '2026-06-09', 75, 3, 7, 12, 33, 14],
  ['16c5a432', '2026-06-08', 72, 0, 12, 15, 34, 14],
].map(([id, d, s, tp, fw, gir, putts, fws]) => ({
  id: String(id), created_at: `${d}T12:00:00Z`, round_date: String(d), total_score: Number(s), holes_played: 18, course_name: null,
  score_to_par: Number(tp), total_fairways_hit: Number(fw), total_gir: Number(gir), total_putts: Number(putts), total_fairways: Number(fws), total_gir_possible: 18,
}));

const focusAreas = [
  { id: 'b54d6701', title: 'Short-side misses are compounding', status: 'proposed', current_value: null, target_value: null, baseline_value: null, target_metric: 'scrambling_pct', created_at: '2026-07-26T00:46:47Z', from_insight_id: '5915faea' },
  { id: '2ca14d0e', title: 'Approach play is the biggest leak — costing ~1.4 strokes per round', status: 'active', current_value: null, target_value: null, baseline_value: null, target_metric: null, created_at: '2026-05-29T02:08:32Z', from_insight_id: null },
  { id: '06ce77f1', title: 'Improve short-side scrambling', status: 'completed', current_value: 35, target_value: 55, baseline_value: null, target_metric: 'scrambling_pct', created_at: '2026-04-21T14:23:39Z', from_insight_id: null },
  { id: 'adbb3e76', title: 'Rebuild 5–10 ft make rate', status: 'active', current_value: 34.5, target_value: 75, baseline_value: 58, target_metric: 'putts_made_5_10ft_pct', created_at: '2026-04-18T14:23:39Z', from_insight_id: 'i-putt-5-10', evidence_revision_status: 'changed' as const },
  { id: 'a3a08665', title: 'Tighten 150–180y approach dispersion', status: 'active', current_value: 21.8, target_value: 15, baseline_value: 24, target_metric: 'approach_proximity_125_175ft', created_at: '2026-04-15T14:23:39Z', from_insight_id: null },
];

export default async function ScoutingPreviewPage({ searchParams }: { searchParams: Promise<{ empty?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { empty } = await searchParams;
  const player = empty
    ? { id: 'b6b87c4d-0673-4166-9f8c-44e60936a034', first_name: 'Audit', last_name: 'Player', graduation_year: null, handicap: null }
    : { id: '8091da4b-dbc9-47f3-80f1-be37c96b2c91', first_name: 'Owen', last_name: 'Carter', graduation_year: 2028, handicap: 5.5 };
  return (
    <div className={fairwayScope('min-h-dvh bg-canvas px-4 py-6 md:px-10 md:py-10')}>
      <ScoutingReport
        player={player}
        rounds={empty ? [] : rounds}
        focusAreas={empty ? [] : focusAreas}
        themes={[]}
        evidenceInsights={empty ? [] : insights}
      />
    </div>
  );
}
