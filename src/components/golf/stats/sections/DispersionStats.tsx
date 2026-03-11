'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type {
  SprayChartMode,
  SprayChartResponse,
  SprayChartSector,
  SprayChartShotFamily,
  SprayChartShotGroup,
} from '@/app/golf/actions/stats-data-types';
import { containerVariants, StatCard, StatSection } from './shared-primitives';

const FAMILY_LABELS: Record<SprayChartShotFamily, string> = {
  driving: 'Driving',
  approach: 'Approach',
};

const MODE_LABELS: Record<SprayChartMode, string> = {
  'point-cloud': 'Point Cloud',
  summary: 'Directional Summary',
};

const SECTOR_GRID: SprayChartSector[][] = [
  ['long_left', 'long', 'long_right'],
  ['left', 'center', 'right'],
  ['short_left', 'short', 'short_right'],
];

const SECTOR_LABELS: Record<SprayChartSector, string> = {
  center: 'Center',
  left: 'Left',
  right: 'Right',
  short: 'Short',
  long: 'Long',
  short_left: 'Short Left',
  short_right: 'Short Right',
  long_left: 'Long Left',
  long_right: 'Long Right',
};

const OUTCOME_STYLES = {
  playable: { fill: '#16a34a', stroke: '#166534', label: 'Playable' },
  trouble: { fill: '#f59e0b', stroke: '#b45309', label: 'Rough / Sand' },
  penalty: { fill: '#ef4444', stroke: '#b91c1c', label: 'Penalty / Severe' },
} as const;

function formatDistance(value: number | null, suffix = 'y') {
  return value === null ? '-' : `${Math.round(value)}${suffix}`;
}

function formatPercentage(value: number) {
  return `${Math.round(value)}%`;
}

function getCoverageLabel(group: SprayChartShotGroup) {
  if (group.totalShots === 0) return 'No qualifying shots';
  if (group.plottedShots === group.totalShots) return `${group.plottedShots} plotted shots`;
  return `${group.plottedShots}/${group.totalShots} shots plotted`;
}

function SegmentToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-xl border border-warm-200 bg-warm-100/80 p-1">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? 'bg-white text-warm-900 shadow-sm'
                : 'text-warm-500 hover:text-warm-700'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function DispersionEmptyState({ family }: { family: SprayChartShotFamily }) {
  return (
    <div className="rounded-2xl border border-dashed border-warm-200 bg-white/70 px-5 py-10 text-center">
      <div className="text-sm font-semibold text-warm-700">{FAMILY_LABELS[family]} spray chart unavailable</div>
      <p className="mt-1 text-sm text-warm-500">
        Complete more rounds with shot tracking to visualize real {family === 'driving' ? 'tee-shot' : 'approach-shot'} patterns.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl bg-warm-100/70" />
        ))}
      </div>
      <div className="h-[22rem] animate-pulse rounded-2xl bg-warm-100/70" />
    </div>
  );
}

function DrivingPointCloud({ group }: { group: SprayChartShotGroup }) {
  const width = 360;
  const height = 320;
  const padding = 28;
  const xMax = useMemo(() => Math.max(80, ...group.points.map((point) => Math.abs(point.x))), [group.points]);
  const yMax = useMemo(() => Math.max(260, ...group.points.map((point) => point.y)), [group.points]);

  const xScale = (value: number) => width / 2 + (value / xMax) * ((width / 2) - padding);
  const yScale = (value: number) => height - padding - (value / yMax) * (height - padding * 2);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[22rem] w-full overflow-visible">
      <defs>
        <linearGradient id="fairwayGradient" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#dcfce7" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#f0fdf4" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={width} height={height} rx={20} fill="#fafaf9" />
      <polygon
        points={`${width / 2},${height - padding} ${width * 0.28},${padding + 16} ${width * 0.72},${padding + 16}`}
        fill="url(#fairwayGradient)"
        stroke="#bbf7d0"
        strokeWidth="1.5"
      />
      <line x1={width / 2} y1={height - padding} x2={width / 2} y2={padding + 8} stroke="#d6d3d1" strokeDasharray="4 6" />
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#d6d3d1" />
      <text x={width / 2} y={height - 8} textAnchor="middle" className="fill-warm-500 text-[10px]">Tee</text>
      <text x={width / 2} y={padding} textAnchor="middle" className="fill-warm-500 text-[10px]">Landing area</text>

      {group.points.map((point) => {
        const style = OUTCOME_STYLES[point.outcomeBucket];
        return (
          <g key={point.id}>
            <title>{point.tooltip}</title>
            <circle
              cx={xScale(point.x)}
              cy={yScale(point.y)}
              r={4.5}
              fill={style.fill}
              fillOpacity={0.82}
              stroke={style.stroke}
              strokeWidth={1.25}
            />
          </g>
        );
      })}
    </svg>
  );
}

function ApproachPointCloud({ group }: { group: SprayChartShotGroup }) {
  const width = 360;
  const height = 320;
  const padding = 28;
  const maxMagnitude = useMemo(
    () => Math.max(40, ...group.points.map((point) => Math.max(Math.abs(point.x), Math.abs(point.y)))),
    [group.points]
  );

  const xScale = (value: number) => width / 2 + (value / maxMagnitude) * ((width / 2) - padding);
  const yScale = (value: number) => height / 2 - (value / maxMagnitude) * ((height / 2) - padding);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[22rem] w-full overflow-visible">
      <rect x={0} y={0} width={width} height={height} rx={20} fill="#fafaf9" />
      {[0.3, 0.55, 0.85].map((ratio) => (
        <circle
          key={ratio}
          cx={width / 2}
          cy={height / 2}
          r={((width / 2) - padding) * ratio}
          fill="none"
          stroke="#e7e5e4"
          strokeDasharray="5 5"
        />
      ))}
      <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="#d6d3d1" />
      <line x1={width / 2} y1={padding} x2={width / 2} y2={height - padding} stroke="#d6d3d1" />
      <circle cx={width / 2} cy={height / 2} r={10} fill="#dcfce7" stroke="#16a34a" strokeWidth="2" />
      <text x={width / 2} y={padding - 4} textAnchor="middle" className="fill-warm-500 text-[10px]">Long</text>
      <text x={width / 2} y={height - 10} textAnchor="middle" className="fill-warm-500 text-[10px]">Short</text>
      <text x={padding - 2} y={height / 2 - 6} textAnchor="start" className="fill-warm-500 text-[10px]">Left</text>
      <text x={width - padding + 2} y={height / 2 - 6} textAnchor="end" className="fill-warm-500 text-[10px]">Right</text>

      {group.points.map((point) => {
        const style = OUTCOME_STYLES[point.outcomeBucket];
        return (
          <g key={point.id}>
            <title>{point.tooltip}</title>
            <circle
              cx={xScale(point.x)}
              cy={yScale(point.y)}
              r={4.5}
              fill={style.fill}
              fillOpacity={0.82}
              stroke={style.stroke}
              strokeWidth={1.25}
            />
          </g>
        );
      })}
    </svg>
  );
}

function DirectionalSummary({ group }: { group: SprayChartShotGroup }) {
  const bandMap = new Map(group.summaryBands.map((band) => [band.sector, band]));
  const maxCount = Math.max(1, ...group.summaryBands.map((band) => band.count));

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {SECTOR_GRID.flatMap((row) => row).map((sector) => {
        const band = bandMap.get(sector);
        const ratio = band ? band.count / maxCount : 0;
        const active = Boolean(band && band.count > 0);
        const background = active
          ? sector === 'center'
            ? 'bg-primary-100 border-primary-200'
            : ratio > 0.66
              ? 'bg-amber-100 border-amber-200'
              : 'bg-warm-100 border-warm-200'
          : 'bg-white/80 border-warm-100';

        return (
          <div
            key={sector}
            className={`rounded-2xl border px-3 py-4 text-center transition-colors ${background}`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-warm-500">
              {SECTOR_LABELS[sector]}
            </div>
            <div className="mt-2 text-xl font-bold text-warm-900 tabular-nums">
              {band?.count ?? 0}
            </div>
            <div className="text-xs text-warm-500">
              {band ? formatPercentage(band.percentage) : '0%'}
            </div>
            {band?.avgRemainingDistance !== null && (
              <div className="mt-2 text-[11px] text-warm-500">
                {formatDistance(band.avgRemainingDistance)} avg leave
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PointCloudLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-warm-500">
      {Object.entries(OUTCOME_STYLES).map(([key, style]) => (
        <div key={key} className="inline-flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: style.fill }} />
          <span>{style.label}</span>
        </div>
      ))}
    </div>
  );
}

export function DispersionStats({
  data,
  loading = false,
}: {
  data: SprayChartResponse | null;
  loading?: boolean;
}) {
  const [family, setFamily] = useState<SprayChartShotFamily>('driving');
  const [mode, setMode] = useState<SprayChartMode>('point-cloud');

  const currentGroup = family === 'driving' ? data?.driving ?? null : data?.approach ?? null;
  const playablePct = currentGroup && currentGroup.plottedShots > 0
    ? Math.round((currentGroup.playableCount / currentGroup.plottedShots) * 100)
    : 0;

  const dominantLabel = currentGroup?.dominantSector ? SECTOR_LABELS[currentGroup.dominantSector] : '-';

  if (loading && !data) {
    return <LoadingState />;
  }

  if (!currentGroup || currentGroup.totalShots === 0) {
    return (
      <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SegmentToggle
            options={['Driving', 'Approach'] as const}
            value={FAMILY_LABELS[family]}
            onChange={(value) => setFamily(value === 'Driving' ? 'driving' : 'approach')}
          />
        </div>
        <DispersionEmptyState family={family} />
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentToggle
              options={['Driving', 'Approach'] as const}
              value={FAMILY_LABELS[family]}
              onChange={(value) => setFamily(value === 'Driving' ? 'driving' : 'approach')}
            />
            <SegmentToggle
              options={['Point Cloud', 'Directional Summary'] as const}
              value={MODE_LABELS[mode]}
              onChange={(value) => setMode(value === 'Point Cloud' ? 'point-cloud' : 'summary')}
            />
          </div>
          <p className="text-sm text-warm-500">
            {getCoverageLabel(currentGroup)} across {data?.scope.roundsIncluded ?? 0} round{(data?.scope.roundsIncluded ?? 0) === 1 ? '' : 's'}.
          </p>
        </div>
        <PointCloudLegend />
      </div>

      <motion.div className="grid grid-cols-2 gap-3 md:grid-cols-4" variants={containerVariants}>
        <StatCard
          label="Sample Size"
          value={String(currentGroup.totalShots)}
          numericValue={currentGroup.totalShots}
          decimals={0}
          subValue="qualifying shots"
          highlight
          large
          index={0}
        />
        <StatCard
          label={family === 'driving' ? 'Avg Shot' : 'Avg Leave'}
          value={family === 'driving'
            ? formatDistance(currentGroup.averageForwardDistance)
            : formatDistance(currentGroup.averageRemainingDistance)}
          numericValue={family === 'driving'
            ? currentGroup.averageForwardDistance
            : currentGroup.averageRemainingDistance}
          decimals={0}
          subValue={family === 'driving' ? 'yards forward' : 'yards remaining'}
          index={1}
        />
        <StatCard
          label="Playable %"
          value={`${playablePct}%`}
          numericValue={playablePct}
          decimals={0}
          subValue={`${currentGroup.playableCount} playable`}
          index={2}
        />
        <StatCard
          label="Dominant Miss"
          value={dominantLabel}
          subValue={`${currentGroup.penaltyCount} severe outcomes`}
          index={3}
        />
      </motion.div>

      <StatSection title={`${FAMILY_LABELS[family]} Spray Chart`}>
        {mode === 'point-cloud' ? (
          family === 'driving' ? <DrivingPointCloud group={currentGroup} /> : <ApproachPointCloud group={currentGroup} />
        ) : (
          <DirectionalSummary group={currentGroup} />
        )}
      </StatSection>

      <StatSection title="Outcome Mix">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {([
            ['Playable', currentGroup.playableCount, 'bg-primary-50 text-primary-700 border-primary-100'],
            ['Rough / Sand', currentGroup.troubleCount, 'bg-amber-50 text-amber-700 border-amber-100'],
            ['Penalty / Severe', currentGroup.penaltyCount, 'bg-red-50 text-red-700 border-red-100'],
          ] as const).map(([label, count, className]) => (
            <div key={label} className={`rounded-xl border px-4 py-3 ${className}`}>
              <div className="text-xs font-semibold uppercase tracking-wide">{label}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{count}</div>
              <div className="text-xs opacity-80">
                {currentGroup.plottedShots > 0 ? formatPercentage((count / currentGroup.plottedShots) * 100) : '0%'}
              </div>
            </div>
          ))}
        </div>
      </StatSection>
    </motion.div>
  );
}
