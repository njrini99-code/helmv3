'use client';

/**
 * Shot Dispersion Chart
 *
 * Premium visual spray charts showing:
 * 1. Driving dispersion (left/fairway/right)
 * 2. Approach shot dispersion (green/miss patterns)
 * 3. Putting miss patterns (left/right/short/long)
 *
 * Design: Foundation-first approach with solid surfaces for data.
 * Follows Helm's Kelly Green accent + professional aesthetic.
 * Enhanced with Framer Motion for premium feel.
 */

import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { cn } from '@/lib/utils';
import { ApproachDispersionPremium } from './ApproachDispersionPremium';
import { DrivingDispersionPremium } from './DrivingDispersionPremium';
import { PuttingDispersionPremium } from './PuttingDispersionPremium';

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
};

const sectionHeaderVariants = {
  hidden: { opacity: 0, y: -20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 300,
      damping: 25,
    },
  },
};

interface ShotDispersionChartProps {
  stats: GolfStats;
  className?: string;
}

// ============================================================================
// APPROACH PROXIMITY BY DISTANCE CHART
// ============================================================================

function ApproachProximityChart({ stats }: { stats: GolfStats }) {
  const [hoveredBucket, setHoveredBucket] = useState<string | null>(null);

  // Distance buckets with their data - use a unified green gradient scale
  const buckets = [
    { key: '30_75', label: '30-75y', value: stats.approachProx30_75, color: '#16a34a', lightColor: '#dcfce7' },
    { key: '75_100', label: '75-100y', value: stats.approachProx75_100, color: '#22c55e', lightColor: '#dcfce7' },
    { key: '100_125', label: '100-125y', value: stats.approachProx100_125, color: '#4ade80', lightColor: '#f0fdf4' },
    { key: '125_150', label: '125-150y', value: stats.approachProx125_150, color: '#65a30d', lightColor: '#f7fee7' },
    { key: '150_175', label: '150-175y', value: stats.approachProx150_175, color: '#ca8a04', lightColor: '#fefce8' },
    { key: '175_200', label: '175-200y', value: stats.approachProx175_200, color: '#ea580c', lightColor: '#fff7ed' },
    { key: '200_225', label: '200-225y', value: stats.approachProx200_225, color: '#dc2626', lightColor: '#fef2f2' },
    { key: '225_plus', label: '225y+', value: stats.approachProx225Plus, color: '#b91c1c', lightColor: '#fef2f2' },
  ].filter(b => b.value !== null && b.value > 0);

  if (buckets.length === 0) return null;

  // Find max for scaling
  const maxValue = Math.max(...buckets.map(b => b.value || 0));
  const avgProx = stats.approachProximityAvg;

  return (
    <motion.div
      className="bg-white rounded-2xl border border-warm-200/80 shadow-sm overflow-hidden"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ boxShadow: '0 8px 24px rgba(0,0,0,0.06)', y: -2 }}
    >
      {/* Header */}
      <div className="px-6 py-5 border-b border-warm-100/80">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-warm-900 tracking-tight">Approach Proximity</h3>
            <p className="text-[13px] text-warm-500 mt-0.5">How close approach shots land by distance</p>
          </div>
          {avgProx !== null && (
            <motion.div
              className="text-right"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
            >
              <div className="text-4xl font-bold text-primary-600 tabular-nums tracking-tight leading-none">
                {Math.round(avgProx)}&apos;
              </div>
              <div className="text-xs font-medium text-warm-400 uppercase tracking-wide mt-1">Avg</div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Bar Chart */}
      <div className="px-6 py-6">
        <div className="space-y-2.5">
          {buckets.map((bucket, idx) => {
            const barWidth = maxValue > 0 ? ((bucket.value || 0) / maxValue) * 100 : 0;
            const isHovered = hoveredBucket === bucket.key;

            return (
              <motion.div
                key={bucket.key}
                className={cn(
                  "flex items-center gap-4 p-1.5 -mx-1.5 rounded-lg transition-colors",
                  isHovered && "bg-warm-50/80"
                )}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + idx * 0.04 }}
                onMouseEnter={() => setHoveredBucket(bucket.key)}
                onMouseLeave={() => setHoveredBucket(null)}
              >
                {/* Label */}
                <div className="w-16 text-sm font-medium text-warm-500 text-right shrink-0 tabular-nums">
                  {bucket.label}
                </div>

                {/* Bar container */}
                <div className="flex-1 h-7 bg-warm-100/80 rounded-md overflow-hidden relative">
                  <motion.div
                    className="h-full rounded-md"
                    style={{ backgroundColor: bucket.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${barWidth}%` }}
                    transition={{ delay: 0.2 + idx * 0.04, duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
                  />
                </div>

                {/* Value */}
                <div className={cn(
                  "w-10 text-right text-sm font-semibold tabular-nums shrink-0 transition-colors",
                  isHovered ? "text-warm-900" : "text-warm-600"
                )}>
                  {Math.round(bucket.value || 0)}&apos;
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Color legend */}
        <motion.div
          className="mt-5 pt-4 border-t border-warm-100/80"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <div className="flex items-center gap-5 text-xs text-warm-400">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-primary-600" />
              <span>Close</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>Mid</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-600" />
              <span>Long</span>
            </div>
            <span className="ml-auto text-warm-300">Distance to hole in feet</span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ShotDispersionChart = memo(function ShotDispersionChart({
  stats,
  className,
}: ShotDispersionChartProps) {
  const hasData = stats.holesPlayed > 0;

  if (!hasData) {
    return (
      <motion.div
        className={cn('', className)}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div
          className="bg-white rounded-2xl border border-warm-200 shadow-sm p-16 text-center"
          whileHover={{ boxShadow: '0 10px 30px rgba(0,0,0,0.06)' }}
        >
          <motion.div
            className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}
          >
            <span className="text-3xl">🎯</span>
          </motion.div>
          <motion.h3
            className="text-lg font-semibold text-warm-900 mb-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            No Shot Data Yet
          </motion.h3>
          <motion.p
            className="text-warm-500 max-w-sm mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            Complete rounds with shot tracking to see dispersion patterns.
          </motion.p>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className={cn('space-y-6', className)}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Section Header - Animated */}
      <motion.div variants={sectionHeaderVariants}>
        <motion.h2
          className="text-xl font-semibold text-warm-900 tracking-tight"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          Shot Dispersion
        </motion.h2>
        <motion.p
          className="text-sm text-warm-500 mt-1"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          Visual breakdown of where your shots land
        </motion.p>
      </motion.div>

      {/* Charts Grid - Staggered */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        variants={containerVariants}
      >
        {/* Driving Dispersion - Premium Version */}
        <DrivingDispersionPremium
          fairwayPct={stats.fairwayPercentage}
          driverFairwayPct={stats.fairwayPctDriver}
          missLeftCount={stats.missLeftCount}
          missRightCount={stats.missRightCount}
          fairwaysHit={stats.fairwaysHit}
          fairwayOpportunities={stats.fairwayOpportunities}
        />

        {/* Approach Dispersion - Premium Version */}
        <ApproachDispersionPremium
          girPct={stats.girPercentage}
          girFromFairway={stats.girPctFromFairway}
          girFromRough={stats.girPctFromRough}
          girFromSand={stats.girPctFromSand}
          girTotal={stats.girTotal}
          girOpportunities={stats.girOpportunities}
          approachMissShortPct={stats.approachMissShortPct}
          approachMissLongPct={stats.approachMissLongPct}
          approachMissLeftPct={stats.approachMissLeftPct}
          approachMissRightPct={stats.approachMissRightPct}
          approachMissTotal={stats.approachMissTotal}
        />
      </motion.div>

      {/* Approach Proximity by Distance - Full Width */}
      <ApproachProximityChart stats={stats} />

      {/* Putting Dispersion - Premium Version */}
      <PuttingDispersionPremium
        puttMissLeftPct={stats.puttMissLeftPct}
        puttMissRightPct={stats.puttMissRightPct}
        puttMissShortPct={stats.puttMissShortPct}
        puttMissLongPct={stats.puttMissLongPct}
        puttMissLowPct={stats.puttMissLowPct}
        puttMissHighPct={stats.puttMissHighPct}
        totalPutts={stats.totalPutts}
        onePuttsTotal={stats.onePuttsTotal}
        threePuttsTotal={stats.threePuttsTotal}
      />
    </motion.div>
  );
});

export default ShotDispersionChart;
