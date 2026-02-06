'use client';

/**
 * Premium Driving Dispersion Chart
 *
 * Foundation-first design:
 * - Solid white background (no glass on data)
 * - Clear hierarchy (one dominant stat - fairway %)
 * - Consistent 8px grid spacing
 * - Purposeful motion (fade-in, hover states only)
 * - Clean fairway visualization with subtle perspective
 * - Accurate stats: handles untracked misses gracefully
 */

import { memo, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface DrivingDispersionProps {
  fairwayPct: number | null;
  driverFairwayPct: number | null;
  missLeftCount: number;
  missRightCount: number;
  fairwaysHit: number;
  fairwayOpportunities: number;
  className?: string;
}

type HoveredZone = 'left' | 'fairway' | 'right' | null;

// ============================================================================
// SEEDED RANDOM (deterministic dot positions)
// ============================================================================

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

// ============================================================================
// FAIRWAY VISUALIZATION (SVG)
// ============================================================================

function FairwayVisualization({
  fairwayPct,
  missLeftCount,
  missRightCount,
  hoveredZone,
  onHover,
}: {
  fairwayPct: number;
  missLeftCount: number;
  missRightCount: number;
  hoveredZone: HoveredZone;
  onHover: (zone: HoveredZone) => void;
}) {
  const shots = useMemo(() => {
    const result: Array<{ x: number; y: number; zone: HoveredZone; delay: number }> = [];

    // Left misses - deterministic positions
    const leftCount = Math.min(missLeftCount, 8);
    for (let i = 0; i < leftCount; i++) {
      result.push({
        x: 12 + seededRandom(i * 7 + 1) * 42,
        y: 15 + seededRandom(i * 13 + 2) * 105,
        zone: 'left',
        delay: i * 0.04,
      });
    }

    // Fairway hits - cluster in fairway zone
    const fairwayCount = Math.min(Math.round(fairwayPct / 8), 12);
    for (let i = 0; i < fairwayCount; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      result.push({
        x: 80 + col * 20 + seededRandom(i * 11 + 50) * 10,
        y: 14 + row * 35 + seededRandom(i * 17 + 60) * 18,
        zone: 'fairway',
        delay: 0.08 + i * 0.025,
      });
    }

    // Right misses - deterministic positions
    const rightCount = Math.min(missRightCount, 8);
    for (let i = 0; i < rightCount; i++) {
      result.push({
        x: 186 + seededRandom(i * 19 + 3) * 42,
        y: 15 + seededRandom(i * 23 + 4) * 105,
        zone: 'right',
        delay: i * 0.04,
      });
    }

    return result;
  }, [fairwayPct, missLeftCount, missRightCount]);

  return (
    <svg viewBox="0 0 240 140" className="w-full max-w-[300px] mx-auto">
      <defs>
        <linearGradient id="fairwayGradP" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#22c55e" stopOpacity={hoveredZone === 'fairway' ? 0.4 : 0.22} />
          <stop offset="100%" stopColor="#16a34a" stopOpacity={hoveredZone === 'fairway' ? 0.5 : 0.28} />
        </linearGradient>
        <linearGradient id="leftRoughP" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fecaca" stopOpacity={hoveredZone === 'left' ? 0.5 : 0.15} />
          <stop offset="100%" stopColor="#fca5a5" stopOpacity={hoveredZone === 'left' ? 0.6 : 0.22} />
        </linearGradient>
        <linearGradient id="rightRoughP" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fed7aa" stopOpacity={hoveredZone === 'right' ? 0.5 : 0.15} />
          <stop offset="100%" stopColor="#fdba74" stopOpacity={hoveredZone === 'right' ? 0.6 : 0.22} />
        </linearGradient>
      </defs>

      {/* Background zones with perspective */}
      <motion.path
        d="M0,0 L65,0 L50,140 L0,140 Z"
        fill="url(#leftRoughP)"
        className="cursor-pointer"
        onMouseEnter={() => onHover('left')}
        onMouseLeave={() => onHover(null)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      />
      <motion.path
        d="M65,0 L175,0 L190,140 L50,140 Z"
        fill="url(#fairwayGradP)"
        className="cursor-pointer"
        onMouseEnter={() => onHover('fairway')}
        onMouseLeave={() => onHover(null)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      />
      <motion.path
        d="M175,0 L240,0 L240,140 L190,140 Z"
        fill="url(#rightRoughP)"
        className="cursor-pointer"
        onMouseEnter={() => onHover('right')}
        onMouseLeave={() => onHover(null)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      />

      {/* Fairway edge lines */}
      <motion.line
        x1="65" y1="0" x2="50" y2="140"
        stroke="#16a34a" strokeWidth="1" strokeDasharray="4 3" opacity="0.35"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      />
      <motion.line
        x1="175" y1="0" x2="190" y2="140"
        stroke="#16a34a" strokeWidth="1" strokeDasharray="4 3" opacity="0.35"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      />

      {/* Distance markers */}
      {[35, 70, 105].map((y, i) => (
        <motion.line
          key={y}
          x1="40" y1={y} x2="200" y2={y}
          stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="2 4" opacity="0.25"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.25 }}
          transition={{ delay: 0.4 + i * 0.08 }}
        />
      ))}

      {/* Tee box */}
      <motion.g
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <rect x="105" y="125" width="30" height="10" rx="2" fill="#64748b" />
        <text x="120" y="133" textAnchor="middle" fontSize="6" fill="white" fontWeight="500">
          TEE
        </text>
      </motion.g>

      {/* Shot dots */}
      {shots.map((shot, i) => {
        const isHovered = hoveredZone === shot.zone;
        const isOtherHovered = hoveredZone !== null && hoveredZone !== shot.zone;
        const color = shot.zone === 'fairway' ? '#16a34a' : shot.zone === 'left' ? '#ef4444' : '#f97316';

        return (
          <motion.circle
            key={`${shot.zone}-${i}`}
            cx={shot.x}
            cy={shot.y}
            r={shot.zone === 'fairway' ? 5 : 4.5}
            fill={color}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: isHovered ? 1.15 : 1,
              opacity: isOtherHovered ? 0.25 : 0.8,
            }}
            transition={{
              delay: shot.delay,
              duration: 0.2,
              scale: { duration: 0.15 },
            }}
            style={{
              filter: isHovered ? `drop-shadow(0 0 3px ${color})` : 'none',
            }}
          />
        );
      })}

      {/* Zone labels */}
      <motion.text
        x="30" y="75" textAnchor="middle" fontSize="9" fontWeight="500"
        fill={hoveredZone === 'left' ? '#ef4444' : '#94a3b8'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        LEFT
      </motion.text>
      <motion.text
        x="120" y="60" textAnchor="middle" fontSize="10" fontWeight="600"
        fill="#16a34a"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        FAIRWAY
      </motion.text>
      <motion.text
        x="210" y="75" textAnchor="middle" fontSize="9" fontWeight="500"
        fill={hoveredZone === 'right' ? '#f97316' : '#94a3b8'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        RIGHT
      </motion.text>
    </svg>
  );
}

// ============================================================================
// ZONE STAT CARD
// ============================================================================

function ZoneStatCard({
  label,
  percentage,
  count,
  color,
  isActive,
  onClick,
}: {
  label: string;
  percentage: number;
  count: number;
  color: 'green' | 'red' | 'orange';
  isActive?: boolean;
  onClick?: () => void;
}) {
  const colorClasses = {
    green: {
      bg: 'bg-green-50/80',
      border: 'border-green-200/60',
      text: 'text-green-700',
      ring: 'ring-green-500/40',
    },
    red: {
      bg: 'bg-red-50/80',
      border: 'border-red-200/60',
      text: 'text-red-600',
      ring: 'ring-red-500/40',
    },
    orange: {
      bg: 'bg-orange-50/80',
      border: 'border-orange-200/60',
      text: 'text-orange-600',
      ring: 'ring-orange-500/40',
    },
  };

  const classes = colorClasses[color];

  return (
    <motion.button
      type="button"
      className={cn(
        'flex flex-col items-center p-3.5 rounded-xl border transition-all',
        classes.bg, classes.border,
        isActive && `ring-2 ring-offset-1 ${classes.ring}`,
        onClick && 'cursor-pointer hover:shadow-sm',
      )}
      whileHover={onClick ? { y: -1 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      onClick={onClick}
    >
      <span className={cn('text-2xl font-bold tabular-nums leading-none', classes.text)}>
        {percentage.toFixed(0)}%
      </span>
      <span className="text-xs font-medium text-slate-600 mt-1.5">{label}</span>
      <span className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{count} shots</span>
    </motion.button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const DrivingDispersionPremium = memo(function DrivingDispersionPremium({
  fairwayPct,
  driverFairwayPct,
  missLeftCount,
  missRightCount,
  fairwaysHit,
  fairwayOpportunities,
  className,
}: DrivingDispersionProps) {
  const [hoveredZone, setHoveredZone] = useState<HoveredZone>(null);

  const fairway = fairwayPct ?? 0;
  const totalTrackedMisses = missLeftCount + missRightCount;
  const totalMisses = fairwayOpportunities - fairwaysHit;

  // Calculate accurate percentages based on actual shot counts
  // If we have direction data, use it proportionally
  // If no direction data exists, show the untracked portion honestly
  const untrackedMisses = Math.max(0, totalMisses - totalTrackedMisses);

  // Percentages of ALL tee shots (not just misses)
  const leftPct = fairwayOpportunities > 0
    ? (missLeftCount / fairwayOpportunities) * 100
    : 0;
  const rightPct = fairwayOpportunities > 0
    ? (missRightCount / fairwayOpportunities) * 100
    : 0;
  const untrackedPct = fairwayOpportunities > 0
    ? (untrackedMisses / fairwayOpportunities) * 100
    : 0;

  // Miss tendency (only meaningful if we have direction data)
  const hasMissDirectionData = totalTrackedMisses > 0;
  const leftPctOfTracked = totalTrackedMisses > 0 ? (missLeftCount / totalTrackedMisses) * 100 : 0;
  const rightPctOfTracked = totalTrackedMisses > 0 ? (missRightCount / totalTrackedMisses) * 100 : 0;
  const tendency = !hasMissDirectionData ? 'none' :
    leftPctOfTracked > 60 ? 'left' : rightPctOfTracked > 60 ? 'right' : 'balanced';

  return (
    <motion.div
      className={cn(
        'bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden',
        className
      )}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ boxShadow: '0 8px 24px rgba(0,0,0,0.06)', y: -2 }}
    >
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100/80">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
              Driving Accuracy
            </h3>
            <p className="text-[13px] text-slate-500 mt-0.5">
              Tee shot dispersion
            </p>
          </div>
          <div className="text-right">
            <motion.div
              className="text-4xl font-bold text-green-600 tabular-nums tracking-tight leading-none"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
            >
              {fairway.toFixed(0)}%
            </motion.div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-1 tabular-nums">
              {fairwaysHit}/{fairwayOpportunities} Fairways
            </div>
          </div>
        </div>
      </div>

      {/* Fairway Visualization */}
      <div className="px-6 py-5 bg-slate-50/40">
        <FairwayVisualization
          fairwayPct={fairway}
          missLeftCount={missLeftCount}
          missRightCount={missRightCount}
          hoveredZone={hoveredZone}
          onHover={setHoveredZone}
        />

        {/* Hover tooltip */}
        <AnimatePresence>
          {hoveredZone && (
            <motion.div
              className="mt-3 text-center"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium',
                  hoveredZone === 'fairway' && 'bg-green-100 text-green-700',
                  hoveredZone === 'left' && 'bg-red-100 text-red-700',
                  hoveredZone === 'right' && 'bg-orange-100 text-orange-700',
                )}
              >
                {hoveredZone === 'fairway' && `${fairway.toFixed(0)}% fairway (${fairwaysHit} shots)`}
                {hoveredZone === 'left' && `${leftPct.toFixed(0)}% left (${missLeftCount} shots)`}
                {hoveredZone === 'right' && `${rightPct.toFixed(0)}% right (${missRightCount} shots)`}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Stats breakdown */}
      <div className="px-6 py-5 bg-white border-t border-slate-100/80">
        <div className="grid grid-cols-3 gap-2.5">
          <ZoneStatCard
            label="Left"
            percentage={leftPct}
            count={missLeftCount}
            color="red"
            isActive={hoveredZone === 'left'}
            onClick={() => setHoveredZone(hoveredZone === 'left' ? null : 'left')}
          />
          <ZoneStatCard
            label="Fairway"
            percentage={fairway}
            count={fairwaysHit}
            color="green"
            isActive={hoveredZone === 'fairway'}
            onClick={() => setHoveredZone(hoveredZone === 'fairway' ? null : 'fairway')}
          />
          <ZoneStatCard
            label="Right"
            percentage={rightPct}
            count={missRightCount}
            color="orange"
            isActive={hoveredZone === 'right'}
            onClick={() => setHoveredZone(hoveredZone === 'right' ? null : 'right')}
          />
        </div>

        {/* Untracked misses notice */}
        {untrackedMisses > 0 && (
          <motion.div
            className="mt-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                {untrackedMisses} miss{untrackedMisses !== 1 ? 'es' : ''} without direction data ({untrackedPct.toFixed(0)}% of tee shots)
              </span>
            </div>
          </motion.div>
        )}

        {/* Driver-specific stat */}
        {driverFairwayPct !== null && (
          <motion.div
            className="mt-4 pt-4 border-t border-slate-100"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Driver fairway %</span>
              <div className="flex items-center gap-3">
                <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-green-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${driverFairwayPct}%` }}
                    transition={{ delay: 0.4, duration: 0.5 }}
                  />
                </div>
                <span className="text-sm font-semibold text-slate-900 tabular-nums w-10 text-right">
                  {driverFairwayPct.toFixed(0)}%
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Miss tendency insight */}
        <AnimatePresence>
          {tendency !== 'none' && tendency !== 'balanced' && totalTrackedMisses >= 3 && (
            <motion.div
              className={cn(
                'mt-4 p-3 rounded-xl flex items-center gap-3',
                tendency === 'left' ? 'bg-red-50/80 border border-red-100' : 'bg-orange-50/80 border border-orange-100'
              )}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center text-lg shrink-0',
                  tendency === 'left' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'
                )}
              >
                {tendency === 'left' ? '←' : '→'}
              </div>
              <div>
                <div className="text-sm font-medium text-slate-800">
                  Tendency to miss {tendency}
                </div>
                <div className="text-xs text-slate-500">
                  {Math.max(leftPctOfTracked, rightPctOfTracked).toFixed(0)}% of tracked misses go {tendency}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
});

export default DrivingDispersionPremium;
