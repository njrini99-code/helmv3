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

import Link from 'next/link';
import { Sparkles, ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';

import { DrillPanel, useStage } from '@/components/fairway/modules';
import { StandingStrip, Surface } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { getMetricRenderConfig, type MetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import { METRIC_IDS, type MetricId } from '@/lib/coachhelm/v3/metrics/registry';
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

// CoachHelm cause/effect card — one mined pattern as cause → quantified stroke
// effect → fix. Honest sign: negative strokeImpact = a leak (cost), positive =
// a strength (gain). The data + framing come straight from getPlayerPatterns
// (ported from FairwayStatsCockpit's CauseEffectCard verbatim).
function CauseEffectCard({ pattern }: { pattern: CoachHelmPattern }) {
  const isLeak = pattern.strokeImpact < 0;
  const magnitude = Math.abs(pattern.strokeImpact).toFixed(1);
  const cause = pattern.description?.trim() || prettyPatternType(pattern.patternType);
  const fix = pattern.recommendation?.trim() || null;
  const rounds = finite(pattern.occurrenceCount);

  return (
    <Surface elevation="border" padding="md" className="flex h-full flex-col gap-3">
      <span className="font-fw-sans text-eyebrow font-medium uppercase tracking-[0.1em] text-text-tertiary">
        {prettyPatternType(pattern.patternType)}
      </span>

      {/* Effect — the quantified stroke cost / gain. */}
      <span
        className={cn(
          'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 font-fw-mono text-caption font-medium tabular-nums',
          isLeak ? 'bg-fw-warning-bg text-fw-warning' : 'bg-fw-success-bg text-fw-success',
        )}
      >
        {isLeak ? (
          <TrendingDown className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <TrendingUp className="h-3.5 w-3.5" aria-hidden />
        )}
        {isLeak ? `≈ ${magnitude} strokes / round` : `+${magnitude} strokes / round`}
      </span>

      {/* Cause */}
      <p className="font-fw-sans text-body-sm leading-snug text-text-primary">{cause}</p>

      {/* Fix (the actionable handoff) */}
      {fix ? (
        <p className="mt-auto font-fw-sans text-caption leading-snug text-text-tertiary">
          <span className="font-medium text-text-secondary">Fix · </span>
          {fix}
        </p>
      ) : null}

      {rounds != null && rounds > 0 ? (
        <p className={cn('font-fw-sans text-caption text-text-tertiary', fix ? '' : 'mt-auto')}>
          Seen across {rounds} {rounds === 1 ? 'round' : 'rounds'}
        </p>
      ) : null}
    </Surface>
  );
}

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

      {coachHelmReads.length > 0 ? (
        <div className="mt-6 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 px-1">
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent-600" aria-hidden />
              <h4 className="font-fw-sans text-body font-medium text-text-primary">What CoachHelm sees</h4>
            </span>
            {playerId ? (
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
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {coachHelmReads.map((p) => (
              <CauseEffectCard key={p.id} pattern={p} />
            ))}
          </div>
        </div>
      ) : null}
    </DrillPanel>
  );
}
