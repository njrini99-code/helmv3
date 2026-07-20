'use client';

/**
 * ============================================================================
 * StandingDrill — `?view=standing` (spec §5.3, absorbs `/my-standing`)
 * ----------------------------------------------------------------------------
 * Every tracked metric vs PGA Tour + the team, grouped by category, as reused
 * `StandingStrip` cards plus the per-row F028 counterfactual line — ported
 * verbatim from `my-standing/page.tsx` (now a redirect shim onto this view).
 * ========================================================================== */

import { DrillPanel, useStage } from '@/components/fairway/modules';
import { StandingStrip, Surface, EmptyState } from '@/components/fairway';
import {
  METRIC_RENDER_CONFIG,
  type MetricRenderConfig,
} from '@/lib/coachhelm/v3/standing/metric-config';
import { METRIC_IDS, type MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import {
  computeCounterfactual,
  formatCounterfactualLine,
} from '@/lib/coachhelm/v3/counterfactual/compute';

const CATEGORY_ORDER: ReadonlyArray<{ category: string; label: string; description: string }> = [
  { category: 'sg', label: 'Strokes Gained', description: 'Per-round vs field — Mark Broadie’s SG framework.' },
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

export interface PlayerStandingDrillProps {
  standingByMetric: Record<string, PlayerStanding>;
  /** 30-day scoring baseline — anchors the F028 counterfactual projection. */
  playerBaseline: number | null;
}

export function StandingDrill({ standingByMetric, playerBaseline }: PlayerStandingDrillProps) {
  const { home } = useStage();

  const byCategory = new Map<string, Array<{ id: MetricId; standing: PlayerStanding; cfg: MetricRenderConfig }>>();
  for (const id of METRIC_IDS) {
    const standing = standingByMetric[id];
    if (!standing) continue;
    const cfg = METRIC_RENDER_CONFIG[id];
    const cat = metricCategory(id);
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push({ id, standing, cfg });
  }

  const groups = CATEGORY_ORDER.filter((g) => (byCategory.get(g.category) ?? []).length > 0);
  const totalRows = groups.reduce((a, g) => a + (byCategory.get(g.category)?.length ?? 0), 0);

  return (
    <DrillPanel title="Standing" backLabel="Home" onBack={home}>
      {totalRows === 0 ? (
        <Surface elevation="border" padding="lg">
          <EmptyState
            title="More rounds needed"
            description="Log 5+ rounds and you'll see where you stack up vs PGA Tour and your team. Standing refreshes nightly."
          />
        </Surface>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => {
            const rows = byCategory.get(group.category) ?? [];
            return (
              <section key={group.category} className="flex flex-col gap-3">
                <div className="px-1">
                  <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.16em] text-text-tertiary">
                    {group.label}
                  </p>
                  <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">{group.description}</p>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {rows.map(({ id, standing, cfg }) => {
                    const counterfactualText = standing.pga_omitted
                      ? ''
                      : formatCounterfactualLine(
                          computeCounterfactual({
                            metric_id: id,
                            direction: cfg.direction,
                            player_value: standing.player_value,
                            pga_value: standing.pga_value,
                            player_30d_scoring_avg: playerBaseline,
                          }),
                        );
                    return (
                      <div key={id} className="flex flex-col">
                        <StandingStrip
                          metric_id={id}
                          metric_label={cfg.display_label}
                          player_value={standing.player_value}
                          team_avg={standing.team_avg}
                          team_n={standing.team_n}
                          team_pct={standing.team_pct}
                          pga_value={standing.pga_value}
                          pga_omitted={standing.pga_omitted}
                          is_womens={standing.is_womens}
                          direction={cfg.direction}
                          unit={cfg.unit}
                          scale={cfg.default_scale}
                          size="card"
                        />
                        {counterfactualText ? (
                          <p className="mt-1.5 px-1 font-fw-sans text-caption italic text-text-tertiary">
                            {counterfactualText}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </DrillPanel>
  );
}
