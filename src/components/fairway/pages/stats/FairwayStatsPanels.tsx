'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  MetricCard,
  Surface,
  Skeleton,
  BarCompare,
  Ribbon,
  type ReadoutDelta,
  type RibbonPoint,
} from '@/components/fairway';
import { Segmented } from '@/components/fairway/controls/segmented';
import type { StatsCategory } from '@/components/golf/stats/GolfStatsDisplay';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { StatisticalStrengthWeakness } from '@/lib/golf/strokes-gained';
import type {
  TrendAnalysisResponse,
  SprayChartResponse,
  CourseBreakdownResponse,
  WorstHoleResponse,
} from '@/app/golf/actions/stats-data-types';
import type { PlayerLeakMaps, PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import { StatsSection, StatsStaggerGrid, StatsStaggerItem } from './StatsSection';
import { StatsFundamentalsGrid } from './StatsFundamentalsGrid';
import { SgAreaCardGrid, type SgAreaItem } from './SgAreaCardGrid';
import { FairwayStrengthWeaknessCard } from './FairwayStrengthWeaknessCard';
import { FairwayScoringByPar } from './FairwayScoringByPar';
import { FairwayRecentRounds } from './FairwayRecentRounds';
import { FairwayPeriodCompareBand } from './FairwayPeriodCompareBand';
import { FairwayPersonalRecords } from './FairwayPersonalRecords';
import { FairwayPuttingHeatmapSection } from './FairwayPuttingHeatmapSection';
import { FairwayStandingMatrix } from './FairwayStandingMatrix';
import {
  ApproachEfficiencyTable,
  ApproachMissCompass,
  ApproachProximityTable,
  AtgEfficiencySection,
  BestHolesSection,
  CourseBreakdownList,
  DrivingDetailRows,
  GirByDistanceRows,
  HoleAnalysisSummary,
  MakePctGrid,
  PuttingByBreakSection,
  PuttingMissDirectionGrid,
  RoundTypeCompare,
  ScoringDistributionBar,
  ScoringStreaks,
  SgPerRoundTiles,
  StatRowList,
} from './FairwayStatsDeepSections';
import { getCategoryDef } from './player-stats-theme';
import { finite, fmtPct, fmtNum, toChartBuckets, buildVitalDelta } from './fairway-stats-utils';
import { MotionDiv, useStatsMotion } from './fairway-stats-motion';

const LeakMap = dynamic(
  () => import('@/components/fairway/charts/LeakMap').then((m) => m.LeakMap),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const ShotDispersion = dynamic(
  () => import('@/components/fairway/charts/ShotDispersion').then((m) => m.ShotDispersion),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const FairwayDrivingSpray = dynamic(
  () => import('@/components/fairway/pages/coachhelm/FairwayDrivingSpray').then((m) => m.FairwayDrivingSpray),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const StrokesGainedTornado = dynamic(
  () => import('@/components/fairway/charts/StrokesGainedTornado').then((m) => m.StrokesGainedTornado),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

function ChartSkeleton() {
  return <Skeleton className="h-[220px] w-full rounded-card" />;
}

type HoleFormat = 'all' | '18' | '9';

export interface FairwayStatsPanelProps {
  category: StatsCategory;
  stats: GolfStats;
  playerId?: string;
  trendData: TrendAnalysisResponse | null;
  sprayData: SprayChartResponse | null;
  leakMaps: PlayerLeakMaps | null;
  standingRows: PlayerStandingRow[] | null;
  sgCategoryItems: SgAreaItem[];
  vitalsDeltas: { fairways?: ReadoutDelta; gir?: ReadoutDelta; putts?: ReadoutDelta };
  courseBreakdown: CourseBreakdownResponse | null;
  worstHoleData: WorstHoleResponse | null;
  statisticalStrengths?: StatisticalStrengthWeakness[];
  statisticalWeaknesses?: StatisticalStrengthWeakness[];
}

function FormatToggle({
  stats,
  value,
  onChange,
}: {
  stats: GolfStats;
  value: HoleFormat;
  onChange: (v: HoleFormat) => void;
}) {
  if (stats.roundsPlayed18 === 0 || stats.roundsPlayed9 === 0) return null;
  return (
    <Segmented<HoleFormat>
      size="sm"
      aria-label="Round format"
      value={value}
      onValueChange={onChange}
      options={[
        { value: 'all', label: `All (${stats.roundsPlayed})` },
        { value: '18', label: `18H (${stats.roundsPlayed18})` },
        { value: '9', label: `9H (${stats.roundsPlayed9})` },
      ]}
    />
  );
}

function trendPoints(series: { date: string; value: number }[] | undefined): RibbonPoint[] {
  return (series ?? [])
    .filter((p) => finite(p.value) !== null)
    .map((p) => ({ x: p.date, y: p.value }));
}

function MetricTileGrid({
  items,
}: {
  items: Array<{ label: string; value: string; sub?: string; tint: string; border: string }>;
}) {
  return (
    <StatsStaggerGrid className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <StatsStaggerItem key={item.label}>
          <div className={cn('h-full rounded-card border p-4', item.tint, item.border)}>
            <p className="font-fw-sans text-caption font-medium text-text-secondary">{item.label}</p>
            <p className="mt-1 font-fw-mono text-h3 font-semibold tabular-nums text-text-primary">{item.value}</p>
            {item.sub ? <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">{item.sub}</p> : null}
          </div>
        </StatsStaggerItem>
      ))}
    </StatsStaggerGrid>
  );
}

function AnimatedPanel({ children, className }: { children: ReactNode; className?: string }) {
  const motion = useStatsMotion();
  return (
    <MotionDiv
      className={cn('flex flex-col gap-8', className)}
      initial={motion.reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </MotionDiv>
  );
}

function buildTornadoData(sgCategoryItems: SgAreaItem[]) {
  return sgCategoryItems.map((item) => ({
    label: item.cfg.display_label.replace(/^SG:\s*/, ''),
    value: item.row.player_value,
  }));
}

export function FairwayStatsPanel({
  category,
  stats,
  playerId,
  trendData,
  sprayData,
  leakMaps,
  standingRows,
  sgCategoryItems,
  vitalsDeltas,
  courseBreakdown,
  worstHoleData,
  statisticalStrengths,
  statisticalWeaknesses,
}: FairwayStatsPanelProps) {
  const [holeFormat, setHoleFormat] = useState<HoleFormat>('all');
  const def = getCategoryDef(category);

  const scoreTrend = useMemo(() => trendPoints(trendData?.trends.score), [trendData]);
  const girTrend = useMemo(() => trendPoints(trendData?.trends.gir), [trendData]);
  const puttsTrend = useMemo(() => trendPoints(trendData?.trends.putts), [trendData]);
  const fairwayTrend = useMemo(() => trendPoints(trendData?.trends.fairway), [trendData]);
  const scoreBenchmark = finite(trendData?.periodComparison.last30Days.scoringAvg);
  const tornadoData = useMemo(() => buildTornadoData(sgCategoryItems), [sgCategoryItems]);

  const scoringAvg =
    holeFormat === '9'
      ? stats.scoringAverage9
      : holeFormat === '18'
        ? stats.scoringAverage18
        : stats.scoringAverage;
  const bestRound =
    holeFormat === '9' ? stats.bestRound9 : holeFormat === '18' ? stats.bestRound18 : stats.bestRound;
  const worstRound =
    holeFormat === '9' ? stats.worstRound9 : holeFormat === '18' ? stats.worstRound18 : stats.worstRound;

  if (category === 'overview') {
    return (
      <AnimatedPanel>
        <FairwayPeriodCompareBand trendData={trendData} />
        <StatsSection title="Fundamentals" description="Traditional stats at a glance." accent="accent">
          <StatsFundamentalsGrid detailedStats={stats} vitalsDeltas={vitalsDeltas} />
        </StatsSection>
        {sgCategoryItems.length > 0 ? (
          <StatsSection title="Strokes gained by area" description="Green is gaining vs Tour; amber is leaking." accent="accent">
            <SgAreaCardGrid items={sgCategoryItems} />
          </StatsSection>
        ) : null}
        <StatsSection title="Where strokes leak" description="Make rate and approach proximity vs PGA Tour." accent="putting">
          <div className="grid gap-6 lg:grid-cols-2">
            <LeakMap
              title="Putt make %"
              overline="Putting"
              subtitle="Make rate by distance"
              takeaway="Bands below the Tour line are where putts leak."
              direction="higher_better"
              unit="percent"
              data={leakMaps ? toChartBuckets(leakMaps.putting) : []}
            />
            <LeakMap
              title="Approach proximity"
              overline="Approach"
              subtitle="Avg distance to hole by approach length"
              takeaway="Bands above Tour leave you farther from the hole."
              direction="lower_better"
              unit="feet"
              data={leakMaps ? toChartBuckets(leakMaps.approach) : []}
            />
          </div>
        </StatsSection>
        <ScoringDistributionBar stats={stats} />
        {(statisticalStrengths?.length || statisticalWeaknesses?.length) ? (
          <StatsSection title="Biggest movers" description="Statistical strengths and leaks from your rounds." accent="accent">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="font-fw-sans text-caption font-semibold uppercase tracking-wide text-accent-700">Strengths</p>
                {(statisticalStrengths ?? []).slice(0, 3).map((s) => (
                  <StatsStaggerItem key={s.label}>
                    <FairwayStrengthWeaknessCard item={s} type="strength" />
                  </StatsStaggerItem>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <p className="font-fw-sans text-caption font-semibold uppercase tracking-wide text-fw-warning">Leaks</p>
                {(statisticalWeaknesses ?? []).slice(0, 3).map((w) => (
                  <StatsStaggerItem key={w.label}>
                    <FairwayStrengthWeaknessCard item={w} type="weakness" />
                  </StatsStaggerItem>
                ))}
              </div>
            </div>
          </StatsSection>
        ) : null}
      </AnimatedPanel>
    );
  }

  if (category === 'progress') {
    return (
      <AnimatedPanel>
        <StatsSection title="Momentum" description="How your game is moving — last 30 days vs prior." accent="accent">
          <FairwayPeriodCompareBand trendData={trendData} />
        </StatsSection>
        <StatsSection title="Trend ribbons" description="Score, GIR, fairways, and putting across logged rounds." accent="accent">
          <div className="grid gap-6 lg:grid-cols-1">
            <Ribbon
              title="Scoring average"
              overline="Progress"
              takeaway="Lower is better — benchmark is your 30-day average."
              data={scoreTrend}
              benchmark={scoreBenchmark != null ? { value: scoreBenchmark, label: '30d avg' } : undefined}
              valueFormatter={(v) => v.toFixed(1)}
              seriesName="Score"
            />
            <div className="grid gap-6 md:grid-cols-2">
              <Ribbon
                title="Greens in regulation"
                overline="Approach"
                data={girTrend}
                valueFormatter={(v) => `${v.toFixed(0)}%`}
                seriesName="GIR"
              />
              <Ribbon
                title="Fairways hit"
                overline="Driving"
                data={fairwayTrend}
                valueFormatter={(v) => `${v.toFixed(0)}%`}
                seriesName="FW"
              />
              <Ribbon
                title="Putts per round"
                overline="Putting"
                data={puttsTrend}
                valueFormatter={(v) => v.toFixed(1)}
                seriesName="Putts"
              />
            </div>
          </div>
        </StatsSection>
        {trendData?.rounds.length ? <FairwayRecentRounds rounds={trendData.rounds} showDetail /> : null}
      </AnimatedPanel>
    );
  }

  if (category === 'dispersion') {
    return (
      <AnimatedPanel>
        <StatsSection title="Off the tee" description="Dispersion pattern for tee shots." accent="driving">
          <FairwayDrivingSpray group={sprayData?.driving ?? null} />
        </StatsSection>
        {sprayData?.approach?.points && sprayData.approach.points.length > 0 ? (
          <StatsSection title="Approach dispersion" description="Where approach shots finish relative to the green." accent="approach">
            <ShotDispersion
              title="Approach shot pattern"
              overline="Spray"
              data={sprayData.approach.points.map((p) => ({ x: p.x, y: p.y }))}
            />
          </StatsSection>
        ) : null}
        <ApproachMissCompass stats={stats} />
      </AnimatedPanel>
    );
  }

  if (category === 'scoring') {
    return (
      <AnimatedPanel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-fw-sans text-body-sm text-text-tertiary">{def.hint}</p>
          <FormatToggle stats={stats} value={holeFormat} onChange={setHoleFormat} />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="Scoring avg" value={scoringAvg ?? 0} decimals={1} goodDirection="down" density="compact" />
          <MetricCard label="Best round" value={bestRound ?? 0} decimals={0} density="compact" />
          <MetricCard label="Worst round" value={worstRound ?? 0} decimals={0} density="compact" />
          <MetricCard label="Rounds" value={stats.roundsPlayed} decimals={0} density="compact" />
        </div>
        {holeFormat === 'all' && stats.roundsPlayed18 > 0 && stats.roundsPlayed9 > 0 ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="18H avg" value={stats.scoringAverage18 ?? 0} decimals={1} goodDirection="down" density="compact" />
            <MetricCard label="9H avg" value={stats.scoringAverage9 ?? 0} decimals={1} goodDirection="down" density="compact" />
            <MetricCard label="Best 18H" value={stats.bestRound18 ?? 0} decimals={0} density="compact" />
            <MetricCard label="Best 9H" value={stats.bestRound9 ?? 0} decimals={0} density="compact" />
          </div>
        ) : null}
        <ScoringDistributionBar stats={stats} />
        <FairwayScoringByPar stats={stats} />
        <RoundTypeCompare stats={stats} />
        <Ribbon
          title="Score by round"
          overline="Scoring"
          takeaway="Trace across every logged round."
          data={scoreTrend}
          benchmark={scoreBenchmark != null ? { value: scoreBenchmark, label: '30d avg' } : undefined}
          valueFormatter={(v) => v.toFixed(1)}
        />
        <ScoringStreaks stats={stats} />
        {trendData?.rounds.length ? <FairwayRecentRounds rounds={trendData.rounds} showDetail /> : null}
      </AnimatedPanel>
    );
  }

  if (category === 'driving') {
    const missData = [
      { label: 'Miss left', value: stats.missLeftPct ?? 0, highlight: (stats.missLeftPct ?? 0) > (stats.missRightPct ?? 0) },
      { label: 'Miss right', value: stats.missRightPct ?? 0, highlight: (stats.missRightPct ?? 0) > (stats.missLeftPct ?? 0) },
    ].filter((d) => d.value > 0);

    return (
      <AnimatedPanel>
        <MetricTileGrid
          items={[
            { label: 'Avg distance', value: fmtNum(stats.drivingDistanceAvg, 0), sub: 'yards', tint: 'bg-sky-500/10', border: 'border-sky-500/25' },
            { label: 'Driver distance', value: fmtNum(stats.drivingDistanceDriverOnly, 0), sub: 'yards', tint: 'bg-sky-500/10', border: 'border-sky-500/25' },
            { label: 'Non-driver', value: fmtNum(stats.drivingDistanceNonDriverOnly, 0), sub: 'yards', tint: 'bg-sky-500/10', border: 'border-sky-500/25' },
            { label: 'Fairways', value: fmtPct(stats.fairwayPercentage), sub: `${stats.fairwaysHit}/${stats.fairwayOpportunities}`, tint: 'bg-accent-600/8', border: 'border-accent-600/25' },
            { label: 'FW / round', value: fmtNum(stats.fairwaysHitPerRound, 1), tint: 'bg-accent-600/8', border: 'border-accent-600/25' },
          ]}
        />
        {missData.length > 0 ? (
          <BarCompare
            title="Tee miss tendency"
            overline="Driving"
            takeaway="Share of recorded left vs right misses off the tee."
            data={missData}
            valueFormatter={(v) => `${Math.round(v)}%`}
          />
        ) : null}
        <DrivingDetailRows stats={stats} />
        <FairwayDrivingSpray group={sprayData?.driving ?? null} />
      </AnimatedPanel>
    );
  }

  if (category === 'approach') {
    return (
      <AnimatedPanel>
        <MetricTileGrid
          items={[
            { label: 'GIR', value: fmtPct(stats.girPercentage), sub: `${stats.girTotal}/${stats.girOpportunities}`, tint: 'bg-lime-500/10', border: 'border-lime-500/25' },
            { label: 'GIR / round', value: fmtNum(stats.girPerRound, 1), tint: 'bg-lime-500/10', border: 'border-lime-500/25' },
            { label: 'Proximity', value: stats.approachProximityAvg != null ? `${fmtNum(stats.approachProximityAvg, 1)} ft` : '—', tint: 'bg-lime-500/10', border: 'border-lime-500/25' },
            { label: 'When hit green', value: stats.approachProximityWhenHitGreen != null ? `${fmtNum(stats.approachProximityWhenHitGreen, 1)} ft` : '—', tint: 'bg-accent-600/8', border: 'border-accent-600/25' },
          ]}
        />
        <StatsSection title="GIR by hole type" accent="approach">
          <StatRowList
            items={[
              { label: 'Par 3', value: fmtPct(stats.girPctPar3) },
              { label: 'Par 4', value: fmtPct(stats.girPctPar4) },
              { label: 'Par 5', value: fmtPct(stats.girPctPar5) },
              { label: 'From fairway', value: fmtPct(stats.girPctFromFairway) },
              { label: 'From rough', value: fmtPct(stats.girPctFromRough) },
              { label: 'From sand', value: fmtPct(stats.girPctFromSand) },
            ].filter((i) => i.value !== '—')}
          />
        </StatsSection>
        <GirByDistanceRows stats={stats} />
        <LeakMap
          title="Approach proximity vs Tour"
          overline="Approach"
          direction="lower_better"
          unit="feet"
          data={leakMaps ? toChartBuckets(leakMaps.approach) : []}
        />
        <ApproachProximityTable stats={stats} />
        <ApproachMissCompass stats={stats} />
        <ApproachEfficiencyTable stats={stats} />
        {sprayData?.approach?.points && sprayData.approach.points.length > 0 ? (
          <ShotDispersion
            title="Approach shot pattern"
            overline="Spray"
            data={sprayData.approach.points.map((p) => ({ x: p.x, y: p.y }))}
          />
        ) : null}
      </AnimatedPanel>
    );
  }

  if (category === 'putting') {
    return (
      <AnimatedPanel>
        <FairwayPuttingHeatmapSection playerId={playerId} />
        <MetricTileGrid
          items={[
            { label: 'Putts / round', value: fmtNum(stats.puttsPerRound, 1), tint: 'bg-emerald-500/12', border: 'border-emerald-500/30' },
            { label: 'Putts / GIR', value: fmtNum(stats.puttsPerGir, 2), tint: 'bg-emerald-500/12', border: 'border-emerald-500/30' },
            { label: 'One-putts / round', value: stats.roundsPlayed > 0 ? fmtNum(stats.onePuttsTotal / stats.roundsPlayed, 1) : '—', tint: 'bg-accent-600/8', border: 'border-accent-600/25' },
            { label: 'Three-putts / round', value: fmtNum(stats.threePuttsPerRound, 1), tint: 'bg-fw-warning-bg/60', border: 'border-fw-warning/30' },
          ]}
        />
        <StatsSection title="Make % by distance" accent="putting">
          <MakePctGrid
            bands={[
              { label: '0–3 ft', value: stats.puttMakePct0_3 },
              { label: '3–5 ft', value: stats.puttMakePct3_5 },
              { label: '5–10 ft', value: stats.puttMakePct5_10 },
              { label: '10–15 ft', value: stats.puttMakePct10_15 },
              { label: '15–20 ft', value: stats.puttMakePct15_20 },
              { label: '20–25 ft', value: stats.puttMakePct20_25 },
              { label: '25–30 ft', value: stats.puttMakePct25_30 },
              { label: '30–35 ft', value: stats.puttMakePct30_35 },
              { label: '35+ ft', value: stats.puttMakePct35Plus },
            ]}
          />
        </StatsSection>
        <LeakMap
          title="Make rate vs Tour"
          overline="Putting"
          direction="higher_better"
          unit="percent"
          data={leakMaps ? toChartBuckets(leakMaps.putting) : []}
        />
        <StatsSection title="First putt leave (avg ft remaining)" accent="putting">
          <StatRowList
            items={[
              { label: '0–5 ft', value: stats.puttProximity0_5 != null ? `${stats.puttProximity0_5.toFixed(1)} ft` : '—' },
              { label: '5–10 ft', value: stats.puttProximity5_10 != null ? `${stats.puttProximity5_10.toFixed(1)} ft` : '—' },
              { label: '10–15 ft', value: stats.puttProximity10_15 != null ? `${stats.puttProximity10_15.toFixed(1)} ft` : '—' },
              { label: '15–20 ft', value: stats.puttProximity15_20 != null ? `${stats.puttProximity15_20.toFixed(1)} ft` : '—' },
              { label: '20+ ft', value: stats.puttProximity20Plus != null ? `${stats.puttProximity20Plus.toFixed(1)} ft` : '—' },
            ].filter((i) => i.value !== '—')}
          />
        </StatsSection>
        <PuttingMissDirectionGrid stats={stats} />
        <PuttingByBreakSection stats={stats} />
      </AnimatedPanel>
    );
  }

  if (category === 'scrambling') {
    return (
      <AnimatedPanel>
        <MetricTileGrid
          items={[
            { label: 'Scrambling', value: fmtPct(stats.scramblingPercentage), sub: `${stats.scramblesMade}/${stats.scrambleAttempts}`, tint: 'bg-amber-500/10', border: 'border-amber-500/25' },
            { label: 'Sand saves', value: fmtPct(stats.sandSavePercentage), sub: `${stats.sandSavesMade}/${stats.sandSaveAttempts}`, tint: 'bg-amber-500/10', border: 'border-amber-500/25' },
            { label: 'Up & downs / round', value: stats.roundsPlayed > 0 ? fmtNum(stats.scramblesMade / stats.roundsPlayed, 1) : '—', tint: 'bg-accent-600/8', border: 'border-accent-600/25' },
            { label: 'Penalties / round', value: fmtNum(stats.penaltiesPerRound, 2), tint: 'bg-fw-warning-bg/50', border: 'border-fw-warning/25' },
          ]}
        />
        <BarCompare
          title="Scrambling by lie"
          overline="Short game"
          data={[
            { label: 'Fairway', value: stats.scramblingPctFairway ?? 0 },
            { label: 'Rough', value: stats.scramblingPctRough ?? 0 },
            { label: 'Sand', value: stats.scramblingPctSand ?? 0 },
          ].filter((d) => d.value > 0)}
          valueFormatter={(v) => `${Math.round(v)}%`}
        />
        <AtgEfficiencySection stats={stats} />
        <StatsSection title="Penalties" accent="scrambling">
          <StatRowList
            items={[
              { label: 'Total penalties', value: String(stats.totalPenalties) },
              { label: 'Per round', value: fmtNum(stats.penaltiesPerRound, 2) },
            ]}
          />
        </StatsSection>
      </AnimatedPanel>
    );
  }

  if (category === 'strokes-gained') {
    return (
      <AnimatedPanel>
        {tornadoData.length > 0 ? (
          <StrokesGainedTornado
            title="Strokes gained vs Tour"
            overline="SG"
            takeaway="Green bars are strokes gained; amber is strokes lost."
            data={tornadoData}
            height={240}
          />
        ) : null}
        {sgCategoryItems.length > 0 ? <SgAreaCardGrid items={sgCategoryItems} /> : null}
        <SgPerRoundTiles stats={stats} />
        {(statisticalStrengths?.length || statisticalWeaknesses?.length) ? (
          <StatsSection title="Tour comparison insights" accent="accent">
            <div className="grid gap-3 md:grid-cols-2">
              {(statisticalStrengths ?? []).slice(0, 4).map((s) => (
                <StatsStaggerItem key={s.label}>
                  <FairwayStrengthWeaknessCard item={s} type="strength" />
                </StatsStaggerItem>
              ))}
              {(statisticalWeaknesses ?? []).slice(0, 4).map((w) => (
                <StatsStaggerItem key={w.label}>
                  <FairwayStrengthWeaknessCard item={w} type="weakness" />
                </StatsStaggerItem>
              ))}
            </div>
          </StatsSection>
        ) : null}
        <FairwayStandingMatrix standingRows={standingRows} compact />
      </AnimatedPanel>
    );
  }

  if (category === 'analysis') {
    const worst = worstHoleData?.worstHoles ?? worstHoleData?.holes ?? [];

    return (
      <AnimatedPanel>
        <StatsSection title="Personal records" accent="accent">
          <FairwayPersonalRecords trendData={trendData} />
        </StatsSection>
        <HoleAnalysisSummary worstHoleData={worstHoleData} />
        <BestHolesSection worstHoleData={worstHoleData} />
        <CourseBreakdownList courseBreakdown={courseBreakdown} />
        {worst.length > 0 ? (
          <StatsSection title="Toughest holes" description="Highest average score vs par." accent="default">
            <div className="grid gap-2 sm:grid-cols-2">
              {worst.slice(0, 6).map((h) => (
                <Surface key={`hole-${h.holeNumber}-${h.par}`} elevation="border" padding="md" className="border-l-[3px] border-l-fw-warning">
                  <p className="font-fw-sans text-body-sm font-semibold text-text-primary">
                    Hole {h.holeNumber} · Par {h.par}
                  </p>
                  <p className="font-fw-sans text-caption text-text-tertiary">{h.timesPlayed} plays logged</p>
                  <p className="mt-1 font-fw-mono text-h3 tabular-nums text-fw-warning">
                    {h.averageToPar > 0 ? '+' : ''}{h.averageToPar?.toFixed(2) ?? '—'} avg
                  </p>
                </Surface>
              ))}
            </div>
          </StatsSection>
        ) : null}
        <FairwayStandingMatrix
          standingRows={standingRows}
          title="Complete standing"
          description="Every metric vs team and Tour."
        />
      </AnimatedPanel>
    );
  }

  return null;
}

/** Build SG category items from standing rows. */
export function buildSgCategoryItems(standingRows: PlayerStandingRow[] | null): SgAreaItem[] {
  const SG = ['sg_ott', 'sg_approach', 'sg_around_green', 'sg_putting'] as const;
  const map = new Map<string, PlayerStandingRow>();
  for (const row of standingRows ?? []) map.set(row.metric_id, row);
  const items: SgAreaItem[] = [];
  for (const id of SG) {
    const row = map.get(id);
    const cfg = getMetricRenderConfig(id);
    if (row && cfg) items.push({ id, row, cfg });
  }
  return items;
}

export function buildVitalsDeltas(trendData: TrendAnalysisResponse | null) {
  const cmp = trendData?.periodComparison ?? null;
  if (!cmp) return { fairways: undefined, gir: undefined, putts: undefined };
  const cr = cmp.last30Days.roundCount;
  const pr = cmp.previous30Days.roundCount;
  return {
    fairways: buildVitalDelta({
      current: cmp.last30Days.fairwayPct,
      previous: cmp.previous30Days.fairwayPct,
      currentRounds: cr,
      previousRounds: pr,
      percent: true,
    }),
    gir: buildVitalDelta({
      current: cmp.last30Days.girPct,
      previous: cmp.previous30Days.girPct,
      currentRounds: cr,
      previousRounds: pr,
      percent: true,
    }),
    putts: buildVitalDelta({
      current: cmp.last30Days.puttsPerRound,
      previous: cmp.previous30Days.puttsPerRound,
      currentRounds: cr,
      previousRounds: pr,
      goodWhenLower: true,
      digits: 1,
    }),
  };
}
