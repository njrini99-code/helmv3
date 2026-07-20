'use client';

/**
 * ============================================================================
 * PlayerHomeBento — the Player CoachHelm stage home view (spec §5.3 bento)
 * ----------------------------------------------------------------------------
 * Top insight (2×2, evidence + Helpful/Dismiss) · Focus areas · Game profile
 * teaser (mini GenomeRadar) · Standing best/worst (2×1) · Trend · Themes
 * (flag-gated) — six cells on one gapless `Bento` surface. Every cell but the
 * top insight is a whole-cell `<button>` (`onOpen`) that swaps the stage via
 * `useStage()`. The top-insight cell renders Helpful/Dismiss as REAL nested
 * `<button>`s, so it deliberately has NO `onOpen` (BentoCell renders the
 * whole cell as a `<button>` when `onOpen` is set — nesting a button inside a
 * button is invalid HTML/inaccessible) — a "More insights →" text button
 * inside it drives the same `insights` drill instead.
 * ========================================================================== */

import { Bento, BentoCell, useStage } from '@/components/fairway/modules';
import { Button, GenomeRadar, type GenomeAxis } from '@/components/fairway';
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
  onRateTopInsight,
}: PlayerHomeBentoProps) {
  const stage = useStage();

  const { bestId, worstId } = pickBestWorstStandingIds(standingByMetric);
  const bestCfg = bestId ? getMetricRenderConfig(bestId) : null;
  const worstCfg = worstId ? getMetricRenderConfig(worstId) : null;
  const bestRow = bestId ? standingByMetric[bestId] : undefined;

  const showThemes = isThemesEnabled() && themes.length > 0;

  return (
    <Bento>
      <BentoCell label="Your edge this week" span={2} rows={2}>
        {topInsight ? (
          <div className="flex h-full flex-col gap-3">
            <p className="font-fw-sans text-body-sm leading-snug text-text-primary">
              {topInsight.title}
            </p>
            <p className="line-clamp-3 font-fw-sans text-caption text-text-secondary">
              {topInsight.content}
            </p>
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
          <GenomeRadar
            data={genomeAxes}
            seriesName="Score"
            max={100}
            height={96}
            className="border-0 bg-transparent p-0 shadow-none backdrop-blur-none"
          />
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

      {showThemes ? (
        <BentoCell
          label="Themes"
          span={2}
          headline={{ value: String(themes.length), unit: themes.length === 1 ? 'theme' : 'themes' }}
          sentence="The recurring patterns behind your scores."
          onOpen={() => stage.open('insights')}
        />
      ) : null}
    </Bento>
  );
}
