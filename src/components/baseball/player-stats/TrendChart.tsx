'use client';

/**
 * TrendChart — season batting-average trend.
 *
 * Living Annual migration (execution plan §3.1 my-stats: "TrendChart (recharts,
 * avg over session_date) → ClimbArc"). Was a recharts line chart with a
 * 3-metric picker (AVG / exit velo / OBP) and a 5-session moving-average
 * overlay. Per the plan row this collapses to the kit's `<ClimbArc>` viz
 * (design-system-living-annual.md §6 P2 #8) — a single-series "season climb"
 * of AVG readings, oldest → newest, with the best day auto-pinned as a PR and
 * the current reading rolling on the `<StatReadout>` odometer in the header.
 * The metric picker and moving-average overlay are demoted (see the PR's
 * layout brief) — the exact multi-metric numbers still live in
 * `<StatsOverviewCards>` / `<SessionHistory>` elsewhere on the page.
 *
 * Sessions with zero at-bats (no AVG to plot — e.g. a pitching-only outing)
 * are skipped rather than plotted as a broken/null point; `<ClimbArc>` itself
 * renders an honest "not enough data yet" letter for fewer than two points.
 */
import { useMemo } from 'react';
import { ClimbArc } from '@/components/baseball/living-annual';
import type { BaseballPlayerStats } from '@/lib/types';

interface TrendChartProps {
  stats: BaseballPlayerStats[];
  className?: string;
}

export function TrendChart({ stats, className }: TrendChartProps) {
  const points = useMemo(
    () =>
      [...stats]
        .filter((s) => s.at_bats > 0)
        .sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime())
        .map((s) => ({
          label: new Date(s.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          value: s.hits / s.at_bats,
        })),
    [stats],
  );

  return <ClimbArc points={points} goal={0.3} unit="AVG" title="Batting Average" className={className} />;
}
