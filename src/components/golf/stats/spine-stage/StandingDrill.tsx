'use client';

/**
 * ============================================================================
 * StandingDrill — `?area=standing` (spec §5.1, "Detailed Standings, promoted")
 * ----------------------------------------------------------------------------
 * Every metric vs PGA Tour and the team, grouped by category, as reused
 * `StandingBars` cards (bar rows, not the old dot-on-a-rail `StandingStrip`).
 * ALWAYS visible (no collapsed-by-default toggle — the legacy cockpit hid
 * this behind a disclosure; the stage IS the drill door now, so the content
 * behind it opens straight to the full board).
 * ========================================================================== */

import { Fragment } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { DrillPanel, useStage } from '@/components/fairway/modules';
import { StandingBars } from '@/components/fairway/charts/StandingBars';
import { getMetricRenderConfig, type MetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import { METRIC_IDS, type MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { CategoryInsightStrip } from './CategoryInsightStrip';
import type { PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';

// CoachHelm cause/effect — REUSED VERBATIM from FairwayStatsCockpit. Returns
// the player's mined patterns (cause = description, effect = strokeImpact,
// fix = recommendation), gated by verifyPlayerAccess + isCoachHelmEnabledForPlayer
// inside the action.
import type { getPlayerPatterns } from '@/app/golf/actions/insights';
type CoachHelmPattern = NonNullable<
  Awaited<ReturnType<typeof getPlayerPatterns>>['patterns']
>[number];

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function prettyPatternType(t: string | null | undefined): string {
  if (!t) return 'Pattern';
  if (t === 'contextual') return 'Shot pattern';
  if (t === 'conditional') return 'Conditional';
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// On-dark hairline — matches `Spine`'s own `HAIRLINE_COLOR` exactly (no
// `bg-surface-*` token covers a translucent-white overlay on the accent
// gradient, so both components share this inline value rather than the
// Tailwind `border-white/N` opacity utility).
const SG_INSTRUMENT_HAIRLINE = 'oklch(1 0 0 / 0.14)';

/**
 * StrokesGainedInstrument — the "grouped visually apart from traditional
 * stats" SG cluster: all 4 sg_* rows plus sg_total, mounted on the SAME
 * dark accent-gradient surface `Spine` uses for exactly this "you vs
 * benchmarks" read. Each row is its own bare (chrome-free) `StandingBars`
 * instance — real labeled bar rows, replacing the old shared-grid
 * `StandingTrack` pin rail entirely (owner: "get rid of these slider
 * things... replace it with an actual component"). `className`
 * ("text-text-on-accent") is what makes a `StandingBars` mounted on this
 * dark surface legible — every label/value inside inherits it via
 * `text-current`, and the rail track itself swaps to the matching on-dark
 * token, both keyed off that one prop (see `StandingBars.tsx`).
 */
function StrokesGainedInstrument({
  rows,
  standingViewerContext,
  playerName,
}: {
  rows: ReadonlyArray<{ id: MetricId; row: PlayerStandingRow; cfg: MetricRenderConfig }>;
  standingViewerContext: 'self' | 'coach';
  playerName?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <div
      data-slot="sg-instrument"
      className="overflow-clip rounded-fw-lg border border-accent-700 bg-gradient-to-b from-accent-900 via-accent-800 to-accent-800 p-5 shadow-raise"
    >
      <div className="flex flex-col gap-3">
        {rows.map(({ id, row, cfg }) => {
          const isTotal = id === 'sg_total';
          return (
            <Fragment key={id}>
              <StandingBars
                frame="bare"
                size="sm"
                layout="compact"
                className="text-text-on-accent"
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
                viewer_context={standingViewerContext}
                player_name={playerName}
              />
              {isTotal ? (
                <div aria-hidden="true" className="border-t" style={{ borderTopColor: SG_INSTRUMENT_HAIRLINE }} />
              ) : null}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

const CATEGORY_ORDER: ReadonlyArray<{ category: string; label: string; description: string }> = [
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
  /** Needed only to build the "Open CoachHelm" link on the patterns section. */
  playerId?: string;
  /** CoachHelm's mined patterns for this player — top 3 (by |strokeImpact|) render as "What CoachHelm sees". */
  patterns?: CoachHelmPattern[];
}

export function StandingDrill({
  standingRows,
  standingViewerContext,
  playerName,
  playerId,
  patterns = [],
}: StandingDrillProps) {
  const { home } = useStage();

  const standingByMetric = new Map<string, PlayerStandingRow>();
  for (const row of standingRows ?? []) standingByMetric.set(row.metric_id, row);

  // CoachHelm cause/effect — the patterns moving scoring the most (by absolute
  // stroke impact), top 3.
  const coachHelmReads = [...patterns]
    .filter((p) => finite(p.strokeImpact) !== null && p.strokeImpact !== 0)
    .sort((a, b) => Math.abs(b.strokeImpact) - Math.abs(a.strokeImpact))
    .slice(0, 3);

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

  // Strokes Gained renders as its own aligned instrument group (below),
  // separate from the generic per-category `StandingBars` grids — excluded
  // from `groups` so it's never ALSO rendered as a plain card row.
  const sgRows = byCategory.get('sg') ?? [];
  const groups = CATEGORY_ORDER.filter((g) => (byCategory.get(g.category) ?? []).length > 0);

  return (
    <DrillPanel title="Standing" backLabel="All areas" onBack={home}>
      {groups.length === 0 && sgRows.length === 0 ? (
        <p className="font-fw-sans text-body-sm text-text-tertiary">
          The full standing board fills in after 5+ rounds with shot detail.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {sgRows.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="px-1">
                <h4 className="font-fw-sans text-body font-medium text-text-primary">Strokes Gained</h4>
                <p className="font-fw-sans text-caption text-text-tertiary">
                  Off the tee, approach, around the green, and putting — your edge over the field, in strokes per
                  round.
                </p>
              </div>
              <StrokesGainedInstrument
                rows={sgRows}
                standingViewerContext={standingViewerContext}
                playerName={playerName}
              />
            </div>
          ) : null}
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
                    <StandingBars
                      key={id}
                      frame="bare"
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

      {coachHelmReads.length > 0 ? (
        <div className="mt-6 flex flex-col gap-2">
          {playerId ? (
            <div className="flex justify-end px-1">
              <Link
                href={
                  standingViewerContext === 'self'
                    ? '/golf/dashboard/coachhelm'
                    : `/golf/dashboard/players/${playerId}/game?tab=scouting`
                }
                className="inline-flex items-center gap-1 rounded-fw-sm font-fw-sans text-label font-medium text-accent-600 outline-none transition-colors [transition-duration:180ms] hover:text-accent-700 focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
              >
                Open CoachHelm
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          ) : null}
          {/* Restyled via the shared CategoryInsightStrip (§ per-drill "What
              CoachHelm sees" vocabulary) — same card, same leak/strength chip
              language every other drill uses. `max={3}` keeps the existing
              top-3-by-|strokeImpact| selection above, just presented through
              the shared component instead of a bespoke card grid. */}
          <CategoryInsightStrip
            insights={coachHelmReads.map((p) => ({
              title: p.description?.trim() || prettyPatternType(p.patternType),
              strokeImpact: p.strokeImpact,
              recommendation: p.recommendation?.trim() || null,
            }))}
            max={3}
          />
        </div>
      ) : null}
    </DrillPanel>
  );
}
