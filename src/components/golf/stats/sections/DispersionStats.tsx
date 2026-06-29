'use client';

import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_CINEMATIC, DURATION } from '@/lib/coachhelm/v3/motion';
import type {
  SprayChartMode,
  SprayChartResponse,
  SprayChartSector,
  SprayChartShotFamily,
  SprayChartShotGroup,
} from '@/app/golf/actions/stats-data-types';
import { GolfTabBar } from '@/components/golf/GolfTabBar';
import { Shimmer } from '@/components/ui/shimmer';
import { containerVariants, StatCard, StatRow, StatSection } from './shared-primitives';

const FAMILY_LABELS: Record<SprayChartShotFamily, string> = {
  driving: 'Driving',
  approach: 'Approach',
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

const OUTCOME_SURFACE_STYLES = {
  playable: 'border-primary-200/80 bg-primary-50/90 text-primary-700',
  trouble: 'border-amber-200/80 bg-amber-50/90 text-amber-700',
  penalty: 'border-red-200/80 bg-red-50/90 text-red-700',
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

function DispersionEmptyState({ family }: { family: SprayChartShotFamily }) {
  return (
    <div className="rounded-2xl border border-dashed border-warm-200 bg-cream-100/75 px-5 py-10 text-center">
      <div className="text-sm font-medium text-warm-700">{FAMILY_LABELS[family]} spray chart unavailable</div>
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
          <Shimmer key={index} staggerIndex={index} className="h-24 rounded-xl" />
        ))}
      </div>
      <Shimmer className="h-[22rem] rounded-2xl" />
    </div>
  );
}

function getDominantLabel(group: SprayChartShotGroup) {
  return group.dominantSector ? SECTOR_LABELS[group.dominantSector] : 'Mixed';
}

function buildSummary(group: SprayChartShotGroup, family: SprayChartShotFamily) {
  const dominantLabel = getDominantLabel(group);
  const playablePct = group.plottedShots > 0 ? Math.round((group.playableCount / group.plottedShots) * 100) : 0;
  const penaltyPct = group.plottedShots > 0 ? Math.round((group.penaltyCount / group.plottedShots) * 100) : 0;
  const distanceLabel = family === 'driving'
    ? formatDistance(group.averageForwardDistance)
    : formatDistance(group.averageRemainingDistance);

  if (group.dominantSector === 'center') {
    return `${playablePct}% of ${FAMILY_LABELS[family].toLowerCase()} shots finish in a playable spot. Typical ${family === 'driving' ? 'distance' : 'leave'} is ${distanceLabel}.`;
  }

  return `${dominantLabel} is the primary pattern. ${playablePct}% finish playable and ${penaltyPct}% turn severe. Typical ${family === 'driving' ? 'distance' : 'leave'} is ${distanceLabel}.`;
}

function SummaryChip({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'primary' | 'warm';
}) {
  const prefersReducedMotion = useReducedMotion();
  const toneClass = tone === 'primary'
    ? 'border-primary-200/80 bg-primary-100/80 text-primary-700'
    : tone === 'warm'
      ? 'border-amber-200/80 bg-amber-100/80 text-amber-800'
      : 'border-white/70 bg-cream-100/75 text-warm-700';

  return (
    <motion.div
      className={`rounded-2xl border px-3 py-2 shadow-sm backdrop-blur-sm ${toneClass}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? { duration: 0 } : ({ duration: DURATION.medium, ease: EASE_CINEMATIC })}
    >
      <div className="text-caption font-medium uppercase tracking-[0.16em] opacity-70">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </motion.div>
  );
}

function OutcomeStrip({ group }: { group: SprayChartShotGroup }) {
  const prefersReducedMotion = useReducedMotion();
  const items = [
    {
      key: 'playable',
      label: 'Playable',
      count: group.playableCount,
      percentage: group.plottedShots > 0 ? formatPercentage((group.playableCount / group.plottedShots) * 100) : '0%',
      className: OUTCOME_SURFACE_STYLES.playable,
    },
    {
      key: 'trouble',
      label: 'Trouble',
      count: group.troubleCount,
      percentage: group.plottedShots > 0 ? formatPercentage((group.troubleCount / group.plottedShots) * 100) : '0%',
      className: OUTCOME_SURFACE_STYLES.trouble,
    },
    {
      key: 'penalty',
      label: 'Severe',
      count: group.penaltyCount,
      percentage: group.plottedShots > 0 ? formatPercentage((group.penaltyCount / group.plottedShots) * 100) : '0%',
      className: OUTCOME_SURFACE_STYLES.penalty,
    },
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {items.map((item, index) => (
        <motion.div
          key={item.key}
          className={`rounded-2xl border px-4 py-3 shadow-sm ${item.className}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.04 * index, duration: DURATION.medium, ease: EASE_CINEMATIC })}
        >
          <div className="text-caption font-medium uppercase tracking-[0.16em] opacity-75">{item.label}</div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div className="text-h2 md:text-h1 font-light tracking-[-0.025em] tabular-nums">{item.count}</div>
            <div className="text-xs font-medium opacity-80">{item.percentage}</div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function DrivingPointCloud({ group }: { group: SprayChartShotGroup }) {
  const prefersReducedMotion = useReducedMotion();
  const width = 360;
  const height = 320;
  const padding = 28;
  const xMax = useMemo(() => Math.max(80, ...group.points.map((point) => Math.abs(point.x))), [group.points]);
  const yMax = useMemo(() => Math.max(260, ...group.points.map((point) => point.y)), [group.points]);

  const xScale = (value: number) => width / 2 + (value / xMax) * ((width / 2) - padding);
  const yScale = (value: number) => height - padding - (value / yMax) * (height - padding * 2);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[19rem] w-full overflow-visible sm:h-[21rem]">
      <defs>
        <linearGradient id="fairwayGradient" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#dcfce7" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#f0fdf4" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={width} height={height} rx={20} fill="#fafaf9" />
      {/* W5B: dropped the looping infinite opacity pulse — the fairway
          wedge now renders statically at its steady-state opacity. */}
      <polygon
        points={`${width / 2},${height - padding} ${width * 0.28},${padding + 16} ${width * 0.72},${padding + 16}`}
        fill="url(#fairwayGradient)"
        stroke="#bbf7d0"
        strokeWidth="1.5"
        opacity={0.9}
      />
      <line x1={width / 2} y1={height - padding} x2={width / 2} y2={padding + 8} stroke="#d6d3d1" strokeDasharray="4 6" />
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#d6d3d1" />
      {/* W5B: dropped the looping landing-area pulse circle — rendered static. */}
      <circle
        cx={width / 2}
        cy={padding + 28}
        r={14}
        fill="#dcfce7"
        fillOpacity={0.35}
        opacity={0.45}
      />
      <text x={width / 2} y={height - 8} textAnchor="middle" className="fill-warm-500 text-caption">Tee</text>
      <text x={width / 2} y={padding} textAnchor="middle" className="fill-warm-500 text-caption">Landing area</text>

      {group.points.map((point) => {
        const style = OUTCOME_STYLES[point.outcomeBucket];
        return (
          <motion.g
            key={point.id}
            initial={{ opacity: 0, scale: 0.75 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.22 })}
          >
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
          </motion.g>
        );
      })}
    </svg>
  );
}

function ApproachPointCloud({ group }: { group: SprayChartShotGroup }) {
  const prefersReducedMotion = useReducedMotion();
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
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[19rem] w-full overflow-visible sm:h-[21rem]">
      <rect x={0} y={0} width={width} height={height} rx={20} fill="#fafaf9" />
      {/* W5B: dropped the looping infinite opacity pulse on the
          concentric range rings — rendered static at a steady opacity. */}
      {[0.3, 0.55, 0.85].map((ratio) => (
        <circle
          key={ratio}
          cx={width / 2}
          cy={height / 2}
          r={((width / 2) - padding) * ratio}
          fill="none"
          stroke="#e7e5e4"
          strokeDasharray="5 5"
          opacity={0.55}
        />
      ))}
      <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="#d6d3d1" />
      <line x1={width / 2} y1={padding} x2={width / 2} y2={height - padding} stroke="#d6d3d1" />
      {/* W5B: dropped the looping infinite center-target pulse —
          rendered static at the steady-state radius/opacity. */}
      <circle
        cx={width / 2}
        cy={height / 2}
        r={10}
        fill="#dcfce7"
        stroke="#16a34a"
        strokeWidth="2"
        opacity={0.9}
      />
      <text x={width / 2} y={padding - 4} textAnchor="middle" className="fill-warm-500 text-caption">Long</text>
      <text x={width / 2} y={height - 10} textAnchor="middle" className="fill-warm-500 text-caption">Short</text>
      <text x={padding - 2} y={height / 2 - 6} textAnchor="start" className="fill-warm-500 text-caption">Left</text>
      <text x={width - padding + 2} y={height / 2 - 6} textAnchor="end" className="fill-warm-500 text-caption">Right</text>

      {group.points.map((point) => {
        const style = OUTCOME_STYLES[point.outcomeBucket];
        return (
          <motion.g
            key={point.id}
            initial={{ opacity: 0, scale: 0.75 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.22 })}
          >
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
          </motion.g>
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
          : 'bg-cream-100/82 border-warm-100';

        return (
          <div
            key={sector}
            className={`rounded-2xl border px-3 py-4 text-center transition-colors ${background}`}
          >
            <div className="text-caption font-medium uppercase tracking-wide text-warm-500">
              {SECTOR_LABELS[sector]}
            </div>
            <div className="mt-2 text-h3 font-medium text-warm-900 tracking-[-0.012em] tabular-nums">
              {band?.count ?? 0}
            </div>
            <div className="text-xs text-warm-500">
              {band ? formatPercentage(band.percentage) : '0%'}
            </div>
            {band && (() => {
              const secondary = group.family === 'driving' ? band.avgForwardDistance : band.avgRemainingDistance;
              const secondaryLabel = group.family === 'driving' ? 'avg distance' : 'avg leave';
              return secondary !== null ? (
                <div className="mt-2 text-caption text-warm-500">
                  {formatDistance(secondary)} {secondaryLabel}
                </div>
              ) : null;
            })()}
          </div>
        );
      })}
    </div>
  );
}

function PointCloudLegend() {
  const prefersReducedMotion = useReducedMotion();
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-warm-500">
      {Object.entries(OUTCOME_STYLES).map(([key, style]) => (
        <motion.div
          key={key}
          className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 ${OUTCOME_SURFACE_STYLES[key as keyof typeof OUTCOME_SURFACE_STYLES]}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.08 })}
        >
          <span className="inline-block h-2.5 w-2.5 rounded-full shadow-sm" style={{ backgroundColor: style.fill }} />
          <span>{style.label}</span>
        </motion.div>
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
  const prefersReducedMotion = useReducedMotion();
  const [family, setFamily] = useState<SprayChartShotFamily>('driving');
  const [mode, setMode] = useState<SprayChartMode>('point-cloud');

  const currentGroup = family === 'driving' ? data?.driving ?? null : data?.approach ?? null;
  const playablePct = currentGroup && currentGroup.plottedShots > 0
    ? Math.round((currentGroup.playableCount / currentGroup.plottedShots) * 100)
    : 0;
  const dominantLabel = currentGroup ? getDominantLabel(currentGroup) : '-';

  if (loading && !data) {
    return <LoadingState />;
  }

  if (!currentGroup || currentGroup.totalShots === 0) {
    return (
      <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
        <div className="space-y-3">
          <div>
            <h3 className="text-body font-medium text-warm-900 tracking-[-0.005em]">Spray Charts</h3>
            <p className="mt-1 text-sm text-warm-500">Visualize real shot dispersion from tracked tee and approach shots.</p>
          </div>
          <GolfTabBar
            tabs={[
              { id: 'driving', label: 'Driving' },
              { id: 'approach', label: 'Approach' },
            ]}
            value={family}
            onChange={setFamily}
            ariaLabel="Spray chart family"
            compact
          />
        </div>
        <DispersionEmptyState family={family} />
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
      <motion.div
        className="space-y-3 rounded-3xl border border-white/70 bg-gradient-to-br from-white via-primary-50/40 to-amber-50/50 p-4 shadow-sm"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={prefersReducedMotion ? { duration: 0 } : ({ duration: DURATION.medium, ease: EASE_CINEMATIC })}
      >
        <div className="space-y-1">
          <h3 className="text-body font-medium text-warm-900 tracking-[-0.005em]">{FAMILY_LABELS[family]} spray summary</h3>
          <p className="text-sm text-warm-600">
            {buildSummary(currentGroup, family)}
          </p>
          <p className="text-xs text-warm-500">
            {getCoverageLabel(currentGroup)} across {data?.scope.roundsIncluded ?? 0} round{(data?.scope.roundsIncluded ?? 0) === 1 ? '' : 's'}.
          </p>
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <GolfTabBar
            tabs={[
              { id: 'driving', label: 'Driving' },
              { id: 'approach', label: 'Approach' },
            ]}
            value={family}
            onChange={setFamily}
            ariaLabel="Spray chart family"
            compact
            scrollable
          />
          <GolfTabBar
            tabs={[
              { id: 'point-cloud', label: 'Point Cloud' },
              { id: 'summary', label: 'Directional Summary' },
            ]}
            value={mode}
            onChange={setMode}
            ariaLabel="Spray chart mode"
            compact
            scrollable
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <SummaryChip label="Sample" value={`${currentGroup.totalShots} tracked shots`} tone="primary" />
          <SummaryChip label="Pattern" value={dominantLabel} tone="warm" />
          <SummaryChip
            label="Context"
            value={family === 'driving'
              ? `${formatDistance(currentGroup.averageForwardDistance)} typical distance`
              : `${formatDistance(currentGroup.averageRemainingDistance)} typical leave`}
          />
        </div>
      </motion.div>

      <motion.div className="grid grid-cols-1 gap-3 sm:grid-cols-3" variants={containerVariants}>
        <StatCard
          label="Sample"
          value={String(currentGroup.totalShots)}
          numericValue={currentGroup.totalShots}
          decimals={0}
          subValue="qualifying shots"
          highlight
          index={0}
        />
        <StatCard
          label={family === 'driving' ? 'Typical Distance' : 'Typical Leave'}
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
          label="Primary Pattern"
          value={dominantLabel}
          subValue={`${playablePct}% playable`}
          index={2}
        />
      </motion.div>

      <StatSection title={`${FAMILY_LABELS[family]} Spray Chart`}>
        <div className="space-y-3">
          <motion.div
            className="rounded-3xl border border-white/70 bg-gradient-to-b from-white to-warm-50/70 p-3 shadow-inner"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.05, duration: DURATION.medium, ease: EASE_CINEMATIC })}
          >
            {mode === 'point-cloud' ? (
              family === 'driving' ? <DrivingPointCloud group={currentGroup} /> : <ApproachPointCloud group={currentGroup} />
            ) : (
              <DirectionalSummary group={currentGroup} />
            )}
          </motion.div>
          <PointCloudLegend />
        </div>
      </StatSection>

      <StatSection title="Outcome Mix">
        <OutcomeStrip group={currentGroup} />
      </StatSection>

      <StatSection title="Quick Read">
        <StatRow label="Most common pattern" value={dominantLabel} index={0} />
        <StatRow
          label="Playable finishes"
          value={`${playablePct}%`}
          index={1}
        />
        <StatRow
          label="Trouble / sand finishes"
          value={`${currentGroup.troubleCount} (${currentGroup.plottedShots > 0 ? formatPercentage((currentGroup.troubleCount / currentGroup.plottedShots) * 100) : '0%'})`}
          index={2}
        />
        <StatRow
          label="Penalty / severe misses"
          value={`${currentGroup.penaltyCount} (${currentGroup.plottedShots > 0 ? formatPercentage((currentGroup.penaltyCount / currentGroup.plottedShots) * 100) : '0%'})`}
          index={3}
        />
        <StatRow
          label={family === 'driving' ? 'Average shot distance' : 'Average leave after miss'}
          value={family === 'driving'
            ? formatDistance(currentGroup.averageForwardDistance)
            : formatDistance(currentGroup.averageRemainingDistance)}
          index={4}
        />
      </StatSection>
    </motion.div>
  );
}
