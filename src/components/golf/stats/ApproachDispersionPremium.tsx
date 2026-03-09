'use client';

/**
 * Premium Approach Dispersion Chart
 *
 * Foundation-first design:
 * - Solid white background (no glass on data)
 * - Clear hierarchy (one dominant stat)
 * - Consistent 8px grid spacing
 * - Purposeful motion (fade-in, hover lift only)
 * - Deterministic dot positioning (no Math.random)
 * - Distinctive green visualization with subtle topography
 */

import { memo, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface ApproachDispersionProps {
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
  className?: string;
}

type MissDirection = 'short' | 'long' | 'left' | 'right' | null;

// ============================================================================
// SEEDED RANDOM (deterministic dot positions)
// ============================================================================

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

// ============================================================================
// MISS DIRECTION CONFIG
// ============================================================================

const missDirectionConfig = {
  short: { label: 'Short', color: '#3b82f6', icon: '↓', angle: 180 },
  long: { label: 'Long', color: '#8b5cf6', icon: '↑', angle: 0 },
  left: { label: 'Left', color: '#ef4444', icon: '←', angle: 270 },
  right: { label: 'Right', color: '#f97316', icon: '→', angle: 90 },
} as const;

// ============================================================================
// GREEN VISUALIZATION (SVG)
// ============================================================================

function GreenVisualization({
  girPct,
  missShort,
  missLong,
  missLeft,
  missRight,
  hoveredDirection,
  onHover,
}: {
  girPct: number;
  missShort: number;
  missLong: number;
  missLeft: number;
  missRight: number;
  hoveredDirection: MissDirection;
  onHover: (dir: MissDirection) => void;
}) {
  // Calculate shot positions deterministically
  const dots = useMemo(() => {
    const result: Array<{ x: number; y: number; type: 'gir' | MissDirection; delay: number }> = [];

    // GIR shots (on the green) - clustered around pin
    const girCount = Math.min(Math.round(girPct / 12), 8);
    for (let i = 0; i < girCount; i++) {
      const angle = (i / Math.max(girCount, 1)) * Math.PI * 2;
      const r = 12 + (i % 3) * 9;
      result.push({
        x: 100 + Math.cos(angle) * r,
        y: 100 + Math.sin(angle) * r * 0.75,
        type: 'gir',
        delay: i * 0.03,
      });
    }

    // Miss directions - use seeded random instead of Math.random
    const misses: Array<{ pct: number; type: MissDirection; baseAngle: number }> = [
      { pct: missShort, type: 'short', baseAngle: Math.PI / 2 },
      { pct: missLong, type: 'long', baseAngle: -Math.PI / 2 },
      { pct: missLeft, type: 'left', baseAngle: Math.PI },
      { pct: missRight, type: 'right', baseAngle: 0 },
    ];

    let seedOffset = 100;
    misses.forEach(({ pct, type, baseAngle }) => {
      const count = Math.min(Math.round(pct / 15), 5);
      for (let i = 0; i < count; i++) {
        const spread = (seededRandom(seedOffset + i * 7) - 0.5) * 0.4;
        const r = 52 + seededRandom(seedOffset + i * 13) * 28;
        result.push({
          x: 100 + Math.cos(baseAngle + spread) * r,
          y: 100 + Math.sin(baseAngle + spread) * r * 0.75,
          type,
          delay: 0.15 + i * 0.04,
        });
        seedOffset += 17;
      }
    });

    return result;
  }, [girPct, missShort, missLong, missLeft, missRight]);

  return (
    <svg viewBox="0 0 200 200" className="w-full max-w-[260px] mx-auto">
      <defs>
        <radialGradient id="greenSurfaceP" cx="50%" cy="45%" r="45%">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.32" />
          <stop offset="60%" stopColor="#16a34a" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#15803d" stopOpacity="0.12" />
        </radialGradient>
        <radialGradient id="fringeAreaP" cx="50%" cy="50%" r="55%">
          <stop offset="70%" stopColor="#86efac" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#4ade80" stopOpacity="0.12" />
        </radialGradient>
      </defs>

      {/* Background fringe area */}
      <ellipse cx="100" cy="100" rx="85" ry="75" fill="url(#fringeAreaP)" />

      {/* Contour lines (subtle topographic effect) */}
      <ellipse cx="100" cy="100" rx="70" ry="60" fill="none" stroke="#16a34a" strokeWidth="0.5" opacity="0.12" />
      <ellipse cx="100" cy="100" rx="55" ry="45" fill="none" stroke="#16a34a" strokeWidth="0.5" opacity="0.1" />
      <ellipse cx="100" cy="100" rx="40" ry="32" fill="none" stroke="#16a34a" strokeWidth="0.5" opacity="0.08" />

      {/* Green surface */}
      <motion.ellipse
        cx="100" cy="100" rx="48" ry="40"
        fill="url(#greenSurfaceP)"
        stroke="#16a34a"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />

      {/* Pin flag */}
      <motion.g
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
      >
        <circle cx="100" cy="100" r="2.5" fill="#1f2937" />
        <line x1="100" y1="77" x2="100" y2="100" stroke="#fbbf24" strokeWidth="1.5" />
        <polygon points="100,77 111,81 100,81" fill="#dc2626" />
      </motion.g>

      {/* Shot dots */}
      {dots.map((dot, i) => {
        const isGir = dot.type === 'gir';
        const config = dot.type && dot.type !== 'gir' ? missDirectionConfig[dot.type] : null;
        const isHovered = hoveredDirection === dot.type;
        const isOtherHovered = hoveredDirection !== null && hoveredDirection !== dot.type;

        return (
          <motion.circle
            key={`${dot.type}-${i}`}
            cx={dot.x}
            cy={dot.y}
            r={isGir ? 5 : 4}
            fill={isGir ? '#16a34a' : config?.color || '#94a3b8'}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: isHovered ? 1.25 : 1,
              opacity: isOtherHovered ? 0.25 : (isGir ? 0.85 : 0.75),
            }}
            transition={{
              delay: dot.delay,
              duration: 0.2,
              scale: { duration: 0.15 },
            }}
            style={{
              cursor: dot.type !== 'gir' ? 'pointer' : 'default',
              filter: isHovered ? `drop-shadow(0 0 4px ${config?.color})` : 'none',
            }}
            onMouseEnter={() => dot.type !== 'gir' && onHover(dot.type)}
            onMouseLeave={() => onHover(null)}
          />
        );
      })}

      {/* Direction labels (only on hover) */}
      <AnimatePresence>
        {hoveredDirection && (
          <motion.text
            x={hoveredDirection === 'left' ? 25 : hoveredDirection === 'right' ? 175 : 100}
            y={hoveredDirection === 'short' ? 185 : hoveredDirection === 'long' ? 20 : 100}
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill={missDirectionConfig[hoveredDirection].color}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {missDirectionConfig[hoveredDirection].label.toUpperCase()}
          </motion.text>
        )}
      </AnimatePresence>
    </svg>
  );
}

// ============================================================================
// STAT PILL
// ============================================================================

function StatPill({
  label,
  value,
  color = 'slate',
  isActive,
  onClick,
}: {
  label: string;
  value: string | number;
  color?: 'green' | 'slate' | 'red' | 'orange' | 'blue' | 'purple';
  isActive?: boolean;
  onClick?: () => void;
}) {
  const colorClasses = {
    green: 'bg-primary-50/80 border-primary-200/60 text-primary-700',
    slate: 'bg-warm-50/80 border-warm-200/60 text-warm-700',
    red: 'bg-red-50/80 border-red-200/60 text-red-600',
    orange: 'bg-orange-50/80 border-orange-200/60 text-orange-600',
    blue: 'bg-blue-50/80 border-blue-200/60 text-blue-600',
    purple: 'bg-purple-50/80 border-purple-200/60 text-purple-600',
  };

  const ringClasses = {
    green: 'ring-primary-500/40',
    slate: 'ring-warm-400/40',
    red: 'ring-red-500/40',
    orange: 'ring-orange-500/40',
    blue: 'ring-blue-500/40',
    purple: 'ring-purple-500/40',
  };

  return (
    <motion.button
      type="button"
      className={cn(
        'flex flex-col items-center p-3 rounded-xl border transition-all',
        colorClasses[color],
        isActive && `ring-2 ring-offset-1 ${ringClasses[color]}`,
        onClick && 'cursor-pointer hover:shadow-sm',
      )}
      whileHover={onClick ? { y: -1 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      onClick={onClick}
    >
      <span className="text-xl font-bold tabular-nums leading-none">{value}</span>
      <span className="text-xs font-medium mt-1.5">{label}</span>
    </motion.button>
  );
}

// ============================================================================
// PROGRESS BAR (GIR by lie)
// ============================================================================

function LieProgressBar({
  label,
  value,
  color,
  delay = 0,
}: {
  label: string;
  value: number;
  color: string;
  delay?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-warm-600 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-warm-100 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ delay, duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
        />
      </div>
      <span className="text-sm font-semibold text-warm-900 tabular-nums w-12 text-right">
        {value.toFixed(0)}%
      </span>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ApproachDispersionPremium = memo(function ApproachDispersionPremium({
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
  className,
}: ApproachDispersionProps) {
  const [hoveredDirection, setHoveredDirection] = useState<MissDirection>(null);

  const gir = girPct ?? 0;
  const missShort = approachMissShortPct ?? 0;
  const missLong = approachMissLongPct ?? 0;
  const missLeft = approachMissLeftPct ?? 0;
  const missRight = approachMissRightPct ?? 0;

  // Find dominant miss pattern
  const misses = [
    { type: 'short' as const, pct: missShort },
    { type: 'long' as const, pct: missLong },
    { type: 'left' as const, pct: missLeft },
    { type: 'right' as const, pct: missRight },
  ];
  const dominantMiss = misses.reduce((a, b) => a.pct > b.pct ? a : b);
  const hasDominantPattern = dominantMiss.pct >= 35;

  // Check if we have any miss direction data
  const hasMissData = approachMissTotal > 0 && (missShort + missLong + missLeft + missRight) > 0;

  // Untracked misses
  const totalMissed = girOpportunities - girTotal;
  const hasUntrackedMisses = totalMissed > 0 && approachMissTotal === 0;

  return (
    <motion.div
      className={cn(
        'bg-white rounded-2xl border border-warm-200/80 shadow-sm overflow-hidden',
        className
      )}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ boxShadow: '0 8px 24px rgba(0,0,0,0.06)', y: -2 }}
    >
      {/* Header */}
      <div className="px-6 py-5 border-b border-warm-100/80">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-warm-900 tracking-tight">
              Approach Accuracy
            </h3>
            <p className="text-[13px] text-warm-500 mt-0.5">
              Greens in regulation
            </p>
          </div>
          <div className="text-right">
            <motion.div
              className="text-4xl font-bold text-primary-600 tabular-nums tracking-tight leading-none"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
            >
              {gir.toFixed(0)}%
            </motion.div>
            <div className="text-xs font-medium text-warm-400 uppercase tracking-wide mt-1 tabular-nums">
              {girTotal}/{girOpportunities} GIR
            </div>
          </div>
        </div>
      </div>

      {/* Green Visualization */}
      <div className="px-6 py-5 bg-warm-50/40">
        <GreenVisualization
          girPct={gir}
          missShort={missShort}
          missLong={missLong}
          missLeft={missLeft}
          missRight={missRight}
          hoveredDirection={hoveredDirection}
          onHover={setHoveredDirection}
        />

        {/* Hover tooltip */}
        <AnimatePresence>
          {hoveredDirection && (
            <motion.div
              className="mt-3 text-center"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <span
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: `${missDirectionConfig[hoveredDirection].color}12`,
                  color: missDirectionConfig[hoveredDirection].color,
                }}
              >
                <span>{missDirectionConfig[hoveredDirection].icon}</span>
                {misses.find(m => m.type === hoveredDirection)?.pct.toFixed(0)}% miss {hoveredDirection}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Stats Grid */}
      <div className="px-6 py-5 bg-white border-t border-warm-100/80">
        {/* Miss direction pills */}
        {hasMissData && (
          <div className="mb-5">
            <div className="text-xs font-semibold text-warm-400 uppercase tracking-wide mb-3">
              Miss Pattern
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {misses.map(({ type, pct }) => (
                <StatPill
                  key={type}
                  label={missDirectionConfig[type].label}
                  value={`${pct.toFixed(0)}%`}
                  color={
                    type === 'short' ? 'blue' :
                    type === 'long' ? 'purple' :
                    type === 'left' ? 'red' : 'orange'
                  }
                  isActive={hoveredDirection === type}
                  onClick={() => setHoveredDirection(hoveredDirection === type ? null : type)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Untracked misses notice */}
        {hasUntrackedMisses && (
          <motion.div
            className="mb-5 px-3 py-2 rounded-lg bg-warm-50 border border-warm-100"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center gap-2 text-xs text-warm-500">
              <svg className="w-3.5 h-3.5 text-warm-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                {totalMissed} missed green{totalMissed !== 1 ? 's' : ''} without miss direction data
              </span>
            </div>
          </motion.div>
        )}

        {/* GIR by lie breakdown */}
        {(girFromFairway !== null || girFromRough !== null || girFromSand !== null) && (
          <div className="space-y-3 pt-4 border-t border-warm-100">
            <div className="text-xs font-semibold text-warm-400 uppercase tracking-wide">
              GIR by Lie
            </div>

            {girFromFairway !== null && (
              <LieProgressBar
                label="From Fairway"
                value={girFromFairway}
                color="#16a34a"
                delay={0.1}
              />
            )}
            {girFromRough !== null && (
              <LieProgressBar
                label="From Rough"
                value={girFromRough}
                color="#f59e0b"
                delay={0.15}
              />
            )}
            {girFromSand !== null && (
              <LieProgressBar
                label="From Sand"
                value={girFromSand}
                color="#eab308"
                delay={0.2}
              />
            )}
          </div>
        )}

        {/* Dominant miss insight */}
        <AnimatePresence>
          {hasDominantPattern && hasMissData && (
            <motion.div
              className="mt-4 p-3 rounded-xl flex items-center gap-3"
              style={{
                backgroundColor: `${missDirectionConfig[dominantMiss.type].color}06`,
                borderWidth: 1,
                borderColor: `${missDirectionConfig[dominantMiss.type].color}18`,
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-lg shrink-0"
                style={{
                  backgroundColor: `${missDirectionConfig[dominantMiss.type].color}12`,
                  color: missDirectionConfig[dominantMiss.type].color,
                }}
              >
                {missDirectionConfig[dominantMiss.type].icon}
              </div>
              <div>
                <div className="text-sm font-medium text-warm-800">
                  Tendency to miss {dominantMiss.type}
                </div>
                <div className="text-xs text-warm-500">
                  {dominantMiss.pct.toFixed(0)}% of missed greens
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
});

export default ApproachDispersionPremium;
