'use client';

/**
 * ============================================================================
 * PlayerHomeBento — the Player CoachHelm stage home view (spec §5.3 bento)
 * ----------------------------------------------------------------------------
 * Top insight (2×2, evidence + Helpful/Dismiss + prescribed drill) · Focus
 * areas · Game profile teaser (mini GenomeRadar) · Standing best/worst (2×1)
 * · Trend · Shot analysis (deep-dive entry point) · Themes (flag-gated) —
 * cells on one gapless `Bento` surface. Every cell but the top insight is a
 * whole-cell `<button>` (`onOpen`) that swaps the stage via `useStage()`.
 * The top-insight cell renders Helpful/Dismiss as REAL nested `<button>`s, so
 * it deliberately has NO `onOpen` (BentoCell renders the whole cell as a
 * `<button>` when `onOpen` is set — nesting a button inside a button is
 * invalid HTML/inaccessible) — a "More insights →" text button inside it
 * drives the same `insights` drill instead.
 *
 * Prescribed drills (FIX 1): `topInsight.drills` is pre-joined by
 * `insight-delivery.ts` (`golf_insight_drill_attachments → golf_drills`,
 * ranked, capped at 3). Only the FIRST drill renders here (accent-50 "Drill"
 * inset, matching `PrescribedPracticePlanCard`'s pattern) — the remaining
 * attached drills render inside `InsightsDrill` via the `topInsightDrills`
 * prop `PlayerCoachHelmHome` threads through, so every attached drill stays
 * visible somewhere.
 * ========================================================================== */

import { Bento, BentoCell, useStage } from '@/components/fairway/modules';
import { Button, type GenomeAxis } from '@/components/fairway';
import { IconClock } from '@/components/icons';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import { isThemesEnabled } from '@/lib/redesign/flag';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { ThemeNode } from '@/lib/coachhelm/v3/themes/types';
import { pickBestWorstStandingIds } from './buildPlayerHomeViewModel';

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
function fmtPct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n)}%`;
}

export interface PlayerHomeBentoProps {
  topInsight: EvidenceInsight | null;
  activeFocusAreaCount: number;
  topFocusAreaLabel: string | null;
  genomeAxes: GenomeAxis[];
  standingByMetric: Record<string, PlayerStanding>;
  trendSummary: string | null;
  themes: ThemeNode[];
  insightCount: number;
  performanceSnapshot: {
    scoringAverage: number | null;
    fairwayPct: number | null;
    girPct: number | null;
    scramblingPct: number | null;
    puttsPerRound: number | null;
  };
  onRateTopInsight: (rating: 'helpful' | 'dismissed') => void;
}

export function PlayerHomeBento({
  topInsight,
  activeFocusAreaCount,
  topFocusAreaLabel,
  genomeAxes,
  standingByMetric,
  trendSummary,
  themes,
  insightCount,
  performanceSnapshot,
  onRateTopInsight,
}: PlayerHomeBentoProps) {
  const stage = useStage();

  const firstDrill = topInsight?.drills?.[0] ?? null;

  const { bestId, worstId } = pickBestWorstStandingIds(standingByMetric);
  const bestCfg = bestId ? getMetricRenderConfig(bestId) : null;
  const worstCfg = worstId ? getMetricRenderConfig(worstId) : null;
  const bestRow = bestId ? standingByMetric[bestId] : undefined;

  const showThemes = isThemesEnabled() && themes.length > 0;

  return (
    <Bento separated className="min-[940px]:grid-cols-2">
      <BentoCell
        label="Performance snapshot"
        span={2}
        sentence="Your scoring inputs, together—not isolated stat cards."
        onOpen={() => stage.open('standing')}
      >
        <div className="grid grid-cols-2 overflow-clip rounded-fw-md border border-border-subtle bg-surface-sunken/45 min-[520px]:grid-cols-5 min-[520px]:divide-x min-[520px]:divide-border-subtle">
          <SnapshotMetric label="Score" value={fmtOne(performanceSnapshot.scoringAverage)} />
          <SnapshotMetric label="Fairways" value={fmtPct(performanceSnapshot.fairwayPct)} />
          <SnapshotMetric label="GIR" value={fmtPct(performanceSnapshot.girPct)} />
          <SnapshotMetric label="Scramble" value={fmtPct(performanceSnapshot.scramblingPct)} />
          <SnapshotMetric label="Putts" value={fmtOne(performanceSnapshot.puttsPerRound)} />
        </div>
      </BentoCell>

      <BentoCell label="Your edge this week" span={2} rows={topInsight ? 2 : 1}>
        {topInsight ? (
          <div className="flex h-full flex-col gap-3">
            <p className="font-fw-sans text-body-sm leading-snug text-text-primary">
              {topInsight.title}
            </p>
            <p className="line-clamp-3 font-fw-sans text-caption text-text-secondary">
              {topInsight.content}
            </p>
            {firstDrill ? (
              <div className="rounded-fw-md border border-accent-200 bg-accent-50 px-3 py-2">
                <p className="font-fw-sans text-eyebrow font-medium uppercase tracking-wider text-accent-700">
                  Drill
                </p>
                <p className="mt-1 line-clamp-1 font-fw-sans text-caption leading-relaxed text-accent-900">
                  {firstDrill.title}
                </p>
                <p className="mt-1.5 inline-flex items-center gap-1 font-fw-sans text-eyebrow font-medium text-accent-700">
                  <IconClock size={12} /> {firstDrill.duration_min} min
                </p>
              </div>
            ) : null}
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => onRateTopInsight('helpful')}>
                Helpful
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onRateTopInsight('dismissed')}>
                Dismiss
              </Button>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => stage.open('insights')}>
                More insights →
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col gap-3">
            <p className="font-fw-sans text-caption text-text-tertiary">
              No standout signal yet — insights appear once a pattern holds across multiple rounds.
            </p>
            <Button variant="ghost" size="sm" className="mt-auto w-fit" onClick={() => stage.open('insights')}>
              View insights →
            </Button>
          </div>
        )}
      </BentoCell>

      <BentoCell
        label="Focus areas"
        headline={{ value: String(activeFocusAreaCount), unit: 'active' }}
        sentence={topFocusAreaLabel ? `Top priority: ${topFocusAreaLabel}.` : 'Your coach-assigned + self-set goals.'}
        onOpen={() => stage.open('development')}
      />

      <BentoCell
        label="Game profile"
        sentence="Your 8-dimension game shape."
        onOpen={() => stage.open('profile')}
      >
        {genomeAxes.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {genomeAxes.slice(0, 4).map((axis) => (
              <div key={axis.label} className="min-w-0">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate font-fw-sans text-eyebrow text-text-tertiary">{axis.label}</span>
                  <span className="shrink-0 font-fw-mono text-eyebrow tabular-nums text-text-secondary">{Math.round(axis.value)}</span>
                </div>
                <span className="mt-1 block h-1 overflow-clip rounded-full bg-surface-sunken">
                  <span className="block h-full rounded-full bg-accent-500" style={{ width: `${Math.max(0, Math.min(100, axis.value))}%` }} />
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </BentoCell>

      <BentoCell
        label="Standing"
        span={2}
        headline={
          bestCfg && bestRow ? { value: fmtPct(finite(bestRow.team_pct)), unit: bestCfg.display_label } : undefined
        }
        sentence={
          bestCfg && worstCfg
            ? `Strongest in ${bestCfg.display_label.toLowerCase()}; leaking most in ${worstCfg.display_label.toLowerCase()}.`
            : 'Every metric vs PGA Tour and the team.'
        }
        onOpen={() => stage.open('standing')}
      />

      <BentoCell
        label="Trend"
        sentence={trendSummary ?? 'Your performance trend fills in with more rounds.'}
        onOpen={() => stage.open('profile')}
      />

      {/* FIX 2: deliberate entry point for the `deep-dive` stage view (shot
          analysis charts + What-If simulator) — previously registered in
          `StageRouter`'s `views` but unreachable, since no `stage.open`
          call targeted it anywhere. Same whole-cell `onOpen` idiom as every
          other bento cell, so it's keyboard-reachable via `BentoCell`'s
          `PressTarget`. */}
      <BentoCell
        label="Shot analysis"
        sentence="Charts + What-If scenarios for every shot."
        onOpen={() => stage.open('deep-dive')}
      />

      {showThemes ? (
        <BentoCell
          label="Themes"
          span={2}
          headline={{ value: String(themes.length), unit: themes.length === 1 ? 'theme' : 'themes' }}
          sentence="The recurring patterns behind your scores."
          onOpen={() => stage.open('insights')}
        />
      ) : null}

      <BentoCell
        label="Insight library"
        span={2}
        headline={{ value: String(insightCount), unit: insightCount === 1 ? 'signal' : 'signals' }}
        sentence="Evidence, prescribed drills, and feedback in one place."
        onOpen={() => stage.open('insights')}
      />
    </Bento>
  );
}

function SnapshotMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-1.5 py-2.5 text-center sm:px-2.5 sm:text-left">
      <p className="truncate font-fw-mono text-[0.92rem] font-semibold leading-none tracking-[-0.03em] text-text-primary tabular-nums sm:text-h3">
        {value}
      </p>
      <p className="mt-1.5 truncate font-fw-sans text-[0.55rem] font-semibold uppercase tracking-[0.06em] text-text-tertiary sm:text-[0.62rem]">
        {label}
      </p>
    </div>
  );
}

function fmtOne(v: number | null): string {
  return v === null ? '—' : v.toFixed(1);
}
