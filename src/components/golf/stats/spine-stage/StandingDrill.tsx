'use client';

/**
 * ============================================================================
 * StandingDrill — `?area=standing` (spec §5.1, "Detailed Standings, promoted")
 * ----------------------------------------------------------------------------
 * Every metric vs PGA Tour and the team, grouped by category, as reused
 * `StandingStrip` cards. ALWAYS visible (no collapsed-by-default toggle — the
 * legacy cockpit hid this behind a disclosure; the stage IS the drill door
 * now, so the content behind it opens straight to the full board).
 * ========================================================================== */

import { DrillPanel, useStage } from '@/components/fairway/modules';
import { StandingStrip } from '@/components/fairway';
import { getMetricRenderConfig, type MetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import { METRIC_IDS, type MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';

const CATEGORY_ORDER: ReadonlyArray<{ category: string; label: string; description: string }> = [
  { category: 'sg', label: 'Strokes Gained', description: 'Off the tee, approach, around the green, and putting.' },
  { category: 'putting', label: 'Putting', description: 'Make % by distance and miss patterns.' },
  { category: 'approach', label: 'Approach', description: 'Proximity to hole + greens in regulation.' },
  { category: 'short_game', label: 'Short Game', description: 'Scrambling by lie type.' },
  { category: 'scoring', label: 'Scoring', description: 'Per-par scoring vs PGA + cohort.' },
  { category: 'course_mgmt', label: 'Course Mgmt', description: 'Penalty avoidance + big-number rate.' },
  { category: 'pressure', label: 'Pressure', description: 'Tournament vs practice + opening-hole tax.' },
];

function metricCategory(metricId: string): string {
  if (metricId.startsWith('sg_')) return 'sg';
  if (metricId.startsWith('putts_made_') || metricId.startsWith('putt_miss_bias_')) return 'putting';
  if (metricId.startsWith('approach_') || metricId === 'gir_pct') return 'approach';
  if (metricId.startsWith('scrambling_')) return 'short_game';
  if (metricId.startsWith('scoring_par_')) return 'scoring';
  if (metricId === 'penalty_rate_per_round' || metricId === 'big_number_rate') return 'course_mgmt';
  if (metricId === 'practice_tournament_delta' || metricId === 'opening_hole_delta') return 'pressure';
  return 'sg';
}

export interface StandingDrillProps {
  standingRows: PlayerStandingRow[] | null;
  standingViewerContext: 'self' | 'coach';
  playerName?: string;
}

export function StandingDrill({ standingRows, standingViewerContext, playerName }: StandingDrillProps) {
  const { home } = useStage();

  const standingByMetric = new Map<string, PlayerStandingRow>();
  for (const row of standingRows ?? []) standingByMetric.set(row.metric_id, row);

  const byCategory = new Map<string, Array<{ id: MetricId; row: PlayerStandingRow; cfg: MetricRenderConfig }>>();
  for (const id of METRIC_IDS) {
    const row = standingByMetric.get(id);
    if (!row) continue;
    const cfg = getMetricRenderConfig(id);
    if (!cfg) continue;
    const cat = metricCategory(id);
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push({ id, row, cfg });
  }

  const groups = CATEGORY_ORDER.filter((g) => (byCategory.get(g.category) ?? []).length > 0);

  return (
    <DrillPanel title="Standing" backLabel="All areas" onBack={home}>
      {groups.length === 0 ? (
        <p className="font-fw-sans text-body-sm text-text-tertiary">
          The full standing board fills in after 5+ rounds with shot detail.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => {
            const rows = byCategory.get(group.category) ?? [];
            return (
              <div key={group.category} className="flex flex-col gap-3">
                <div className="px-1">
                  <h4 className="font-fw-sans text-body font-medium text-text-primary">{group.label}</h4>
                  <p className="font-fw-sans text-caption text-text-tertiary">{group.description}</p>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {rows.map(({ id, row, cfg }) => (
                    <StandingStrip
                      key={id}
                      metric_id={id}
                      metric_label={cfg.display_label}
                      player_value={row.player_value}
                      team_avg={row.team_avg}
                      team_n={row.team_n}
                      team_pct={row.team_pct}
                      pga_value={row.pga_value}
                      is_womens={row.is_womens}
                      direction={cfg.direction}
                      unit={cfg.unit}
                      scale={cfg.default_scale}
                      size="card"
                      viewer_context={standingViewerContext}
                      player_name={playerName}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DrillPanel>
  );
}
