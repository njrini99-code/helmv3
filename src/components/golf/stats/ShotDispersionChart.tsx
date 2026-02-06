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

import { memo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { cn } from '@/lib/utils';
import { ApproachDispersionPremium } from './ApproachDispersionPremium';
import { DrivingDispersionPremium } from './DrivingDispersionPremium';
import { PuttingDispersionPremium } from './PuttingDispersionPremium';

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 200,
      damping: 20,
    },
  },
};

const shotDotVariants = {
  hidden: { opacity: 0, scale: 0 },
  visible: (i: number) => ({
    opacity: 0.8,
    scale: 1,
    transition: {
      delay: 0.3 + i * 0.05,
      type: 'spring' as const,
      stiffness: 400,
      damping: 15,
    },
  }),
};

const statCardVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: {
      delay: i * 0.1,
      type: 'spring' as const,
      stiffness: 300,
      damping: 20,
    },
  }),
};

// ============================================================================
// ANIMATED NUMBER HOOK
// ============================================================================

function useAnimatedNumber(value: number | null, duration: number = 800): number {
  const [displayValue, setDisplayValue] = useState(0);
  const previousValue = useRef(0);

  useEffect(() => {
    if (value === null) {
      setDisplayValue(0);
      return;
    }

    const startValue = previousValue.current;
    const endValue = value;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3);

      const currentValue = startValue + (endValue - startValue) * easeOut;
      setDisplayValue(currentValue);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        previousValue.current = endValue;
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return displayValue;
}

// ============================================================================
// ANIMATED PROGRESS BAR COMPONENT
// ============================================================================

function AnimatedProgressBar({
  value,
  color,
  delay = 0,
}: {
  value: number;
  color: string;
  delay?: number;
}) {
  return (
    <div className="h-2 w-20 bg-slate-100 rounded-full overflow-hidden">
      <motion.div
        className={`h-full ${color} rounded-full`}
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ delay, duration: 0.8, ease: [0.33, 1, 0.68, 1] }}
      />
    </div>
  );
}

interface ShotDispersionChartProps {
  stats: GolfStats;
  className?: string;
}

// ============================================================================
// DRIVING DISPERSION CHART - Legacy (replaced by DrivingDispersionPremium)
// ============================================================================

/** @internal Legacy component - use DrivingDispersionPremium instead */
export function DrivingDispersionVisualLegacy({
  fairwayPct,
  driverFairwayPct,
  missLeftCount,
  missRightCount,
  fairwaysHit,
  fairwayOpportunities,
}: {
  fairwayPct: number | null;
  driverFairwayPct: number | null;
  missLeftCount: number;
  missRightCount: number;
  fairwaysHit: number;
  fairwayOpportunities: number;
}) {
  const [isHovered, setIsHovered] = useState<'left' | 'fairway' | 'right' | null>(null);
  const animatedFairway = useAnimatedNumber(fairwayPct, 1000);

  const totalMisses = missLeftCount + missRightCount;
  const leftPctOfMisses = totalMisses > 0 ? (missLeftCount / totalMisses) * 100 : 0;
  const rightPctOfMisses = totalMisses > 0 ? (missRightCount / totalMisses) * 100 : 0;

  const fairway = fairwayPct ?? 0;
  const missTotal = 100 - fairway;
  const left = (missTotal * leftPctOfMisses) / 100;
  const right = (missTotal * rightPctOfMisses) / 100;

  // Determine miss tendency
  const missTendency = leftPctOfMisses > 60 ? 'left' : rightPctOfMisses > 60 ? 'right' : 'balanced';

  return (
    <motion.div
      className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden group"
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ boxShadow: '0 20px 40px rgba(0,0,0,0.08)', y: -4 }}
      transition={{ duration: 0.3 }}
    >
      {/* Animated shine effect */}
      <motion.div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)',
        }}
      />

      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 relative overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-green-50/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        <div className="flex items-start justify-between relative">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h3 className="text-lg font-semibold text-slate-900 tracking-tight">Driving Dispersion</h3>
            <p className="text-sm text-slate-500 mt-0.5">Tee shot accuracy breakdown</p>
          </motion.div>
          <motion.div
            className="text-right"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
          >
            <div className="text-3xl font-bold text-green-600 tabular-nums tracking-tight">
              {animatedFairway.toFixed(0)}%
            </div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Fairways</div>
          </motion.div>
        </div>
      </div>

      {/* Visual Spray Chart */}
      <div className="px-6 py-8 bg-gradient-to-b from-slate-50/50 to-white">
        <motion.div
          className="relative max-w-sm mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {/* Fairway Visual - Top Down View */}
          <svg viewBox="0 0 240 160" className="w-full" style={{ maxHeight: '200px' }}>
            <defs>
              {/* Fairway gradient */}
              <linearGradient id="fairwayGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={isHovered === 'fairway' ? 0.35 : 0.15} />
                <stop offset="100%" stopColor="#16a34a" stopOpacity={isHovered === 'fairway' ? 0.45 : 0.25} />
              </linearGradient>
              {/* Left rough gradient */}
              <linearGradient id="leftRoughGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={isHovered === 'left' ? 0.2 : 0.08} />
                <stop offset="100%" stopColor="#dc2626" stopOpacity={isHovered === 'left' ? 0.3 : 0.15} />
              </linearGradient>
              {/* Right rough gradient */}
              <linearGradient id="rightRoughGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#f97316" stopOpacity={isHovered === 'right' ? 0.2 : 0.08} />
                <stop offset="100%" stopColor="#ea580c" stopOpacity={isHovered === 'right' ? 0.3 : 0.15} />
              </linearGradient>
            </defs>

            {/* Left rough - clickable zone */}
            <motion.path
              d="M0,0 L70,0 L55,160 L0,160 Z"
              fill="url(#leftRoughGrad)"
              className="cursor-pointer"
              onMouseEnter={() => setIsHovered('left')}
              onMouseLeave={() => setIsHovered(null)}
              whileHover={{ opacity: 0.9 }}
            />
            {/* Fairway - clickable zone */}
            <motion.path
              d="M70,0 L170,0 L185,160 L55,160 Z"
              fill="url(#fairwayGrad)"
              className="cursor-pointer"
              onMouseEnter={() => setIsHovered('fairway')}
              onMouseLeave={() => setIsHovered(null)}
              whileHover={{ opacity: 0.9 }}
            />
            {/* Right rough - clickable zone */}
            <motion.path
              d="M170,0 L240,0 L240,160 L185,160 Z"
              fill="url(#rightRoughGrad)"
              className="cursor-pointer"
              onMouseEnter={() => setIsHovered('right')}
              onMouseLeave={() => setIsHovered(null)}
              whileHover={{ opacity: 0.9 }}
            />

            {/* Fairway edge lines - animated */}
            <motion.path
              d="M70,0 L55,160"
              stroke="#22c55e"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity="0.4"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
            />
            <motion.path
              d="M170,0 L185,160"
              stroke="#22c55e"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity="0.4"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
            />

            {/* Tee box indicator - animated */}
            <motion.g
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <rect x="105" y="140" width="30" height="12" rx="2" fill="#78716c" opacity="0.8" />
              <text x="120" y="150" textAnchor="middle" fontSize="7" fill="white" fontWeight="500">TEE</text>
            </motion.g>

            {/* Shot distribution visualization - ANIMATED DOTS */}
            {/* Left misses */}
            {left > 0 && Array.from({ length: Math.min(Math.round(left / 8), 10) }).map((_, i) => {
              // Use seeded random for consistent positions
              const seed = i * 7919;
              const randX = (seed % 100) / 100;
              const randY = ((seed * 31) % 100) / 100;
              return (
                <motion.circle
                  key={`left-${i}`}
                  cx={25 + (i % 4) * 12 + randX * 8}
                  cy={25 + Math.floor(i / 4) * 30 + randY * 15}
                  r="5"
                  fill="#ef4444"
                  variants={shotDotVariants}
                  initial="hidden"
                  animate="visible"
                  custom={i}
                  whileHover={{ scale: 1.5, opacity: 1 }}
                  style={{ filter: isHovered === 'left' ? 'brightness(1.2)' : 'none' }}
                />
              );
            })}

            {/* Fairway hits */}
            {fairway > 0 && Array.from({ length: Math.min(Math.round(fairway / 8), 10) }).map((_, i) => (
              <motion.circle
                key={`fair-${i}`}
                cx={90 + (i % 5) * 12}
                cy={20 + Math.floor(i / 5) * 35}
                r="5"
                fill="#16a34a"
                variants={shotDotVariants}
                initial="hidden"
                animate="visible"
                custom={i}
                whileHover={{ scale: 1.5, opacity: 1 }}
                style={{ filter: isHovered === 'fairway' ? 'brightness(1.2)' : 'none' }}
              />
            ))}

            {/* Right misses */}
            {right > 0 && Array.from({ length: Math.min(Math.round(right / 8), 10) }).map((_, i) => {
              const seed = i * 7919;
              const randX = (seed % 100) / 100;
              const randY = ((seed * 31) % 100) / 100;
              return (
                <motion.circle
                  key={`right-${i}`}
                  cx={195 + (i % 4) * 10 + randX * 8}
                  cy={25 + Math.floor(i / 4) * 30 + randY * 15}
                  r="5"
                  fill="#f97316"
                  variants={shotDotVariants}
                  initial="hidden"
                  animate="visible"
                  custom={i + 5}
                  whileHover={{ scale: 1.5, opacity: 1 }}
                  style={{ filter: isHovered === 'right' ? 'brightness(1.2)' : 'none' }}
                />
              );
            })}

            {/* Zone labels - animated */}
            <motion.text
              x="35" y="95"
              textAnchor="middle"
              fontSize="10"
              fill={isHovered === 'left' ? '#ef4444' : '#64748b'}
              fontWeight={isHovered === 'left' ? '600' : '500'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              LEFT
            </motion.text>
            <motion.text
              x="120" y="70"
              textAnchor="middle"
              fontSize="11"
              fill="#16a34a"
              fontWeight="600"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              FAIRWAY
            </motion.text>
            <motion.text
              x="205" y="95"
              textAnchor="middle"
              fontSize="10"
              fill={isHovered === 'right' ? '#f97316' : '#64748b'}
              fontWeight={isHovered === 'right' ? '600' : '500'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              RIGHT
            </motion.text>
          </svg>

          {/* Hover tooltip */}
          <AnimatePresence>
            {isHovered && (
              <motion.div
                className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-slate-900/90 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-lg"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {isHovered === 'left' && `${left.toFixed(0)}% miss left (${missLeftCount} shots)`}
                {isHovered === 'fairway' && `${fairway.toFixed(0)}% fairway (${fairwaysHit}/${fairwayOpportunities})`}
                {isHovered === 'right' && `${right.toFixed(0)}% miss right (${missRightCount} shots)`}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Stats Grid - Solid surface for data */}
      <div className="px-6 py-5 bg-white border-t border-slate-100">
        <div className="grid grid-cols-3 gap-4">
          {/* Left Miss */}
          <motion.div
            className={cn(
              "text-center p-4 rounded-xl bg-gradient-to-br from-red-50 to-red-100/50 border transition-all cursor-default",
              isHovered === 'left' ? 'border-red-300 shadow-lg scale-105' : 'border-red-100'
            )}
            variants={statCardVariants}
            initial="hidden"
            animate="visible"
            custom={0}
            whileHover={{ scale: 1.05 }}
            onMouseEnter={() => setIsHovered('left')}
            onMouseLeave={() => setIsHovered(null)}
          >
            <div className="text-2xl font-bold text-red-600 tabular-nums">{left.toFixed(0)}%</div>
            <div className="text-xs font-medium text-slate-600 mt-1">Left</div>
            <div className="text-xs text-slate-400 mt-0.5">{missLeftCount} shots</div>
          </motion.div>

          {/* Fairway */}
          <motion.div
            className={cn(
              "text-center p-4 rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 border transition-all cursor-default",
              isHovered === 'fairway' ? 'border-green-400 shadow-lg scale-105' : 'border-green-200'
            )}
            variants={statCardVariants}
            initial="hidden"
            animate="visible"
            custom={1}
            whileHover={{ scale: 1.05 }}
            onMouseEnter={() => setIsHovered('fairway')}
            onMouseLeave={() => setIsHovered(null)}
          >
            <div className="text-2xl font-bold text-green-600 tabular-nums">{fairway.toFixed(0)}%</div>
            <div className="text-xs font-medium text-slate-600 mt-1">Fairway</div>
            <div className="text-xs text-slate-400 mt-0.5">{fairwaysHit}/{fairwayOpportunities}</div>
          </motion.div>

          {/* Right Miss */}
          <motion.div
            className={cn(
              "text-center p-4 rounded-xl bg-gradient-to-br from-orange-50 to-orange-100/50 border transition-all cursor-default",
              isHovered === 'right' ? 'border-orange-300 shadow-lg scale-105' : 'border-orange-100'
            )}
            variants={statCardVariants}
            initial="hidden"
            animate="visible"
            custom={2}
            whileHover={{ scale: 1.05 }}
            onMouseEnter={() => setIsHovered('right')}
            onMouseLeave={() => setIsHovered(null)}
          >
            <div className="text-2xl font-bold text-orange-600 tabular-nums">{right.toFixed(0)}%</div>
            <div className="text-xs font-medium text-slate-600 mt-1">Right</div>
            <div className="text-xs text-slate-400 mt-0.5">{missRightCount} shots</div>
          </motion.div>
        </div>

        {/* Miss Tendency Insight - Animated */}
        <AnimatePresence>
          {totalMisses >= 3 && (
            <motion.div
              className={cn(
                'mt-4 p-3 rounded-lg flex items-center gap-3',
                missTendency === 'left' ? 'bg-red-50 border border-red-100' :
                missTendency === 'right' ? 'bg-orange-50 border border-orange-100' :
                'bg-slate-50 border border-slate-100'
              )}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <motion.div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
                  missTendency === 'left' ? 'bg-red-100 text-red-600' :
                  missTendency === 'right' ? 'bg-orange-100 text-orange-600' :
                  'bg-slate-200 text-slate-600'
                )}
                animate={missTendency !== 'balanced' ? {
                  x: [0, missTendency === 'left' ? -3 : 3, 0],
                } : {}}
                transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
              >
                {missTendency === 'left' ? '←' : missTendency === 'right' ? '→' : '↔'}
              </motion.div>
              <div>
                <div className="text-sm font-medium text-slate-700">
                  {missTendency === 'balanced'
                    ? 'Balanced miss pattern'
                    : `Tendency to miss ${missTendency}`}
                </div>
                <div className="text-xs text-slate-500">
                  {missTendency === 'balanced'
                    ? 'Misses are evenly distributed'
                    : `${Math.max(leftPctOfMisses, rightPctOfMisses).toFixed(0)}% of misses go ${missTendency}`}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Driver stats - Animated */}
        {driverFairwayPct !== null && (
          <motion.div
            className="mt-4 pt-4 border-t border-slate-100"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 font-medium">Driver fairway %</span>
              <div className="flex items-center gap-3">
                <AnimatedProgressBar value={driverFairwayPct} color="bg-green-500" delay={0.7} />
                <span className="font-semibold text-slate-900 tabular-nums w-10 text-right">{driverFairwayPct.toFixed(0)}%</span>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ============================================================================
// APPROACH DISPERSION CHART - Legacy (replaced by ApproachDispersionPremium)
// Kept for reference - can be deleted when premium version is stable
// ============================================================================

/** @internal Legacy component - use ApproachDispersionPremium instead */
export function ApproachDispersionVisualLegacy({
  girPct,
  girFromFairway,
  girFromRough,
  girFromSand,
  girTotal,
  girOpportunities,
  approachMissShortPct,
  approachMissLongPct,
  approachMissLeftPct,
  approachMissRightPct,
  approachMissShortLeftPct,
  approachMissShortRightPct,
  approachMissLongLeftPct,
  approachMissLongRightPct,
  approachMissTotal,
}: {
  girPct: number | null;
  girFromFairway: number | null;
  girFromRough: number | null;
  girFromSand: number | null;
  girTotal: number;
  girOpportunities: number;
  approachMissShortPct: number | null;
  approachMissLongPct: number | null;
  approachMissLeftPct: number | null;
  approachMissRightPct: number | null;
  approachMissShortLeftPct: number | null;
  approachMissShortRightPct: number | null;
  approachMissLongLeftPct: number | null;
  approachMissLongRightPct: number | null;
  approachMissTotal: number;
}) {
  const [isHovered, setIsHovered] = useState<'green' | 'fringe' | 'short' | 'long' | 'left' | 'right' | 'short_left' | 'short_right' | 'long_left' | 'long_right' | null>(null);
  const animatedGir = useAnimatedNumber(girPct, 1000);

  const missedGreen = girOpportunities - girTotal;
  const missedPct = girOpportunities > 0 ? (missedGreen / girOpportunities) * 100 : 0;
  const gir = girPct ?? 0;

  // Calculate the gap between fairway and rough GIR
  const fairwayAdvantage = girFromFairway !== null && girFromRough !== null
    ? girFromFairway - girFromRough
    : null;

  // Miss direction values - both cardinal and diagonal
  const missShort = approachMissShortPct ?? 0;
  const missLong = approachMissLongPct ?? 0;
  const missLeft = approachMissLeftPct ?? 0;
  const missRight = approachMissRightPct ?? 0;
  const missShortLeft = approachMissShortLeftPct ?? 0;
  const missShortRight = approachMissShortRightPct ?? 0;
  const missLongLeft = approachMissLongLeftPct ?? 0;
  const missLongRight = approachMissLongRightPct ?? 0;

  // All 8-direction miss data for visualization
  const missDirections = [
    { type: 'short' as const, pct: missShort, label: 'Short', color: '#3b82f6', angle: 180 },
    { type: 'long' as const, pct: missLong, label: 'Long', color: '#8b5cf6', angle: 0 },
    { type: 'left' as const, pct: missLeft, label: 'Left', color: '#ef4444', angle: 270 },
    { type: 'right' as const, pct: missRight, label: 'Right', color: '#f97316', angle: 90 },
    { type: 'short_left' as const, pct: missShortLeft, label: 'Short-Left', color: '#6366f1', angle: 225 },
    { type: 'short_right' as const, pct: missShortRight, label: 'Short-Right', color: '#0ea5e9', angle: 135 },
    { type: 'long_left' as const, pct: missLongLeft, label: 'Long-Left', color: '#a855f7', angle: 315 },
    { type: 'long_right' as const, pct: missLongRight, label: 'Long-Right', color: '#ec4899', angle: 45 },
  ];

  // Find dominant miss pattern (from cardinal directions only for the insight)
  const cardinalMisses = missDirections.slice(0, 4);
  const dominantMiss = cardinalMisses.reduce((a, b) => a.pct > b.pct ? a : b);
  const hasDominantPattern = dominantMiss.pct > 35;

  return (
    <motion.div
      className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden group"
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ boxShadow: '0 20px 40px rgba(0,0,0,0.08)', y: -4 }}
      transition={{ duration: 0.3 }}
    >
      {/* Animated shine effect */}
      <motion.div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)',
        }}
      />

      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 relative overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-green-50/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        <div className="flex items-start justify-between relative">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h3 className="text-lg font-semibold text-slate-900 tracking-tight">Approach Accuracy</h3>
            <p className="text-sm text-slate-500 mt-0.5">Greens in regulation</p>
          </motion.div>
          <motion.div
            className="text-right"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
          >
            <div className="text-3xl font-bold text-green-600 tabular-nums tracking-tight">
              {animatedGir.toFixed(0)}%
            </div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">GIR</div>
          </motion.div>
        </div>
      </div>

      {/* Visual Green Target */}
      <div className="px-6 py-8 bg-gradient-to-b from-slate-50/50 to-white">
        <motion.div
          className="relative max-w-sm mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <svg viewBox="0 0 200 200" className="w-full" style={{ maxHeight: '200px' }}>
            <defs>
              <radialGradient id="greenGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={isHovered === 'green' ? 0.6 : 0.4} />
                <stop offset="70%" stopColor="#16a34a" stopOpacity={isHovered === 'green' ? 0.35 : 0.2} />
                <stop offset="100%" stopColor="#15803d" stopOpacity={isHovered === 'green' ? 0.2 : 0.1} />
              </radialGradient>
              <radialGradient id="fringeGrad" cx="50%" cy="50%" r="50%">
                <stop offset="60%" stopColor="#86efac" stopOpacity={isHovered === 'fringe' ? 0.25 : 0.1} />
                <stop offset="100%" stopColor="#4ade80" stopOpacity={isHovered === 'fringe' ? 0.35 : 0.2} />
              </radialGradient>
            </defs>

            {/* Fringe/collar area - interactive */}
            <motion.ellipse
              cx="100" cy="100" rx="90" ry="80"
              fill="url(#fringeGrad)"
              className="cursor-pointer"
              onMouseEnter={() => setIsHovered('fringe')}
              onMouseLeave={() => setIsHovered(null)}
              whileHover={{ opacity: 0.9 }}
            />

            {/* Green surface - interactive */}
            <motion.ellipse
              cx="100" cy="100" rx="60" ry="50"
              fill="url(#greenGrad)"
              stroke="#16a34a"
              strokeWidth="2"
              strokeDasharray="6 4"
              opacity="0.8"
              className="cursor-pointer"
              onMouseEnter={() => setIsHovered('green')}
              onMouseLeave={() => setIsHovered(null)}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.8 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
            />

            {/* Pin location - animated */}
            <motion.g
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <circle cx="100" cy="100" r="4" fill="#1f2937" />
              <motion.line
                x1="100" y1="70" x2="100" y2="100"
                stroke="#fbbf24" strokeWidth="2"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.6, duration: 0.4 }}
              />
              <motion.polygon
                points="100,70 115,78 100,78"
                fill="#ef4444"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.8, type: 'spring' }}
              />
            </motion.g>

            {/* GIR shots (on green) - animated dots */}
            {gir > 0 && Array.from({ length: Math.min(Math.round(gir / 10), 8) }).map((_, i) => {
              const angle = (i / 8) * 2 * Math.PI - Math.PI / 2;
              const radius = 18 + (i % 3) * 14;
              const x = 100 + Math.cos(angle) * radius;
              const y = 100 + Math.sin(angle) * (radius * 0.8);
              return (
                <motion.circle
                  key={`gir-${i}`}
                  cx={x}
                  cy={y}
                  r="6"
                  fill="#16a34a"
                  variants={shotDotVariants}
                  initial="hidden"
                  animate="visible"
                  custom={i}
                  whileHover={{ scale: 1.5, opacity: 1 }}
                  style={{ filter: isHovered === 'green' ? 'brightness(1.2)' : 'none' }}
                />
              );
            })}

            {/* Missed green shots - positioned by actual miss direction data */}
            {missDirections.filter(d => d.pct > 0).map((dir, idx) => {
              // Calculate position based on angle and percentage (higher % = more dots closer to that zone)
              const dotCount = Math.max(1, Math.round(dir.pct / 20)); // 1-5 dots per direction
              const angleRad = (dir.angle - 90) * (Math.PI / 180);

              return Array.from({ length: Math.min(dotCount, 5) }).map((_, i) => {
                // Spread dots in the direction zone with some variance
                const seed = (idx * 1000 + i * 7919);
                const variance = ((seed % 100) / 100 - 0.5) * 20; // ±10 degrees
                const adjustedAngle = angleRad + (variance * Math.PI / 180);
                const baseRadius = 68 + (i % 2) * 12;
                const x = 100 + Math.cos(adjustedAngle) * baseRadius;
                const y = 100 + Math.sin(adjustedAngle) * (baseRadius * 0.8);

                return (
                  <motion.circle
                    key={`miss-${dir.type}-${i}`}
                    cx={x}
                    cy={y}
                    r="5"
                    fill={dir.color}
                    variants={shotDotVariants}
                    initial="hidden"
                    animate="visible"
                    custom={idx + i}
                    whileHover={{ scale: 1.5, opacity: 1 }}
                    className="cursor-pointer"
                    onMouseEnter={() => setIsHovered(dir.type as typeof isHovered)}
                    onMouseLeave={() => setIsHovered(null)}
                    style={{
                      filter: isHovered === dir.type ? 'brightness(1.3)' : 'none',
                      opacity: isHovered && isHovered !== dir.type && isHovered !== 'green' && isHovered !== 'fringe' ? 0.3 : 0.85
                    }}
                  />
                );
              });
            })}

            {/* Direction zone indicators (wedge segments) for miss patterns */}
            {missDirections.filter(d => d.pct >= 15).map((dir, idx) => {
              const segmentAngle = 35; // degrees
              const startAngle = (dir.angle - segmentAngle / 2 - 90) * (Math.PI / 180);
              const endAngle = (dir.angle + segmentAngle / 2 - 90) * (Math.PI / 180);
              const innerR = 62;
              const outerR = 85;

              const x1 = 100 + Math.cos(startAngle) * innerR;
              const y1 = 100 + Math.sin(startAngle) * (innerR * 0.8);
              const x2 = 100 + Math.cos(startAngle) * outerR;
              const y2 = 100 + Math.sin(startAngle) * (outerR * 0.8);
              const x3 = 100 + Math.cos(endAngle) * outerR;
              const y3 = 100 + Math.sin(endAngle) * (outerR * 0.8);
              const x4 = 100 + Math.cos(endAngle) * innerR;
              const y4 = 100 + Math.sin(endAngle) * (innerR * 0.8);

              return (
                <motion.path
                  key={`zone-${dir.type}`}
                  d={`M${x1},${y1} L${x2},${y2} A${outerR},${outerR * 0.8} 0 0,1 ${x3},${y3} L${x4},${y4} A${innerR},${innerR * 0.8} 0 0,0 ${x1},${y1} Z`}
                  fill={dir.color}
                  fillOpacity={isHovered === dir.type ? 0.25 : 0.08}
                  stroke={dir.color}
                  strokeWidth={isHovered === dir.type ? 2 : 1}
                  strokeOpacity={isHovered === dir.type ? 0.6 : 0.2}
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => setIsHovered(dir.type as typeof isHovered)}
                  onMouseLeave={() => setIsHovered(null)}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 + idx * 0.05 }}
                />
              );
            })}

            {/* Labels - animated */}
            <motion.text
              x="100" y="130"
              textAnchor="middle"
              fontSize="11"
              fill={isHovered === 'green' ? '#16a34a' : '#16a34a'}
              fontWeight="600"
              opacity={isHovered === 'green' ? 1 : 0.9}
              initial={{ opacity: 0 }}
              animate={{ opacity: isHovered === 'green' ? 1 : 0.9 }}
              transition={{ delay: 0.7 }}
            >
              GREEN
            </motion.text>
          </svg>

          {/* Hover tooltip - now shows direction-specific info */}
          <AnimatePresence>
            {isHovered && (
              <motion.div
                className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-slate-900/90 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-lg"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {isHovered === 'green' && `${gir.toFixed(0)}% GIR (${girTotal}/${girOpportunities})`}
                {isHovered === 'fringe' && `${missedPct.toFixed(0)}% missed (${missedGreen} shots)`}
                {missDirections.find(d => d.type === isHovered) && (
                  <span>{missDirections.find(d => d.type === isHovered)!.pct.toFixed(0)}% miss {missDirections.find(d => d.type === isHovered)!.label.toLowerCase()}</span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Stats - Solid surface */}
      <div className="px-6 py-5 bg-white border-t border-slate-100">
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Hit Green */}
          <motion.div
            className={cn(
              "text-center p-4 rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 border transition-all cursor-default",
              isHovered === 'green' ? 'border-green-400 shadow-lg scale-105' : 'border-green-200'
            )}
            variants={statCardVariants}
            initial="hidden"
            animate="visible"
            custom={0}
            whileHover={{ scale: 1.05 }}
            onMouseEnter={() => setIsHovered('green')}
            onMouseLeave={() => setIsHovered(null)}
          >
            <div className="text-2xl font-bold text-green-600 tabular-nums">{gir.toFixed(0)}%</div>
            <div className="text-xs font-medium text-slate-600 mt-1">Hit Green</div>
            <div className="text-xs text-slate-400 mt-0.5">{girTotal} of {girOpportunities}</div>
          </motion.div>

          {/* Missed Green */}
          <motion.div
            className={cn(
              "text-center p-4 rounded-xl bg-gradient-to-br from-orange-50 to-orange-100/50 border transition-all cursor-default",
              isHovered === 'fringe' ? 'border-orange-300 shadow-lg scale-105' : 'border-orange-100'
            )}
            variants={statCardVariants}
            initial="hidden"
            animate="visible"
            custom={1}
            whileHover={{ scale: 1.05 }}
            onMouseEnter={() => setIsHovered('fringe')}
            onMouseLeave={() => setIsHovered(null)}
          >
            <div className="text-2xl font-bold text-orange-600 tabular-nums">{missedPct.toFixed(0)}%</div>
            <div className="text-xs font-medium text-slate-600 mt-1">Missed</div>
            <div className="text-xs text-slate-400 mt-0.5">{missedGreen} misses</div>
          </motion.div>
        </div>

        {/* GIR by lie breakdown - animated progress bars */}
        {(girFromFairway !== null || girFromRough !== null || girFromSand !== null) && (
          <motion.div
            className="space-y-3 pt-4 border-t border-slate-100"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">GIR by Lie</div>

            {girFromFairway !== null && (
              <motion.div
                className="flex items-center justify-between"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 }}
              >
                <div className="flex items-center gap-2">
                  <motion.div
                    className="w-3 h-3 rounded-full bg-green-500"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.7, type: 'spring' }}
                  />
                  <span className="text-sm text-slate-600">From Fairway</span>
                </div>
                <div className="flex items-center gap-2">
                  <AnimatedProgressBar value={girFromFairway} color="bg-green-500" delay={0.7} />
                  <span className="text-sm font-semibold text-slate-900 tabular-nums w-12 text-right">
                    {girFromFairway.toFixed(0)}%
                  </span>
                </div>
              </motion.div>
            )}

            {girFromRough !== null && (
              <motion.div
                className="flex items-center justify-between"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 }}
              >
                <div className="flex items-center gap-2">
                  <motion.div
                    className="w-3 h-3 rounded-full bg-amber-500"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.8, type: 'spring' }}
                  />
                  <span className="text-sm text-slate-600">From Rough</span>
                </div>
                <div className="flex items-center gap-2">
                  <AnimatedProgressBar value={girFromRough} color="bg-amber-500" delay={0.8} />
                  <span className="text-sm font-semibold text-slate-900 tabular-nums w-12 text-right">
                    {girFromRough.toFixed(0)}%
                  </span>
                </div>
              </motion.div>
            )}

            {girFromSand !== null && (
              <motion.div
                className="flex items-center justify-between"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 }}
              >
                <div className="flex items-center gap-2">
                  <motion.div
                    className="w-3 h-3 rounded-full bg-yellow-500"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.9, type: 'spring' }}
                  />
                  <span className="text-sm text-slate-600">From Sand</span>
                </div>
                <div className="flex items-center gap-2">
                  <AnimatedProgressBar value={girFromSand} color="bg-yellow-500" delay={0.9} />
                  <span className="text-sm font-semibold text-slate-900 tabular-nums w-12 text-right">
                    {girFromSand.toFixed(0)}%
                  </span>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Fairway advantage insight - animated */}
        <AnimatePresence>
          {fairwayAdvantage !== null && fairwayAdvantage > 10 && (
            <motion.div
              className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-100"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.6 }}
            >
              <div className="flex items-center gap-2">
                <motion.div
                  className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.8, type: 'spring' }}
                >
                  <span className="text-blue-600 text-xs font-bold">!</span>
                </motion.div>
                <div className="text-sm text-blue-800">
                  <span className="font-medium">Fairway advantage:</span>{' '}
                  +{fairwayAdvantage.toFixed(0)}% GIR from fairway vs rough
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Approach miss direction breakdown - shown when we have miss data */}
        {approachMissTotal > 0 && (
          <motion.div
            className="space-y-3 pt-4 mt-4 border-t border-slate-100"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Miss Direction Pattern</div>

            {/* Cardinal directions (primary) */}
            <div className="grid grid-cols-2 gap-2">
              {cardinalMisses.map((dir, idx) => {
                const arrowMap: Record<string, string> = { short: '↓', long: '↑', left: '←', right: '→' };
                return (
                  <motion.div
                    key={dir.type}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-lg transition-all cursor-pointer",
                      isHovered === dir.type ? 'ring-2 ring-offset-1' : 'bg-slate-50',
                      dir.pct >= 35 && 'font-semibold'
                    )}
                    style={{
                      backgroundColor: isHovered === dir.type ? `${dir.color}20` : undefined,
                      borderColor: dir.color,
                    }}
                    onMouseEnter={() => setIsHovered(dir.type as typeof isHovered)}
                    onMouseLeave={() => setIsHovered(null)}
                    initial={{ opacity: 0, x: idx % 2 === 0 ? -10 : 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 + idx * 0.05 }}
                  >
                    <div className="flex items-center gap-2">
                      <span style={{ color: dir.color }}>{arrowMap[dir.type] || '•'}</span>
                      <span className="text-sm text-slate-600">{dir.label}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-900">{dir.pct.toFixed(0)}%</span>
                  </motion.div>
                );
              })}
            </div>

            {/* Diagonal directions (shown only if significant) */}
            {(missShortLeft > 5 || missShortRight > 5 || missLongLeft > 5 || missLongRight > 5) && (
              <motion.div
                className="grid grid-cols-4 gap-1.5 mt-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
              >
                {missDirections.slice(4).filter(d => d.pct > 5).map((dir, idx) => {
                  const arrowMap: Record<string, string> = {
                    short_left: '↙', short_right: '↘', long_left: '↖', long_right: '↗'
                  };
                  return (
                    <motion.div
                      key={dir.type}
                      className={cn(
                        "flex flex-col items-center p-1.5 rounded-lg transition-all cursor-pointer text-center",
                        isHovered === dir.type ? 'ring-1 ring-offset-1' : 'bg-slate-50/50'
                      )}
                      style={{
                        backgroundColor: isHovered === dir.type ? `${dir.color}15` : undefined,
                      }}
                      onMouseEnter={() => setIsHovered(dir.type as typeof isHovered)}
                      onMouseLeave={() => setIsHovered(null)}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.95 + idx * 0.05 }}
                    >
                      <span style={{ color: dir.color }} className="text-xs">{arrowMap[dir.type] || '•'}</span>
                      <span className="text-[10px] text-slate-500 mt-0.5">{dir.pct.toFixed(0)}%</span>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            {/* Dominant miss insight */}
            <AnimatePresence>
              {hasDominantPattern && (
                <motion.div
                  className="mt-2 p-3 rounded-lg flex items-center gap-3"
                  style={{
                    backgroundColor: `${dominantMiss.color}10`,
                    borderWidth: 1,
                    borderColor: `${dominantMiss.color}30`,
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: 0.9 }}
                >
                  <motion.div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: `${dominantMiss.color}20`, color: dominantMiss.color }}
                  >
                    {dominantMiss.type === 'short' ? '↓' :
                     dominantMiss.type === 'long' ? '↑' :
                     dominantMiss.type === 'left' ? '←' : '→'}
                  </motion.div>
                  <div className="text-sm text-slate-700">
                    Tend to miss <span className="font-medium">{dominantMiss.label.toLowerCase()}</span> ({dominantMiss.pct.toFixed(0)}% of misses)
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
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
      className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ boxShadow: '0 8px 24px rgba(0,0,0,0.06)', y: -2 }}
    >
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100/80">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 tracking-tight">Approach Proximity</h3>
            <p className="text-[13px] text-slate-500 mt-0.5">How close approach shots land by distance</p>
          </div>
          {avgProx !== null && (
            <motion.div
              className="text-right"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
            >
              <div className="text-4xl font-bold text-green-600 tabular-nums tracking-tight leading-none">
                {Math.round(avgProx)}&apos;
              </div>
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-1">Avg</div>
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
                  isHovered && "bg-slate-50/80"
                )}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + idx * 0.04 }}
                onMouseEnter={() => setHoveredBucket(bucket.key)}
                onMouseLeave={() => setHoveredBucket(null)}
              >
                {/* Label */}
                <div className="w-16 text-sm font-medium text-slate-500 text-right shrink-0 tabular-nums">
                  {bucket.label}
                </div>

                {/* Bar container */}
                <div className="flex-1 h-7 bg-slate-100/80 rounded-md overflow-hidden relative">
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
                  isHovered ? "text-slate-900" : "text-slate-600"
                )}>
                  {Math.round(bucket.value || 0)}&apos;
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Color legend */}
        <motion.div
          className="mt-5 pt-4 border-t border-slate-100/80"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <div className="flex items-center gap-5 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-green-600" />
              <span>Close</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>Mid</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-600" />
              <span>Long</span>
            </div>
            <span className="ml-auto text-slate-300">Distance to hole in feet</span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// PUTTING DISPERSION CHART - Legacy (replaced by PuttingDispersionPremium)
// ============================================================================

/** @internal Legacy component - use PuttingDispersionPremium instead */
export function PuttingDispersionVisualLegacy({
  puttMissLeftPct,
  puttMissRightPct,
  puttMissShortPct,
  puttMissLongPct,
  puttMissLowPct,
  puttMissHighPct,
  totalPutts,
  onePuttsTotal,
  threePuttsTotal,
}: {
  puttMissLeftPct: number | null;
  puttMissRightPct: number | null;
  puttMissShortPct: number | null;
  puttMissLongPct: number | null;
  puttMissLowPct: number | null;
  puttMissHighPct: number | null;
  totalPutts: number;
  onePuttsTotal: number;
  threePuttsTotal: number;
}) {
  const [hoveredZone, setHoveredZone] = useState<'left' | 'right' | 'short' | 'long' | 'hole' | 'low' | 'high' | null>(null);
  const animatedTotalPutts = useAnimatedNumber(totalPutts, 800);
  const animatedOnePutts = useAnimatedNumber(onePuttsTotal, 1000);
  const animatedThreePutts = useAnimatedNumber(threePuttsTotal, 1000);

  const left = puttMissLeftPct ?? 0;
  const right = puttMissRightPct ?? 0;
  const short = puttMissShortPct ?? 0;
  const long = puttMissLongPct ?? 0;
  const low = puttMissLowPct ?? 0;   // Didn't break enough (amateur miss)
  const high = puttMissHighPct ?? 0; // Broke too much (pro miss)

  // Determine read tendency
  const hasReadData = low > 0 || high > 0;
  const readTendency = low > high + 10 ? 'under-read' : high > low + 10 ? 'over-read' : 'balanced';

  // Find dominant miss pattern
  const misses = [
    { type: 'left' as const, pct: left, label: 'Left', color: 'red' },
    { type: 'right' as const, pct: right, label: 'Right', color: 'orange' },
    { type: 'short' as const, pct: short, label: 'Short', color: 'blue' },
    { type: 'long' as const, pct: long, label: 'Long', color: 'purple' },
  ];
  const dominantMiss = misses.reduce((a, b) => a.pct > b.pct ? a : b);
  const hasDominantPattern = dominantMiss.pct > 35;

  return (
    <motion.div
      className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden group"
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ boxShadow: '0 20px 40px rgba(0,0,0,0.08)', y: -4 }}
      transition={{ duration: 0.3 }}
    >
      {/* Animated shine effect */}
      <motion.div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)',
        }}
      />

      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 relative overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        <div className="flex items-start justify-between relative">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h3 className="text-lg font-semibold text-slate-900 tracking-tight">Putting Miss Pattern</h3>
            <p className="text-sm text-slate-500 mt-0.5">Where missed putts finish</p>
          </motion.div>
          <motion.div
            className="text-right"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
          >
            <div className="text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
              {Math.round(animatedTotalPutts)}
            </div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Total Putts</div>
          </motion.div>
        </div>
      </div>

      {/* Visual Hole Target */}
      <div className="px-6 py-8 bg-gradient-to-b from-slate-50/50 to-white">
        <motion.div
          className="relative max-w-xs mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <svg viewBox="0 0 200 200" className="w-full" style={{ maxHeight: '200px' }}>
            <defs>
              <radialGradient id="puttGreenGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={hoveredZone === 'hole' ? 0.35 : 0.2} />
                <stop offset="100%" stopColor="#16a34a" stopOpacity={hoveredZone === 'hole' ? 0.2 : 0.1} />
              </radialGradient>
            </defs>

            {/* Green surface - animated entrance */}
            <motion.rect
              x="10" y="10" width="180" height="180" rx="12"
              fill="url(#puttGreenGrad)"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            />

            {/* Grid lines for reference - animated */}
            <motion.line
              x1="100" y1="20" x2="100" y2="180"
              stroke="#16a34a" strokeWidth="1" strokeDasharray="4 4" opacity="0.3"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
            />
            <motion.line
              x1="20" y1="100" x2="180" y2="100"
              stroke="#16a34a" strokeWidth="1" strokeDasharray="4 4" opacity="0.3"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
            />

            {/* Hole - animated with pulse */}
            <motion.g
              onMouseEnter={() => setHoveredZone('hole')}
              onMouseLeave={() => setHoveredZone(null)}
              className="cursor-pointer"
            >
              <motion.circle
                cx="100" cy="100" r="8"
                fill="#1f2937"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: 'spring', stiffness: 300 }}
              />
              <motion.circle
                cx="100" cy="100" r="6"
                fill="#374151"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.6, type: 'spring', stiffness: 300 }}
              />
              {hoveredZone === 'hole' && (
                <motion.circle
                  cx="100" cy="100" r="12"
                  fill="none"
                  stroke="#16a34a"
                  strokeWidth="2"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1.2, opacity: [0.8, 0] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              )}
            </motion.g>

            {/* Miss zone indicators - animated sized by percentage */}
            {/* Left */}
            <motion.g
              onMouseEnter={() => setHoveredZone('left')}
              onMouseLeave={() => setHoveredZone(null)}
              className="cursor-pointer"
            >
              <motion.rect
                x="20" y="60" width="40" height="80" rx="8"
                fill="#ef4444"
                initial={{ opacity: 0, x: -20 }}
                animate={{
                  opacity: Math.min(left / 100, 0.6),
                  x: 0,
                  scale: hoveredZone === 'left' ? 1.05 : 1,
                }}
                transition={{ delay: 0.3, type: 'spring' }}
              />
              <motion.text
                x="40" y="105"
                textAnchor="middle" fontSize="14" fill="#1f2937" fontWeight="700"
                initial={{ opacity: 0 }}
                animate={{ opacity: left > 10 ? 1 : 0.5 }}
                transition={{ delay: 0.5 }}
              >
                {left.toFixed(0)}%
              </motion.text>
              <motion.text
                x="40" y="120"
                textAnchor="middle" fontSize="8"
                fill={hoveredZone === 'left' ? '#ef4444' : '#64748b'}
                fontWeight={hoveredZone === 'left' ? '700' : '500'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                LEFT
              </motion.text>
            </motion.g>

            {/* Right */}
            <motion.g
              onMouseEnter={() => setHoveredZone('right')}
              onMouseLeave={() => setHoveredZone(null)}
              className="cursor-pointer"
            >
              <motion.rect
                x="140" y="60" width="40" height="80" rx="8"
                fill="#f97316"
                initial={{ opacity: 0, x: 20 }}
                animate={{
                  opacity: Math.min(right / 100, 0.6),
                  x: 0,
                  scale: hoveredZone === 'right' ? 1.05 : 1,
                }}
                transition={{ delay: 0.35, type: 'spring' }}
              />
              <motion.text
                x="160" y="105"
                textAnchor="middle" fontSize="14" fill="#1f2937" fontWeight="700"
                initial={{ opacity: 0 }}
                animate={{ opacity: right > 10 ? 1 : 0.5 }}
                transition={{ delay: 0.55 }}
              >
                {right.toFixed(0)}%
              </motion.text>
              <motion.text
                x="160" y="120"
                textAnchor="middle" fontSize="8"
                fill={hoveredZone === 'right' ? '#f97316' : '#64748b'}
                fontWeight={hoveredZone === 'right' ? '700' : '500'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.65 }}
              >
                RIGHT
              </motion.text>
            </motion.g>

            {/* Short */}
            <motion.g
              onMouseEnter={() => setHoveredZone('short')}
              onMouseLeave={() => setHoveredZone(null)}
              className="cursor-pointer"
            >
              <motion.rect
                x="60" y="140" width="80" height="40" rx="8"
                fill="#3b82f6"
                initial={{ opacity: 0, y: 20 }}
                animate={{
                  opacity: Math.min(short / 100, 0.6),
                  y: 0,
                  scale: hoveredZone === 'short' ? 1.05 : 1,
                }}
                transition={{ delay: 0.4, type: 'spring' }}
              />
              <motion.text
                x="100" y="165"
                textAnchor="middle" fontSize="14" fill="#1f2937" fontWeight="700"
                initial={{ opacity: 0 }}
                animate={{ opacity: short > 10 ? 1 : 0.5 }}
                transition={{ delay: 0.6 }}
              >
                {short.toFixed(0)}%
              </motion.text>
              <motion.text
                x="100" y="178"
                textAnchor="middle" fontSize="8"
                fill={hoveredZone === 'short' ? '#3b82f6' : '#64748b'}
                fontWeight={hoveredZone === 'short' ? '700' : '500'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
              >
                SHORT
              </motion.text>
            </motion.g>

            {/* Long */}
            <motion.g
              onMouseEnter={() => setHoveredZone('long')}
              onMouseLeave={() => setHoveredZone(null)}
              className="cursor-pointer"
            >
              <motion.rect
                x="60" y="20" width="80" height="40" rx="8"
                fill="#8b5cf6"
                initial={{ opacity: 0, y: -20 }}
                animate={{
                  opacity: Math.min(long / 100, 0.6),
                  y: 0,
                  scale: hoveredZone === 'long' ? 1.05 : 1,
                }}
                transition={{ delay: 0.45, type: 'spring' }}
              />
              <motion.text
                x="100" y="45"
                textAnchor="middle" fontSize="14" fill="#1f2937" fontWeight="700"
                initial={{ opacity: 0 }}
                animate={{ opacity: long > 10 ? 1 : 0.5 }}
                transition={{ delay: 0.65 }}
              >
                {long.toFixed(0)}%
              </motion.text>
              <motion.text
                x="100" y="56"
                textAnchor="middle" fontSize="8"
                fill={hoveredZone === 'long' ? '#8b5cf6' : '#64748b'}
                fontWeight={hoveredZone === 'long' ? '700' : '500'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.75 }}
              >
                LONG
              </motion.text>
            </motion.g>
          </svg>

          {/* Hover tooltip */}
          <AnimatePresence>
            {hoveredZone && hoveredZone !== 'hole' && (
              <motion.div
                className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-slate-900/90 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-lg"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {hoveredZone === 'left' && `${left.toFixed(0)}% miss left`}
                {hoveredZone === 'right' && `${right.toFixed(0)}% miss right`}
                {hoveredZone === 'short' && `${short.toFixed(0)}% miss short`}
                {hoveredZone === 'long' && `${long.toFixed(0)}% miss long`}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Stats - Solid surface */}
      <div className="px-6 py-5 bg-white border-t border-slate-100">
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* 1-Putts */}
          <motion.div
            className="text-center p-4 rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200 cursor-default"
            variants={statCardVariants}
            initial="hidden"
            animate="visible"
            custom={0}
            whileHover={{ scale: 1.05, boxShadow: '0 10px 20px rgba(34,197,94,0.15)' }}
          >
            <div className="text-2xl font-bold text-green-600 tabular-nums">
              {Math.round(animatedOnePutts)}
            </div>
            <div className="text-xs font-medium text-slate-600 mt-1">1-Putts</div>
          </motion.div>

          {/* 3-Putts */}
          <motion.div
            className="text-center p-4 rounded-xl bg-gradient-to-br from-red-50 to-red-100/50 border border-red-100 cursor-default"
            variants={statCardVariants}
            initial="hidden"
            animate="visible"
            custom={1}
            whileHover={{ scale: 1.05, boxShadow: '0 10px 20px rgba(239,68,68,0.15)' }}
          >
            <div className="text-2xl font-bold text-red-600 tabular-nums">
              {Math.round(animatedThreePutts)}
            </div>
            <div className="text-xs font-medium text-slate-600 mt-1">3-Putts</div>
          </motion.div>
        </div>

        {/* Dominant miss pattern insight - animated */}
        <AnimatePresence>
          {hasDominantPattern && (
            <motion.div
              className={cn(
                'p-3 rounded-lg flex items-center gap-3',
                dominantMiss.color === 'red' ? 'bg-red-50 border border-red-100' :
                dominantMiss.color === 'orange' ? 'bg-orange-50 border border-orange-100' :
                dominantMiss.color === 'blue' ? 'bg-blue-50 border border-blue-100' :
                'bg-purple-50 border border-purple-100'
              )}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.5 }}
            >
              <motion.div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
                  dominantMiss.color === 'red' ? 'bg-red-100 text-red-600' :
                  dominantMiss.color === 'orange' ? 'bg-orange-100 text-orange-600' :
                  dominantMiss.color === 'blue' ? 'bg-blue-100 text-blue-600' :
                  'bg-purple-100 text-purple-600'
                )}
                animate={{
                  [dominantMiss.type === 'left' ? 'x' : dominantMiss.type === 'right' ? 'x' : 'y']:
                    dominantMiss.type === 'left' ? [-3, 0] :
                    dominantMiss.type === 'right' ? [3, 0] :
                    dominantMiss.type === 'short' ? [3, 0] : [-3, 0],
                }}
                transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
              >
                {dominantMiss.type === 'left' ? '←' :
                 dominantMiss.type === 'right' ? '→' :
                 dominantMiss.type === 'short' ? '↓' : '↑'}
              </motion.div>
              <div>
                <div className="text-sm font-medium text-slate-700">
                  Dominant miss: {dominantMiss.label}
                </div>
                <div className="text-xs text-slate-500">
                  {dominantMiss.pct.toFixed(0)}% of missed putts
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Read Pattern (Low/High) - shown when we have read data */}
        {hasReadData && (
          <motion.div
            className="space-y-3 pt-4 mt-4 border-t border-slate-100"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Green Reading Pattern</div>

            <div className="grid grid-cols-2 gap-2">
              {/* Low (Under-read) */}
              <motion.div
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg transition-all cursor-default",
                  hoveredZone === 'low' ? 'bg-amber-100 border border-amber-200' : 'bg-slate-50'
                )}
                onMouseEnter={() => setHoveredZone('low')}
                onMouseLeave={() => setHoveredZone(null)}
                whileHover={{ scale: 1.02 }}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 }}
              >
                <div>
                  <div className="text-sm font-medium text-slate-700">Low</div>
                  <div className="text-xs text-slate-500">Under-read break</div>
                </div>
                <div className="text-xl font-bold text-amber-600 tabular-nums">{low.toFixed(0)}%</div>
              </motion.div>

              {/* High (Over-read) */}
              <motion.div
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg transition-all cursor-default",
                  hoveredZone === 'high' ? 'bg-cyan-100 border border-cyan-200' : 'bg-slate-50'
                )}
                onMouseEnter={() => setHoveredZone('high')}
                onMouseLeave={() => setHoveredZone(null)}
                whileHover={{ scale: 1.02 }}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.75 }}
              >
                <div>
                  <div className="text-sm font-medium text-slate-700">High</div>
                  <div className="text-xs text-slate-500">Over-read break</div>
                </div>
                <div className="text-xl font-bold text-cyan-600 tabular-nums">{high.toFixed(0)}%</div>
              </motion.div>
            </div>

            {/* Read tendency insight */}
            <AnimatePresence>
              {readTendency !== 'balanced' && (
                <motion.div
                  className={cn(
                    'mt-2 p-3 rounded-lg flex items-center gap-3',
                    readTendency === 'under-read' ? 'bg-amber-50 border border-amber-100' :
                    'bg-cyan-50 border border-cyan-100'
                  )}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: 0.8 }}
                >
                  <motion.div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-sm',
                      readTendency === 'under-read' ? 'bg-amber-100' : 'bg-cyan-100'
                    )}
                  >
                    {readTendency === 'under-read' ? '📉' : '📈'}
                  </motion.div>
                  <div>
                    <div className="text-sm font-medium text-slate-700">
                      {readTendency === 'under-read' ? 'Tendency to under-read break' : 'Tendency to over-read break'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {readTendency === 'under-read'
                        ? 'Putts often miss low (on the amateur side)'
                        : 'Putts often miss high (on the pro side)'}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

// Container animation variants for staggered children
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
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 text-center"
          whileHover={{ boxShadow: '0 10px 30px rgba(0,0,0,0.06)' }}
        >
          <motion.div
            className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}
          >
            <span className="text-3xl">🎯</span>
          </motion.div>
          <motion.h3
            className="text-lg font-semibold text-slate-900 mb-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            No Shot Data Yet
          </motion.h3>
          <motion.p
            className="text-slate-500 max-w-sm mx-auto"
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
          className="text-xl font-semibold text-slate-900 tracking-tight"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          Shot Dispersion
        </motion.h2>
        <motion.p
          className="text-sm text-slate-500 mt-1"
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
