'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Surface, SegmentBar } from '@/components/fairway';
import { Segmented } from '@/components/fairway/controls/segmented';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { formatStat } from '@/lib/utils/golf-stats-calculator-shots';
import type { CourseBreakdownResponse, WorstHoleResponse } from '@/app/golf/actions/stats-data-types';
import { StatsSection, StatsStaggerGrid, StatsStaggerItem } from './StatsSection';
import { MotionSpan, useStatsMotion } from './fairway-stats-motion';
import { finite, fmtPct, fmtNum } from './fairway-stats-utils';

export function StatRowList({
  items,
}: {
  items: Array<{ label: string; value: string; highlight?: boolean }>;
}) {
  const motion = useStatsMotion();
  if (items.length === 0) return null;
  return (
    <StatsStaggerGrid className="flex flex-col gap-1 rounded-card border border-border-subtle bg-surface p-1">
      {items.map((item) => (
        <StatsStaggerItem key={item.label}>
          <div
            className={cn(
              'flex items-center justify-between gap-4 rounded-[10px] px-4 py-2.5',
              item.highlight ? 'bg-accent-600/5' : 'bg-surface-sunken/40',
            )}
          >
            <span className="font-fw-sans text-body-sm text-text-secondary">{item.label}</span>
            <MotionSpan className="font-fw-mono text-body-sm font-medium tabular-nums text-text-primary" {...motion.valuePop}>
              {item.value}
            </MotionSpan>
          </div>
        </StatsStaggerItem>
      ))}
    </StatsStaggerGrid>
  );
}

export function MakePctGrid({
  bands,
}: {
  bands: Array<{ label: string; value: number | null }>;
}) {
  const motion = useStatsMotion();
  const visible = bands.filter((b) => finite(b.value) !== null);
  if (visible.length === 0) return null;
  return (
    <StatsStaggerGrid className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
      {visible.map((b) => (
        <StatsStaggerItem key={b.label}>
          <Surface elevation="border" padding="sm" className="text-center">
            <MotionSpan className="block font-fw-mono text-h3 font-semibold tabular-nums text-text-primary" {...motion.valuePop}>
              {fmtPct(b.value)}
            </MotionSpan>
            <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">{b.label}</p>
          </Surface>
        </StatsStaggerItem>
      ))}
    </StatsStaggerGrid>
  );
}

export function ScoringDistributionBar({ stats }: { stats: GolfStats }) {
  const parts = [
    { label: 'Eagles', value: stats.totalEagles, tone: 'good' as const },
    { label: 'Birdies', value: stats.totalBirdies, tone: 'good' as const },
    { label: 'Pars', value: stats.totalPars, tone: 'neutral' as const },
    { label: 'Bogeys', value: stats.totalBogeys, tone: 'caution' as const },
    { label: 'Double+', value: stats.totalDoublePlus, tone: 'caution' as const },
  ].filter((p) => p.value > 0);
  if (parts.length === 0) return null;
  return (
    <SegmentBar
      title="Scoring distribution"
      overline="Scoring"
      takeaway="Share of all hole outcomes across logged rounds."
      parts={parts}
      primary="good"
    />
  );
}

export function RoundTypeCompare({ stats }: { stats: GolfStats }) {
  const items = [
    { label: 'Practice', avg: stats.practiceScoringAvg, n: stats.practiceRounds },
    { label: 'Qualifying', avg: stats.qualifyingScoringAvg, n: stats.qualifyingRounds },
    { label: 'Tournament', avg: stats.tournamentScoringAvg, n: stats.tournamentRounds },
  ].filter((i) => i.n > 0);
  if (items.length === 0) return null;
  return (
    <StatsSection title="Round type splits" description="Scoring average by round category." accent="scoring">
      <div className="grid gap-3 sm:grid-cols-3">
        {items.map((i) => (
          <Surface key={i.label} elevation="border" padding="md">
            <p className="font-fw-sans text-caption font-medium text-text-tertiary">{i.label}</p>
            <p className="mt-1 font-fw-mono text-h2 font-semibold tabular-nums text-text-primary">
              {i.avg != null ? i.avg.toFixed(1) : '—'}
            </p>
            <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">{i.n} rounds</p>
          </Surface>
        ))}
      </div>
    </StatsSection>
  );
}

export function ScoringStreaks({ stats }: { stats: GolfStats }) {
  const items = [
    { label: 'Most birdies in a round', value: String(stats.mostBirdiesRound) },
    { label: 'Most birdies in a row', value: String(stats.mostBirdiesRow) },
    { label: 'Most pars in a row', value: String(stats.mostParsRow) },
    { label: 'Current no-3-putt streak', value: `${stats.currentNo3PuttStreak} holes` },
    { label: 'Longest no-3-putt streak', value: `${stats.longestNo3PuttStreak} holes` },
    {
      label: 'Longest hole out',
      value: stats.longestHoleOut != null ? `${Math.round(stats.longestHoleOut)} yd` : '—',
    },
  ];
  return (
    <StatsSection title="Streaks & milestones" accent="scoring">
      <StatRowList items={items} />
    </StatsSection>
  );
}

export function ApproachMissCompass({ stats }: { stats: GolfStats }) {
  if (stats.approachMissTotal <= 0) return null;
  const primary = [
    { label: 'Short', value: stats.approachMissShortPct ?? 0 },
    { label: 'Long', value: stats.approachMissLongPct ?? 0 },
    { label: 'Left', value: stats.approachMissLeftPct ?? 0 },
    { label: 'Right', value: stats.approachMissRightPct ?? 0 },
  ].filter((d) => d.value > 0);

  const compound = [
    { label: 'Short-left', value: stats.approachMissShortLeftPct },
    { label: 'Short-right', value: stats.approachMissShortRightPct },
    { label: 'Long-left', value: stats.approachMissLongLeftPct },
    { label: 'Long-right', value: stats.approachMissLongRightPct },
  ].filter((d) => finite(d.value) !== null && (d.value ?? 0) > 0);

  return (
    <StatsSection title="Miss direction (when missing green)" accent="approach">
      {primary.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {primary.map((p) => (
            <Surface key={p.label} elevation="border" padding="md" className="text-center">
              <p className="font-fw-mono text-h3 font-semibold tabular-nums text-text-primary">{fmtPct(p.value)}</p>
              <p className="font-fw-sans text-caption text-text-tertiary">{p.label}</p>
            </Surface>
          ))}
        </div>
      ) : null}
      {compound.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {compound.map((p) => (
            <Surface key={p.label} elevation="border" padding="sm" className="text-center">
              <p className="font-fw-mono text-body font-semibold tabular-nums">{fmtPct(p.value)}</p>
              <p className="font-fw-sans text-caption text-text-tertiary">{p.label}</p>
            </Surface>
          ))}
        </div>
      ) : null}
    </StatsSection>
  );
}

export function GirByDistanceRows({ stats }: { stats: GolfStats }) {
  const items = [
    { label: '50–75 yd', value: stats.girPct50_75 },
    { label: '75–100 yd', value: stats.girPct75_100 },
    { label: '100–125 yd', value: stats.girPct100_125 },
    { label: '125–150 yd', value: stats.girPct125_150 },
    { label: '150–175 yd', value: stats.girPct150_175 },
    { label: '175–200 yd', value: stats.girPct175_200 },
    { label: '200–225 yd', value: stats.girPct200_225 },
    { label: '225+ yd', value: stats.girPct225Plus },
  ];
  return (
    <StatsSection title="GIR by approach distance" accent="approach">
      <StatRowList
        items={items
          .filter((i) => finite(i.value) !== null)
          .map((i) => ({ label: i.label, value: fmtPct(i.value) }))}
      />
    </StatsSection>
  );
}

export function ApproachProximityTable({ stats }: { stats: GolfStats }) {
  const byDist = [
    { label: '50–75 yd', value: stats.approachProx30_75 },
    { label: '75–100 yd', value: stats.approachProx75_100 },
    { label: '100–125 yd', value: stats.approachProx100_125 },
    { label: '125–150 yd', value: stats.approachProx125_150 },
    { label: '150–175 yd', value: stats.approachProx150_175 },
    { label: '175–200 yd', value: stats.approachProx175_200 },
    { label: '200–225 yd', value: stats.approachProx200_225 },
    { label: '225+ yd', value: stats.approachProx225Plus },
  ];
  const byLie = [
    { label: 'From fairway', value: stats.approachProximityFairway },
    { label: 'From rough', value: stats.approachProximityRough },
    { label: 'From sand', value: stats.approachProximitySand },
  ];
  const byPar = [
    { label: 'Par 3', value: stats.approachProximityPar3 },
    { label: 'Par 4', value: stats.approachProximityPar4 },
    { label: 'Par 5', value: stats.approachProximityPar5 },
  ];
  const fmtFeet = (v: number | null) => (v != null ? `${Math.round(v)} ft` : '—');

  return (
    <div className="flex flex-col gap-6">
      <StatsSection title="Proximity by distance" accent="approach">
        <StatRowList items={byDist.filter((i) => finite(i.value) !== null).map((i) => ({ label: i.label, value: fmtFeet(i.value) }))} />
      </StatsSection>
      <StatsSection title="Proximity by lie & par" accent="approach">
        <StatRowList
          items={[
            ...byLie.filter((i) => finite(i.value) !== null).map((i) => ({ label: i.label, value: fmtFeet(i.value) })),
            ...byPar.filter((i) => finite(i.value) !== null).map((i) => ({ label: i.label, value: fmtFeet(i.value) })),
          ]}
        />
      </StatsSection>
    </div>
  );
}

export function ApproachEfficiencyTable({ stats }: { stats: GolfStats }) {
  const rows = [
    { label: '50–75 yd', data: stats.approachEff30_75 },
    { label: '75–100 yd', data: stats.approachEff75_100 },
    { label: '100–125 yd', data: stats.approachEff100_125 },
    { label: '125–150 yd', data: stats.approachEff125_150 },
    { label: '150–175 yd', data: stats.approachEff150_175 },
    { label: '175–200 yd', data: stats.approachEff175_200 },
    { label: '200–225 yd', data: stats.approachEff200_225 },
    { label: '225+ yd', data: stats.approachEff225Plus },
  ].filter(
    (r) =>
      finite(r.data.fairway) !== null ||
      finite(r.data.rough) !== null ||
      finite(r.data.sand) !== null,
  );
  if (rows.length === 0) return null;

  return (
    <StatsSection title="Strokes to hole out (approach efficiency)" accent="approach">
      <div className="overflow-x-auto rounded-card border border-border-subtle">
        <table className="w-full min-w-[320px] text-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-sunken">
              <th className="px-3 py-2 text-left font-fw-sans text-caption font-semibold text-text-secondary">Distance</th>
              <th className="px-3 py-2 text-center font-fw-sans text-caption font-semibold text-accent-700">Fairway</th>
              <th className="px-3 py-2 text-center font-fw-sans text-caption font-semibold text-amber-700">Rough</th>
              <th className="px-3 py-2 text-center font-fw-sans text-caption font-semibold text-orange-700">Sand</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-border-subtle last:border-0">
                <td className="px-3 py-2 font-fw-sans text-body-sm text-text-secondary">{row.label}</td>
                <td className="px-3 py-2 text-center font-fw-mono tabular-nums">{formatStat(row.data.fairway, '', 2)}</td>
                <td className="px-3 py-2 text-center font-fw-mono tabular-nums">{formatStat(row.data.rough, '', 2)}</td>
                <td className="px-3 py-2 text-center font-fw-mono tabular-nums">{formatStat(row.data.sand, '', 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StatsSection>
  );
}

const BREAK_KEYS = ['left_to_right', 'right_to_left', 'straight', 'multiple'] as const;
type BreakKey = (typeof BREAK_KEYS)[number];

const BREAK_LABELS: Record<BreakKey, string> = {
  left_to_right: 'Left → Right',
  right_to_left: 'Right → Left',
  straight: 'Straight',
  multiple: 'Multiple',
};

export function PuttingByBreakSection({ stats }: { stats: GolfStats }) {
  const [selected, setSelected] = useState<BreakKey | null>(null);
  const hasAny = BREAK_KEYS.some((k) => stats.puttingByBreak[k].totalPutts > 0);
  if (!hasAny) return null;

  const breakStats = selected ? stats.puttingByBreak[selected] : null;

  return (
    <StatsSection title="Putting by break type" accent="putting">
      <Segmented<BreakKey | 'all'>
        size="sm"
        aria-label="Putt break type"
        value={selected ?? 'all'}
        onValueChange={(v) => setSelected(v === 'all' ? null : v)}
        options={[
          { value: 'all', label: 'All' },
          ...BREAK_KEYS.filter((k) => stats.puttingByBreak[k].totalPutts > 0).map((k) => ({
            value: k,
            label: BREAK_LABELS[k],
          })),
        ]}
      />
      {breakStats && breakStats.totalPutts > 0 ? (
        <div className="mt-4">
          <p className="mb-3 font-fw-sans text-body-sm text-text-secondary">
            {BREAK_LABELS[selected!]} · {breakStats.totalPutts} putts
          </p>
          <MakePctGrid
            bands={[
              { label: '0–3 ft', value: breakStats.makePct0_3 },
              { label: '3–5 ft', value: breakStats.makePct3_5 },
              { label: '5–10 ft', value: breakStats.makePct5_10 },
              { label: '10–15 ft', value: breakStats.makePct10_15 },
              { label: '15–20 ft', value: breakStats.makePct15_20 },
            ]}
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {BREAK_KEYS.filter((k) => stats.puttingByBreak[k].totalPutts > 0).map((k) => {
            const b = stats.puttingByBreak[k];
            const make5 = b.makePct5_10;
            return (
              <Surface key={k} elevation="border" padding="md">
                <p className="font-fw-sans text-caption font-medium text-text-tertiary">{BREAK_LABELS[k]}</p>
                <p className="mt-1 font-fw-mono text-body font-semibold tabular-nums">
                  {make5 != null ? `${Math.round(make5)}%` : '—'} <span className="text-caption font-normal text-text-tertiary">make 5–10 ft</span>
                </p>
                <p className="font-fw-sans text-caption text-text-tertiary">{b.totalPutts} putts</p>
              </Surface>
            );
          })}
        </div>
      )}
    </StatsSection>
  );
}

export function PuttingMissDirectionGrid({ stats }: { stats: GolfStats }) {
  const items = [
    { label: 'Short', value: stats.puttMissShortPct },
    { label: 'Long', value: stats.puttMissLongPct },
    { label: 'Left', value: stats.puttMissLeftPct },
    { label: 'Right', value: stats.puttMissRightPct },
    { label: 'Low (amateur)', value: stats.puttMissLowPct },
    { label: 'High (pro)', value: stats.puttMissHighPct },
  ].filter((i) => finite(i.value) !== null && (i.value ?? 0) > 0);
  if (items.length === 0) return null;
  return (
    <StatsSection title="Putt miss direction" accent="putting">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {items.map((i) => (
          <Surface key={i.label} elevation="border" padding="sm" className="text-center">
            <p className="font-fw-mono text-h3 font-semibold tabular-nums">{fmtPct(i.value)}</p>
            <p className="font-fw-sans text-caption text-text-tertiary">{i.label}</p>
          </Surface>
        ))}
      </div>
    </StatsSection>
  );
}

export function AtgEfficiencySection({ stats }: { stats: GolfStats }) {
  const byDist = [
    { label: '0–10 yd', value: stats.atgEfficiency0_10 },
    { label: '10–20 yd', value: stats.atgEfficiency10_20 },
    { label: '20–30 yd', value: stats.atgEfficiency20_30 },
  ];
  const byLie = [
    { label: 'Fairway', value: stats.atgEffFairway },
    { label: 'Rough', value: stats.atgEffRough },
    { label: 'Sand', value: stats.atgEffSand },
  ];
  const scrambleDist = [
    { label: '0–10 yd', value: stats.scramblingPct0_10 },
    { label: '10–20 yd', value: stats.scramblingPct10_20 },
    { label: '20–30 yd', value: stats.scramblingPct20_30 },
  ];

  return (
    <div className="flex flex-col gap-6">
      <StatsSection title="Scrambling by distance" accent="scrambling">
        <StatRowList items={scrambleDist.filter((i) => finite(i.value) !== null).map((i) => ({ label: i.label, value: fmtPct(i.value) }))} />
      </StatsSection>
      <StatsSection title="Up-and-down efficiency" accent="scrambling">
        <StatRowList
          items={[
            { label: 'Overall avg', value: fmtNum(stats.atgEfficiencyAvg, 2) },
            ...byDist.filter((i) => finite(i.value) !== null).map((i) => ({ label: i.label, value: fmtNum(i.value, 2) })),
            ...byLie.filter((i) => finite(i.value) !== null).map((i) => ({ label: i.label, value: fmtNum(i.value, 2) })),
          ]}
        />
      </StatsSection>
    </div>
  );
}

export function HoleAnalysisSummary({ worstHoleData }: { worstHoleData: WorstHoleResponse | null }) {
  if (!worstHoleData) return null;
  const items = [
    { label: 'Par 3 avg', value: worstHoleData.par3Average, highlight: worstHoleData.par3Average != null && worstHoleData.par3Average < 0 },
    { label: 'Par 4 avg', value: worstHoleData.par4Average, highlight: worstHoleData.par4Average != null && worstHoleData.par4Average < 0 },
    { label: 'Par 5 avg', value: worstHoleData.par5Average, highlight: worstHoleData.par5Average != null && worstHoleData.par5Average < 0 },
    { label: 'Closing holes (16–18)', value: worstHoleData.closingHolesAverage, highlight: worstHoleData.closingHolesAverage != null && worstHoleData.closingHolesAverage < 0 },
  ].filter((i) => finite(i.value) !== null);

  if (items.length === 0) return null;

  const fmt = (v: number | null) => {
    if (v == null) return '—';
    return v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
  };

  return (
    <StatsSection title="Scoring by hole type" accent="default">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map((i) => (
          <Surface
            key={i.label}
            elevation="border"
            padding="md"
            className={cn(i.highlight && 'border-accent-600/30 bg-accent-600/5')}
          >
            <p className="font-fw-sans text-caption text-text-tertiary">{i.label}</p>
            <p className="mt-1 font-fw-mono text-h3 font-semibold tabular-nums text-text-primary">{fmt(i.value)}</p>
          </Surface>
        ))}
      </div>
    </StatsSection>
  );
}

export function BestHolesSection({ worstHoleData }: { worstHoleData: WorstHoleResponse | null }) {
  const best = worstHoleData?.bestHoles ?? [];
  if (best.length === 0) return null;
  return (
    <StatsSection title="Best holes" description="Lowest average score vs par." accent="accent">
      <div className="grid gap-2 sm:grid-cols-2">
        {best.slice(0, 6).map((h) => (
          <Surface key={`best-${h.holeNumber}-${h.par}`} elevation="border" padding="md" className="border-l-[3px] border-l-accent-600">
            <p className="font-fw-sans text-body-sm font-semibold text-text-primary">
              Hole {h.holeNumber} · Par {h.par}
            </p>
            <p className="font-fw-sans text-caption text-text-tertiary">{h.timesPlayed} plays logged</p>
            <p className="mt-1 font-fw-mono text-h3 tabular-nums text-accent-700">
              {h.averageToPar > 0 ? '+' : ''}{h.averageToPar?.toFixed(2) ?? '—'} avg
            </p>
          </Surface>
        ))}
      </div>
    </StatsSection>
  );
}

export function CourseBreakdownList({
  courseBreakdown,
}: {
  courseBreakdown: CourseBreakdownResponse | null;
}) {
  const courses = courseBreakdown?.courses ?? [];
  if (courses.length === 0) return null;

  return (
    <StatsSection title="Course breakdown" description="Where you play best and worst." accent="default">
      <div className="flex flex-col gap-2">
        {courses.slice(0, 10).map((c) => {
          const isBest = c.courseName === courseBreakdown?.bestCourse;
          const isWorst = c.courseName === courseBreakdown?.worstCourse;
          return (
            <Surface
              key={c.courseName}
              elevation="border"
              padding="md"
              className={cn(
                'flex items-center justify-between gap-4',
                isBest && 'border-accent-600/40 bg-accent-600/8',
                isWorst && 'border-fw-warning/40 bg-fw-warning-bg/40',
              )}
            >
              <div className="min-w-0">
                <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">{c.courseName}</p>
                <p className="font-fw-sans text-caption text-text-tertiary">
                  {c.roundCount} rounds
                  {isBest ? ' · Best avg' : ''}
                  {isWorst ? ' · Toughest avg' : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="font-fw-mono text-body font-semibold tabular-nums text-text-primary">
                  {c.scoringAverage?.toFixed(1) ?? '—'}
                </p>
                <p className="font-fw-sans text-caption text-text-tertiary">avg score</p>
              </div>
            </Surface>
          );
        })}
      </div>
    </StatsSection>
  );
}

export function DrivingDetailRows({ stats }: { stats: GolfStats }) {
  return (
    <div className="flex flex-col gap-6">
      <StatsSection title="Fairway % by hole type" accent="driving">
        <StatRowList
          items={[
            { label: 'Par 4', value: fmtPct(stats.fairwayPctPar4) },
            { label: 'Par 5', value: fmtPct(stats.fairwayPctPar5) },
          ].filter((i) => i.value !== '—')}
        />
      </StatsSection>
      <StatsSection title="Fairway % by club" accent="driving">
        <StatRowList
          items={[
            { label: 'With driver', value: fmtPct(stats.fairwayPctDriver) },
            { label: 'Without driver', value: fmtPct(stats.fairwayPctNonDriver) },
          ].filter((i) => i.value !== '—')}
        />
      </StatsSection>
      {(finite(stats.missLeftPctDriver) !== null || finite(stats.missRightPctDriver) !== null) ? (
        <StatsSection title="Miss bias — driver" accent="driving">
          <StatRowList
            items={[
              { label: 'Miss left', value: fmtPct(stats.missLeftPctDriver) },
              { label: 'Miss right', value: fmtPct(stats.missRightPctDriver) },
            ]}
          />
        </StatsSection>
      ) : null}
    </div>
  );
}

export function SgPerRoundTiles({ stats }: { stats: GolfStats }) {
  const items = [
    { label: 'SG Total', value: stats.sgTotalPerRound },
    { label: 'SG Off the Tee', value: stats.sgTeePerRound },
    { label: 'SG Approach', value: stats.sgApproachPerRound },
    { label: 'SG Around Green', value: stats.sgAroundGreenPerRound },
    { label: 'SG Putting', value: stats.sgPuttingPerRound },
  ].filter((i) => finite(i.value) !== null);
  if (items.length === 0) return null;

  const fmt = (v: number | null) => {
    if (v == null) return '—';
    if (v === 0) return 'E';
    return v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
  };

  return (
    <StatsSection title="Strokes gained per round" description="Computed from shot-level data vs Tour." accent="accent">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {items.map((i) => (
          <Surface key={i.label} elevation="border" padding="md" className="text-center">
            <p className="font-fw-sans text-caption text-text-tertiary">{i.label}</p>
            <p
              className={cn(
                'mt-1 font-fw-mono text-h3 font-semibold tabular-nums',
                (i.value ?? 0) >= 0 ? 'text-accent-700' : 'text-fw-warning',
              )}
            >
              {fmt(i.value)}
            </p>
          </Surface>
        ))}
      </div>
    </StatsSection>
  );
}
