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
// DRIVING DISPERSION CHART - Premium Visual
// ============================================================================

function DrivingDispersionVisual({
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
  const leftPctOfMisses = totalMisses > 0 ? (missLeftCount / totalMisses) * 100 : 50;
  const rightPctOfMisses = totalMisses > 0 ? (missRightCount / totalMisses) * 100 : 50;

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
// APPROACH DISPERSION CHART - Premium Visual
// ============================================================================

function ApproachDispersionVisual({
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
  approachMissTotal: number;
}) {
  const [isHovered, setIsHovered] = useState<'green' | 'fringe' | 'short' | 'long' | 'left' | 'right' | null>(null);
  const animatedGir = useAnimatedNumber(girPct, 1000);

  const missedGreen = girOpportunities - girTotal;
  const missedPct = girOpportunities > 0 ? (missedGreen / girOpportunities) * 100 : 0;
  const gir = girPct ?? 0;

  // Calculate the gap between fairway and rough GIR
  const fairwayAdvantage = girFromFairway !== null && girFromRough !== null
    ? girFromFairway - girFromRough
    : null;

  // Miss direction values
  const missShort = approachMissShortPct ?? 0;
  const missLong = approachMissLongPct ?? 0;
  const missLeft = approachMissLeftPct ?? 0;
  const missRight = approachMissRightPct ?? 0;

  // Find dominant miss pattern
  const misses = [
    { type: 'short' as const, pct: missShort, label: 'Short', color: 'blue' },
    { type: 'long' as const, pct: missLong, label: 'Long', color: 'purple' },
    { type: 'left' as const, pct: missLeft, label: 'Left', color: 'red' },
    { type: 'right' as const, pct: missRight, label: 'Right', color: 'orange' },
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

            {/* Missed green shots - animated dots */}
            {missedPct > 0 && Array.from({ length: Math.min(Math.round(missedPct / 10), 8) }).map((_, i) => {
              const angle = ((i + 3) / 8) * 2 * Math.PI;
              const radius = 65 + (i % 2) * 15;
              const x = 100 + Math.cos(angle) * radius;
              const y = 100 + Math.sin(angle) * (radius * 0.75);
              return (
                <motion.circle
                  key={`miss-${i}`}
                  cx={x}
                  cy={y}
                  r="5"
                  fill="#f97316"
                  variants={shotDotVariants}
                  initial="hidden"
                  animate="visible"
                  custom={i + 5}
                  whileHover={{ scale: 1.5, opacity: 1 }}
                  style={{ filter: isHovered === 'fringe' ? 'brightness(1.2)' : 'none' }}
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
            <motion.text
              x="100" y="185"
              textAnchor="middle"
              fontSize="9"
              fill={isHovered === 'fringe' ? '#f97316' : '#64748b'}
              fontWeight={isHovered === 'fringe' ? '600' : '500'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              FRINGE
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
                {isHovered === 'green' && `${gir.toFixed(0)}% GIR (${girTotal}/${girOpportunities})`}
                {isHovered === 'fringe' && `${missedPct.toFixed(0)}% missed (${missedGreen} shots)`}
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

            <div className="grid grid-cols-2 gap-2">
              {/* Short */}
              <motion.div
                className={cn(
                  "flex items-center justify-between p-2 rounded-lg transition-all",
                  isHovered === 'short' ? 'bg-blue-100' : 'bg-slate-50'
                )}
                onMouseEnter={() => setIsHovered('short')}
                onMouseLeave={() => setIsHovered(null)}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-blue-600">↓</span>
                  <span className="text-sm text-slate-600">Short</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">{missShort.toFixed(0)}%</span>
              </motion.div>

              {/* Long */}
              <motion.div
                className={cn(
                  "flex items-center justify-between p-2 rounded-lg transition-all",
                  isHovered === 'long' ? 'bg-purple-100' : 'bg-slate-50'
                )}
                onMouseEnter={() => setIsHovered('long')}
                onMouseLeave={() => setIsHovered(null)}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.75 }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-purple-600">↑</span>
                  <span className="text-sm text-slate-600">Long</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">{missLong.toFixed(0)}%</span>
              </motion.div>

              {/* Left */}
              <motion.div
                className={cn(
                  "flex items-center justify-between p-2 rounded-lg transition-all",
                  isHovered === 'left' ? 'bg-red-100' : 'bg-slate-50'
                )}
                onMouseEnter={() => setIsHovered('left')}
                onMouseLeave={() => setIsHovered(null)}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-red-600">←</span>
                  <span className="text-sm text-slate-600">Left</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">{missLeft.toFixed(0)}%</span>
              </motion.div>

              {/* Right */}
              <motion.div
                className={cn(
                  "flex items-center justify-between p-2 rounded-lg transition-all",
                  isHovered === 'right' ? 'bg-orange-100' : 'bg-slate-50'
                )}
                onMouseEnter={() => setIsHovered('right')}
                onMouseLeave={() => setIsHovered(null)}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.85 }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-orange-600">→</span>
                  <span className="text-sm text-slate-600">Right</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">{missRight.toFixed(0)}%</span>
              </motion.div>
            </div>

            {/* Dominant miss insight */}
            <AnimatePresence>
              {hasDominantPattern && (
                <motion.div
                  className={cn(
                    'mt-2 p-3 rounded-lg flex items-center gap-3',
                    dominantMiss.color === 'blue' ? 'bg-blue-50 border border-blue-100' :
                    dominantMiss.color === 'purple' ? 'bg-purple-50 border border-purple-100' :
                    dominantMiss.color === 'red' ? 'bg-red-50 border border-red-100' :
                    'bg-orange-50 border border-orange-100'
                  )}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: 0.9 }}
                >
                  <motion.div
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                      dominantMiss.color === 'blue' ? 'bg-blue-100 text-blue-600' :
                      dominantMiss.color === 'purple' ? 'bg-purple-100 text-purple-600' :
                      dominantMiss.color === 'red' ? 'bg-red-100 text-red-600' :
                      'bg-orange-100 text-orange-600'
                    )}
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
// PUTTING DISPERSION CHART - Premium Visual
// ============================================================================

function PuttingDispersionVisual({
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
        {/* Driving Dispersion */}
        <DrivingDispersionVisual
          fairwayPct={stats.fairwayPercentage}
          driverFairwayPct={stats.fairwayPctDriver}
          missLeftCount={stats.missLeftCount}
          missRightCount={stats.missRightCount}
          fairwaysHit={stats.fairwaysHit}
          fairwayOpportunities={stats.fairwayOpportunities}
        />

        {/* Approach Dispersion */}
        <ApproachDispersionVisual
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

      {/* Putting Dispersion - Full Width */}
      <PuttingDispersionVisual
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
