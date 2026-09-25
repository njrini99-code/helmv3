'use client';

/**
 * ============================================================================
 * StandingDrill — `?view=standing` (spec §5.3, absorbs `/my-standing`)
 * ----------------------------------------------------------------------------
 * Summary first, detail on tap (root-map style):
 *   - one summary card: how many tracked metrics sit ahead of the team
 *     average, the single most valuable gap to close, the SG: Total strip,
 *     and when the numbers were last refreshed;
 *   - every metric vs PGA Tour + the team below it, grouped by category,
 *     each group behind a `Disclosure` (closed by default), as reused
 *     `StandingStrip` cards plus the per-row F028 counterfactual line.
 *
 * Counterfactual accuracy (DC-ATTEMPT-1): attempt-rate metrics (putt make %
 * by band, sand save %, par-type scoring) are sized off the player's OWN
 * attempts per round (`attemptsPerRoundByMetric`). An attempt-rate metric
 * without a known rate shows NO strokes line: the legacy per-unit constant
 * overstates it (2.3 vs 0.9 strokes a round on 3-5 ft putts).
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
import type { CounterfactualProjection } from '@/lib/coachhelm/v3/counterfactual/types';
import { formatValue, shouldShowTeamMarker } from '@/components/golf/coachhelm/v3/StandingBar/utils';
import { Disclosure } from '@/components/golf/coachhelm/root-map/Disclosure';
import { attemptRateFor } from './standingAttemptRates';
import { DrillSummary, shortDay } from './DrillSummary';

const CATEGORY_ORDER: ReadonlyArray<{ category: string; label: string; description: string }> = [
  { category: 'sg', label: 'Strokes Gained', description: 'Per round vs the field, in Mark Broadie’s SG framework.' },
  { category: 'putting', label: 'Putting', description: 'Make % by distance and miss patterns.' },
  { category: 'approach', label: 'Approach', description: 'Proximity to the hole and greens in regulation.' },
  { category: 'short_game', label: 'Short Game', description: 'Scrambling by lie.' },
  { category: 'scoring', label: 'Scoring', description: 'Scoring by par vs Tour and your team.' },
  { category: 'course_mgmt', label: 'Course Mgmt', description: 'Penalty avoidance and big-number rate.' },
  { category: 'pressure', label: 'Pressure', description: 'Tournament vs practice, and the opening-hole tax.' },
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

interface StandingRow {
  id: MetricId;
  standing: PlayerStanding;
  cfg: MetricRenderConfig;
  /** Null when no line is shown (suppressed, Tour marker omitted, or no known attempt rate). */
  projection: CounterfactualProjection | null;
  line: string;
  /** Team comparison: true ahead, false behind, null not comparable (cold start). */
  aheadOfTeam: boolean | null;
}

function aheadOf(value: number, ref: number, cfg: MetricRenderConfig): boolean {
  return cfg.direction === 'higher_better' ? value > ref : value < ref;
}

/**
 * The per-row counterfactual projection, or null when the row shows no line.
 * Exported for tests.
 */
export function standingProjection(
  id: MetricId,
  standing: PlayerStanding,
  cfg: MetricRenderConfig,
  playerBaseline: number | null,
  attemptsPerRoundByMetric: Record<string, number> | null | undefined,
): CounterfactualProjection | null {
  if (standing.pga_omitted) return null;
  const rate = attemptRateFor(id, attemptsPerRoundByMetric);
  // Attempt-rate metric with no player-own rate: no line, never the legacy
  // constant (which assumes Tour-like volume and overstates the gap).
  if (!rate.ok) return null;
  const projection = computeCounterfactual({
    metric_id: id,
    direction: cfg.direction,
    player_value: standing.player_value,
    pga_value: standing.pga_value,
    player_30d_scoring_avg: playerBaseline,
    player_attempts_per_round: rate.rate,
  });
  return projection.suppressed ? null : projection;
}

export interface PlayerStandingDrillProps {
  standingByMetric: Record<string, PlayerStanding>;
  /** 30-day scoring baseline — anchors the F028 counterfactual projection. */
  playerBaseline: number | null;
  /**
   * The player's own attempts per round for attempt-rate metrics, by metric
   * id (see `resolveStandingAttemptRates`). Absent → those metrics show no
   * strokes line.
   */
  attemptsPerRoundByMetric?: Record<string, number> | null;
}

export function StandingDrill({ standingByMetric, playerBaseline, attemptsPerRoundByMetric = null }: PlayerStandingDrillProps) {
  const { home } = useStage();

  const byCategory = new Map<string, StandingRow[]>();
  const allRows: StandingRow[] = [];
  for (const id of METRIC_IDS) {
    const standing = standingByMetric[id];
    if (!standing) continue;
    const cfg = METRIC_RENDER_CONFIG[id];
    const projection = standingProjection(id, standing, cfg, playerBaseline, attemptsPerRoundByMetric);
    const row: StandingRow = {
      id,
      standing,
      cfg,
      projection,
      line: projection ? formatCounterfactualLine(projection) : '',
      aheadOfTeam:
        standing.team_avg !== null && shouldShowTeamMarker(standing)
          ? aheadOf(standing.player_value, standing.team_avg, cfg)
          : null,
    };
    allRows.push(row);
    const cat = metricCategory(id);
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(row);
  }

  const groups = CATEGORY_ORDER.filter((g) => (byCategory.get(g.category) ?? []).length > 0);

  if (allRows.length === 0) {
    return (
      <DrillPanel title="Standing" backLabel="Home" onBack={home}>
        <Surface elevation="border" padding="lg">
          <EmptyState
            title="More rounds needed"
            description="Log 5+ rounds and you'll see where you stack up vs PGA Tour and your team. Standing refreshes nightly."
          />
        </Surface>
      </DrillPanel>
    );
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  const teamComparable = allRows.filter((r) => r.aheadOfTeam !== null);
  const aheadCount = teamComparable.filter((r) => r.aheadOfTeam).length;
  const best = allRows
    .filter((r) => r.line && r.projection)
    .sort((a, b) => (b.projection?.strokes_saved_per_round ?? 0) - (a.projection?.strokes_saved_per_round ?? 0))[0];
  const worstVsTeam = teamComparable
    .filter((r) => r.aheadOfTeam === false)
    .sort((a, b) => (a.standing.team_pct ?? 101) - (b.standing.team_pct ?? 101))[0];

  const takeaway = best?.projection
    ? `Biggest win: ${best.cfg.display_label}. Closing it is worth about ${best.projection.strokes_saved_per_round.toFixed(1)} strokes a round.`
    : worstVsTeam && worstVsTeam.standing.team_avg !== null
      ? `Biggest gap to your team: ${worstVsTeam.cfg.display_label}, ${formatValue(worstVsTeam.standing.player_value, worstVsTeam.cfg.unit)} vs ${formatValue(worstVsTeam.standing.team_avg, worstVsTeam.cfg.unit)}.`
      : 'No gap here is large enough to project strokes from yet.';

  const updated = shortDay(
    allRows.reduce<string | null>((max, r) => (max === null || r.standing.computed_at > max ? r.standing.computed_at : max), null),
  );
  const teamN = teamComparable[0]?.standing.team_n ?? null;
  const basis = [
    `${allRows.length} metrics tracked`,
    teamN !== null ? `team of ${teamN}` : 'team comparison needs 5+ teammates',
    updated ? `updated ${updated}, refreshes nightly` : 'refreshes nightly',
  ].join(' · ');

  const sgTotal = allRows.find((r) => r.id === 'sg_total');
  const visual = sgTotal ? (
    <StandingStrip
      metric_id={sgTotal.id}
      metric_label={sgTotal.cfg.display_label}
      player_value={sgTotal.standing.player_value}
      team_avg={sgTotal.standing.team_avg}
      team_n={sgTotal.standing.team_n}
      team_pct={sgTotal.standing.team_pct}
      pga_value={sgTotal.standing.pga_value}
      pga_omitted={sgTotal.standing.pga_omitted}
      pga_omitted_reason={sgTotal.standing.pga_omitted_reason}
      is_womens={sgTotal.standing.is_womens}
      direction={sgTotal.cfg.direction}
      unit={sgTotal.cfg.unit}
      scale={sgTotal.cfg.default_scale}
      size="inline"
    />
  ) : teamComparable.length > 0 ? (
    <AheadBar ahead={aheadCount} total={teamComparable.length} />
  ) : null;

  return (
    <DrillPanel title="Standing" backLabel="Home" onBack={home}>
      <div className="flex flex-col gap-6">
        <DrillSummary
          slot="standing-summary"
          eyebrow={teamComparable.length > 0 ? 'Ahead of your team average' : 'Metrics tracked'}
          value={teamComparable.length > 0 ? `${aheadCount} of ${teamComparable.length}` : String(allRows.length)}
          unit={teamComparable.length > 0 ? 'metrics' : undefined}
          takeaway={takeaway}
          visual={visual}
          basis={basis}
        />

        <div className="flex flex-col" data-slot="standing-categories">
          {groups.map((group) => {
            const rows = byCategory.get(group.category) ?? [];
            const comparable = rows.filter((r) => r.aheadOfTeam !== null);
            const ahead = comparable.filter((r) => r.aheadOfTeam).length;
            return (
              <Disclosure
                key={group.category}
                slot="standing-category"
                headingLevel={2}
                title={group.label}
                meta={
                  <span className="shrink-0 text-caption text-text-tertiary">
                    {comparable.length > 0 ? (
                      <>
                        <span className="font-fw-mono tabular-nums text-text-secondary">
                          {ahead}/{comparable.length}
                        </span>{' '}
                        ahead
                      </>
                    ) : (
                      <>
                        <span className="font-fw-mono tabular-nums text-text-secondary">{rows.length}</span>{' '}
                        {rows.length === 1 ? 'metric' : 'metrics'}
                      </>
                    )}
                  </span>
                }
              >
                <p className="mb-3 text-caption text-text-tertiary">{group.description}</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {rows.map(({ id, standing, cfg, line }) => (
                    <div key={id} className="flex flex-col" data-slot="standing-row" data-metric={id}>
                      <StandingStrip
                        metric_id={id}
                        metric_label={cfg.display_label}
                        player_value={standing.player_value}
                        team_avg={standing.team_avg}
                        team_n={standing.team_n}
                        team_pct={standing.team_pct}
                        pga_value={standing.pga_value}
                        pga_omitted={standing.pga_omitted}
                        pga_omitted_reason={standing.pga_omitted_reason}
                        is_womens={standing.is_womens}
                        direction={cfg.direction}
                        unit={cfg.unit}
                        scale={cfg.default_scale}
                        size="card"
                      />
                      {line ? (
                        <p className="mt-1.5 px-1 font-fw-sans text-caption text-text-tertiary" data-slot="standing-counterfactual">
                          {line}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </Disclosure>
            );
          })}
        </div>
      </div>
    </DrillPanel>
  );
}

/** Share of team-comparable metrics ahead of the team average. */
function AheadBar({ ahead, total }: { ahead: number; total: number }) {
  const pct = total > 0 ? (ahead / total) * 100 : 0;
  return (
    <div
      role="img"
      aria-label={`${ahead} of ${total} metrics ahead of your team average`}
      className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-surface-sunken"
      data-slot="standing-ahead-bar"
    >
      <div className="h-full rounded-full bg-accent-500" style={{ width: `${pct}%` }} />
    </div>
  );
}
