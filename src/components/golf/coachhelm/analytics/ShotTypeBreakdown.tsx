'use client';

/**
 * ShotTypeBreakdown - Horizontal Bar Chart Visualization
 *
 * Premium bar chart component showing shot type statistics
 * with color-coded performance indicators.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import type { TeeStats, ApproachStats, AroundGreenStats, PuttingAnalytics } from '@/app/golf/actions/shot-analytics';

interface ShotTypeBreakdownProps {
  teeStats?: TeeStats;
  approachStats?: ApproachStats;
  aroundGreenStats?: AroundGreenStats;
  puttingStats?: PuttingAnalytics;
  className?: string;
  animated?: boolean;
}

// Thresholds for color coding (based on typical amateur benchmarks)
const THRESHOLDS = {
  fairway: { excellent: 65, good: 55, needsWork: 45 },
  gir: { excellent: 55, good: 40, needsWork: 30 },
  upAndDown: { excellent: 55, good: 45, needsWork: 35 },
  sandSave: { excellent: 45, good: 35, needsWork: 25 },
  onePutt: { excellent: 40, good: 30, needsWork: 20 },
  threePutt: { excellent: 5, good: 10, needsWork: 15 }, // Lower is better
  inside5ft: { excellent: 90, good: 80, needsWork: 70 },
};

function getBarColor(value: number | null, metric: keyof typeof THRESHOLDS, lowerIsBetter = false): string {
  const threshold = THRESHOLDS[metric];
  if (value === null || !threshold) return '#94a3b8'; // neutral gray for "no data"

  if (lowerIsBetter) {
    if (value <= threshold.excellent) return '#16A34A'; // Green
    if (value <= threshold.good) return '#22c55e'; // Light green
    if (value <= threshold.needsWork) return '#f59e0b'; // Amber
    return '#ef4444'; // Red
  } else {
    if (value >= threshold.excellent) return '#16A34A'; // Green
    if (value >= threshold.good) return '#22c55e'; // Light green
    if (value >= threshold.needsWork) return '#f59e0b'; // Amber
    return '#ef4444'; // Red
  }
}

function getPerformanceLabel(value: number | null, metric: keyof typeof THRESHOLDS, lowerIsBetter = false): string {
  const threshold = THRESHOLDS[metric];
  if (value === null || !threshold) return ''; // no badge when there's no data

  if (lowerIsBetter) {
    if (value <= threshold.excellent) return 'Excellent';
    if (value <= threshold.good) return 'Good';
    if (value <= threshold.needsWork) return 'Needs Work';
    return 'Focus Area';
  } else {
    if (value >= threshold.excellent) return 'Excellent';
    if (value >= threshold.good) return 'Good';
    if (value >= threshold.needsWork) return 'Needs Work';
    return 'Focus Area';
  }
}

interface BarItemProps {
  label: string;
  value: number | null;
  maxValue?: number;
  suffix?: string;
  color: string;
  performanceLabel?: string;
  subLabel?: string;
  animated?: boolean;
  delay?: number;
}

function BarItem({
  label,
  value,
  maxValue = 100,
  suffix = '%',
  color,
  performanceLabel,
  subLabel,
  animated = true,
  delay = 0,
}: BarItemProps) {
  const prefersReducedMotion = useReducedMotion();
  // null value = no data → empty bar + "—" readout.
  const percentage = value === null ? 0 : Math.min((value / maxValue) * 100, 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-warm-700">{label}</span>
          {performanceLabel && (
            <span
              className={cn(
                'text-xs font-medium px-1.5 py-0.5 rounded',
                performanceLabel === 'Excellent' && 'bg-primary-100 text-primary-700',
                performanceLabel === 'Good' && 'bg-primary-50 text-primary-600',
                performanceLabel === 'Needs Work' && 'bg-amber-100 text-amber-700',
                performanceLabel === 'Focus Area' && 'bg-red-100 text-red-700'
              )}
            >
              {performanceLabel}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">{value === null ? '—' : value}</span>
          {value !== null && <span className="text-xs text-warm-500">{suffix}</span>}
        </div>
      </div>

      <div className="h-3 bg-warm-100 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={animated ? { width: 0 } : { width: `${percentage}%` }}
          animate={{ width: `${percentage}%` }}
          transition={prefersReducedMotion ? { duration: 0 } : (animated ? { duration: 0.6, delay, ease: 'easeOut' } : undefined)}
        />
      </div>

      {subLabel && (
        <p className="text-xs text-warm-500">{subLabel}</p>
      )}
    </div>
  );
}

export function ShotTypeBreakdown({
  teeStats,
  approachStats,
  aroundGreenStats,
  puttingStats,
  className,
  animated = true,
}: ShotTypeBreakdownProps) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <div className={cn('space-y-6', className)}>
      {/* Tee Shots */}
      {teeStats && teeStats.totalDrives > 0 && (
        <motion.div
          initial={animated ? { opacity: 0, y: 10 } : undefined}
          animate={animated ? { opacity: 1, y: 0 } : undefined}
          transition={prefersReducedMotion ? { duration: 0 } : (animated ? { duration: 0.3 } : undefined)}
          className="space-y-3"
        >
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-blue-500 rounded-full" />
            <h4 className="text-sm font-medium text-warm-800 uppercase tracking-wide">
              Tee Shots
            </h4>
            <span className="text-xs text-warm-400">
              {teeStats.totalDrives} drives
            </span>
          </div>

          <div className="space-y-4 pl-3">
            <BarItem
              label="Fairway %"
              value={teeStats.fairwayPct}
              color={getBarColor(teeStats.fairwayPct, 'fairway')}
              performanceLabel={getPerformanceLabel(teeStats.fairwayPct, 'fairway')}
              animated={animated}
              delay={0.1}
            />

            {((teeStats.leftMissPct ?? 0) > 0 || (teeStats.rightMissPct ?? 0) > 0) && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-warm-500">Miss Left</span>
                    <span className="text-sm font-medium text-warm-700">{teeStats.leftMissPct ?? 0}%</span>
                  </div>
                  <div className="h-1.5 bg-warm-100 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-blue-400 rounded-full"
                      initial={animated ? { width: 0 } : undefined}
                      animate={{ width: `${teeStats.leftMissPct ?? 0}%` }}
                      transition={prefersReducedMotion ? { duration: 0 } : (animated ? { duration: 0.4, delay: 0.2 } : undefined)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-warm-500">Miss Right</span>
                    <span className="text-sm font-medium text-warm-700">{teeStats.rightMissPct ?? 0}%</span>
                  </div>
                  <div className="h-1.5 bg-warm-100 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-purple-400 rounded-full"
                      initial={animated ? { width: 0 } : undefined}
                      animate={{ width: `${teeStats.rightMissPct ?? 0}%` }}
                      transition={prefersReducedMotion ? { duration: 0 } : (animated ? { duration: 0.4, delay: 0.25 } : undefined)}
                    />
                  </div>
                </div>
              </div>
            )}

            {teeStats.avgDrivingDistance && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-warm-500">Avg. Distance</span>
                <span className="font-medium text-warm-700">{teeStats.avgDrivingDistance} yards</span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Approach Shots */}
      {approachStats && approachStats.totalApproaches > 0 && (
        <motion.div
          initial={animated ? { opacity: 0, y: 10 } : undefined}
          animate={animated ? { opacity: 1, y: 0 } : undefined}
          transition={prefersReducedMotion ? { duration: 0 } : (animated ? { duration: 0.3, delay: 0.1 } : undefined)}
          className="space-y-3"
        >
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-primary-500 rounded-full" />
            <h4 className="text-sm font-medium text-warm-800 uppercase tracking-wide">
              Approach Shots
            </h4>
            <span className="text-xs text-warm-400">
              {approachStats.totalApproaches} shots
            </span>
          </div>

          <div className="space-y-4 pl-3">
            <BarItem
              label="GIR %"
              value={approachStats.girPct}
              color={getBarColor(approachStats.girPct, 'gir')}
              performanceLabel={getPerformanceLabel(approachStats.girPct, 'gir')}
              animated={animated}
              delay={0.15}
            />

            {approachStats.avgProximity && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-warm-500">Avg. Proximity</span>
                <span className="font-medium text-warm-700">{approachStats.avgProximity} ft</span>
              </div>
            )}

            {/* Miss direction breakdown - compact */}
            <div className="space-y-1.5">
              <span className="text-xs text-warm-500">Miss Patterns</span>
              <div className="flex flex-wrap gap-2">
                {Object.entries(approachStats.missBreakdown)
                  .filter((e): e is [string, number] => e[1] !== null && e[1] > 5)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 4)
                  .map(([dir, pct]) => (
                    <span
                      key={dir}
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full',
                        pct >= 40 ? 'bg-red-100 text-red-700' :
                        pct >= 25 ? 'bg-amber-100 text-amber-700' :
                        'bg-warm-100 text-warm-600'
                      )}
                    >
                      {dir.replace('_', '-')}: {pct}%
                    </span>
                  ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Around the Green */}
      {aroundGreenStats && aroundGreenStats.totalShots > 0 && (
        <motion.div
          initial={animated ? { opacity: 0, y: 10 } : undefined}
          animate={animated ? { opacity: 1, y: 0 } : undefined}
          transition={prefersReducedMotion ? { duration: 0 } : (animated ? { duration: 0.3, delay: 0.2 } : undefined)}
          className="space-y-3"
        >
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-amber-500 rounded-full" />
            <h4 className="text-sm font-medium text-warm-800 uppercase tracking-wide">
              Around the Green
            </h4>
            <span className="text-xs text-warm-400">
              {aroundGreenStats.totalShots} shots
            </span>
          </div>

          <div className="space-y-4 pl-3">
            <BarItem
              label="Up & Down %"
              value={aroundGreenStats.upAndDownPct}
              color={getBarColor(aroundGreenStats.upAndDownPct, 'upAndDown')}
              performanceLabel={getPerformanceLabel(aroundGreenStats.upAndDownPct, 'upAndDown')}
              animated={animated}
              delay={0.25}
            />

            {(aroundGreenStats.sandSavePct ?? 0) > 0 && (
              <BarItem
                label="Sand Save %"
                value={aroundGreenStats.sandSavePct}
                color={getBarColor(aroundGreenStats.sandSavePct, 'sandSave')}
                performanceLabel={getPerformanceLabel(aroundGreenStats.sandSavePct, 'sandSave')}
                animated={animated}
                delay={0.3}
              />
            )}
          </div>
        </motion.div>
      )}

      {/* Putting */}
      {puttingStats && puttingStats.totalPutts > 0 && (
        <motion.div
          initial={animated ? { opacity: 0, y: 10 } : undefined}
          animate={animated ? { opacity: 1, y: 0 } : undefined}
          transition={prefersReducedMotion ? { duration: 0 } : (animated ? { duration: 0.3, delay: 0.3 } : undefined)}
          className="space-y-3"
        >
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-purple-500 rounded-full" />
            <h4 className="text-sm font-medium text-warm-800 uppercase tracking-wide">
              Putting
            </h4>
            <span className="text-xs text-warm-400">
              {puttingStats.avgPuttsPerRound} per round
            </span>
          </div>

          <div className="space-y-4 pl-3">
            {/* Putt distribution */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-warm-500">1-Putt</span>
                <span className="font-medium text-primary-600">{puttingStats.onePuttRate ?? '—'}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-warm-500">2-Putt</span>
                <span className="font-medium text-warm-600">{puttingStats.twoPuttRate ?? '—'}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-warm-500">3+ Putt</span>
                <span className={cn(
                  'font-medium',
                  (puttingStats.threePuttRate ?? 0) > 10 ? 'text-red-600' : 'text-warm-600'
                )}>
                  {puttingStats.threePuttRate ?? '—'}%
                </span>
              </div>
            </div>

            {/* Distance breakdown */}
            <div className="space-y-2 pt-2 border-t border-warm-100">
              <span className="text-xs text-warm-500 uppercase tracking-wide">Make Rate by Distance</span>

              {puttingStats.inside5ft.attempts > 0 && (
                <BarItem
                  label="Inside 5 ft"
                  value={puttingStats.inside5ft.pct}
                  color={getBarColor(puttingStats.inside5ft.pct, 'inside5ft')}
                  subLabel={`${puttingStats.inside5ft.made}/${puttingStats.inside5ft.attempts} made`}
                  animated={animated}
                  delay={0.35}
                />
              )}

              {puttingStats.fiveTo10ft.attempts > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-warm-600">5-10 ft</span>
                    <span className="text-sm font-medium text-warm-700">{puttingStats.fiveTo10ft.pct}%</span>
                  </div>
                  <div className="h-2 bg-warm-100 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-warm-400 rounded-full"
                      initial={animated ? { width: 0 } : undefined}
                      animate={{ width: `${puttingStats.fiveTo10ft.pct}%` }}
                      transition={prefersReducedMotion ? { duration: 0 } : (animated ? { duration: 0.4, delay: 0.4 } : undefined)}
                    />
                  </div>
                  <span className="text-xs text-warm-400">
                    {puttingStats.fiveTo10ft.made}/{puttingStats.fiveTo10ft.attempts} made
                  </span>
                </div>
              )}

              {puttingStats.outside10ft.attempts > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-warm-600">Outside 10 ft</span>
                    <span className="text-sm font-medium text-warm-700">{puttingStats.outside10ft.pct}%</span>
                  </div>
                  <div className="h-2 bg-warm-100 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-warm-300 rounded-full"
                      initial={animated ? { width: 0 } : undefined}
                      animate={{ width: `${puttingStats.outside10ft.pct}%` }}
                      transition={prefersReducedMotion ? { duration: 0 } : (animated ? { duration: 0.4, delay: 0.45 } : undefined)}
                    />
                  </div>
                  <span className="text-xs text-warm-400">
                    {puttingStats.outside10ft.made}/{puttingStats.outside10ft.attempts} made
                  </span>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Empty state */}
      {!teeStats && !approachStats && !aroundGreenStats && !puttingStats && (
        <EmptyState
          variant="minimal"
          type="stats"
          description="No shot data yet. Track rounds to see your performance breakdown."
        />
      )}
    </div>
  );
}
