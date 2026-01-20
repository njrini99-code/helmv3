'use client';

/**
 * Premium Approach Dispersion Chart
 *
 * Foundation-first design:
 * - Solid white background (no glass on data)
 * - Clear hierarchy (one dominant stat)
 * - Consistent 8px grid spacing
 * - Purposeful motion (fade-in, hover lift only)
 * - Distinctive green visualization with subtle topography
 */

import { memo, useState, useCallback } from 'react';
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
// MISS DIRECTION DATA
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
  // Calculate shot positions based on percentages
  const generateShotDots = useCallback(() => {
    const dots: Array<{ x: number; y: number; type: 'gir' | MissDirection; delay: number }> = [];

    // GIR shots (on the green)
    const girCount = Math.min(Math.round(girPct / 12), 8);
    for (let i = 0; i < girCount; i++) {
      const angle = (i / girCount) * Math.PI * 2;
      const r = 15 + (i % 3) * 10;
      dots.push({
        x: 100 + Math.cos(angle) * r,
        y: 100 + Math.sin(angle) * r * 0.75,
        type: 'gir',
        delay: i * 0.03,
      });
    }

    // Miss directions
    const misses: Array<{ pct: number; type: MissDirection; baseAngle: number }> = [
      { pct: missShort, type: 'short', baseAngle: Math.PI / 2 },
      { pct: missLong, type: 'long', baseAngle: -Math.PI / 2 },
      { pct: missLeft, type: 'left', baseAngle: Math.PI },
      { pct: missRight, type: 'right', baseAngle: 0 },
    ];

    misses.forEach(({ pct, type, baseAngle }) => {
      const count = Math.min(Math.round(pct / 15), 5);
      for (let i = 0; i < count; i++) {
        const spread = (Math.random() - 0.5) * 0.4;
        const r = 55 + Math.random() * 25;
        dots.push({
          x: 100 + Math.cos(baseAngle + spread) * r,
          y: 100 + Math.sin(baseAngle + spread) * r * 0.75,
          type,
          delay: 0.2 + i * 0.04,
        });
      }
    });

    return dots;
  }, [girPct, missShort, missLong, missLeft, missRight]);

  const dots = generateShotDots();

  return (
    <svg viewBox="0 0 200 200" className="w-full max-w-[240px] mx-auto">
      <defs>
        {/* Premium green gradient with subtle depth */}
        <radialGradient id="greenSurface" cx="50%" cy="45%" r="45%">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.35" />
          <stop offset="60%" stopColor="#16a34a" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#15803d" stopOpacity="0.15" />
        </radialGradient>

        {/* Fringe gradient */}
        <radialGradient id="fringeArea" cx="50%" cy="50%" r="55%">
          <stop offset="70%" stopColor="#86efac" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#4ade80" stopOpacity="0.15" />
        </radialGradient>

        {/* Subtle contour pattern */}
        <pattern id="contours" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="8" fill="none" stroke="#16a34a" strokeWidth="0.5" opacity="0.1" />
        </pattern>
      </defs>

      {/* Background fringe area */}
      <ellipse
        cx="100" cy="100" rx="85" ry="75"
        fill="url(#fringeArea)"
      />

      {/* Contour lines (subtle topographic effect) */}
      <ellipse cx="100" cy="100" rx="70" ry="60" fill="none" stroke="#16a34a" strokeWidth="0.5" opacity="0.15" />
      <ellipse cx="100" cy="100" rx="55" ry="45" fill="none" stroke="#16a34a" strokeWidth="0.5" opacity="0.12" />
      <ellipse cx="100" cy="100" rx="40" ry="32" fill="none" stroke="#16a34a" strokeWidth="0.5" opacity="0.1" />

      {/* Green surface */}
      <motion.ellipse
        cx="100" cy="100" rx="48" ry="40"
        fill="url(#greenSurface)"
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
        <circle cx="100" cy="100" r="3" fill="#1f2937" />
        <line x1="100" y1="75" x2="100" y2="100" stroke="#fbbf24" strokeWidth="1.5" />
        <polygon points="100,75 112,80 100,80" fill="#dc2626" />
      </motion.g>

      {/* Shot dots */}
      {dots.map((dot, i) => {
        const isGir = dot.type === 'gir';
        const config = dot.type && dot.type !== 'gir' ? missDirectionConfig[dot.type] : null;
        const isHovered = hoveredDirection === dot.type;
        const isOtherHovered = hoveredDirection !== null && hoveredDirection !== dot.type;

        return (
          <motion.circle
            key={i}
            cx={dot.x}
            cy={dot.y}
            r={isGir ? 5 : 4}
            fill={isGir ? '#16a34a' : config?.color || '#94a3b8'}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: isHovered ? 1.3 : 1,
              opacity: isOtherHovered ? 0.3 : (isGir ? 0.85 : 0.75),
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

      {/* Direction labels (only show on hover or for dominant miss) */}
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
// STAT PILL (compact stat display)
// ============================================================================

function StatPill({
  label,
  value,
  subtext,
  color = 'slate',
  isActive,
  onClick,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  color?: 'green' | 'slate' | 'red' | 'orange' | 'blue' | 'purple';
  isActive?: boolean;
  onClick?: () => void;
}) {
  const colorClasses = {
    green: 'bg-green-50 border-green-200 text-green-700',
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
    red: 'bg-red-50 border-red-200 text-red-600',
    orange: 'bg-orange-50 border-orange-200 text-orange-600',
    blue: 'bg-blue-50 border-blue-200 text-blue-600',
    purple: 'bg-purple-50 border-purple-200 text-purple-600',
  };

  const ringColorClasses = {
    green: 'ring-green-500',
    slate: 'ring-slate-400',
    red: 'ring-red-500',
    orange: 'ring-orange-500',
    blue: 'ring-blue-500',
    purple: 'ring-purple-500',
  };

  return (
    <motion.button
      type="button"
      className={cn(
        'flex flex-col items-center p-3 rounded-xl border transition-all',
        colorClasses[color],
        isActive && `ring-2 ring-offset-1 ${ringColorClasses[color]}`,
        onClick && 'cursor-pointer hover:shadow-sm',
      )}
      whileHover={onClick ? { y: -2 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      onClick={onClick}
    >
      <span className="text-xl font-bold tabular-nums">{value}</span>
      <span className="text-xs font-medium mt-0.5">{label}</span>
      {subtext && <span className="text-[10px] text-slate-500 mt-0.5">{subtext}</span>}
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
      <span className="text-sm text-slate-600 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ delay, duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
        />
      </div>
      <span className="text-sm font-semibold text-slate-900 tabular-nums w-12 text-right">
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

  return (
    <motion.div
      className={cn(
        'bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden',
        className
      )}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ boxShadow: '0 8px 24px rgba(0,0,0,0.06)', y: -2 }}
    >
      {/* Header - Clear hierarchy with ONE dominant stat */}
      <div className="px-6 py-5 border-b border-slate-100">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
              Approach Accuracy
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Greens in regulation
            </p>
          </div>

          {/* Dominant stat - the ONE number that matters */}
          <div className="text-right">
            <motion.div
              className="text-4xl font-bold text-green-600 tabular-nums tracking-tight"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
            >
              {gir.toFixed(0)}%
            </motion.div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">
              {girTotal}/{girOpportunities} GIR
            </div>
          </div>
        </div>
      </div>

      {/* Green Visualization - Solid background */}
      <div className="px-6 py-6 bg-slate-50/50">
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: `${missDirectionConfig[hoveredDirection].color}15`,
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

      {/* Stats Grid - Solid surface for data */}
      <div className="px-6 py-5 bg-white border-t border-slate-100">
        {/* Miss direction pills */}
        {approachMissTotal > 0 && (
          <div className="mb-5">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              Miss Pattern
            </div>
            <div className="grid grid-cols-4 gap-2">
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

        {/* GIR by lie breakdown */}
        {(girFromFairway !== null || girFromRough !== null || girFromSand !== null) && (
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
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
          {hasDominantPattern && (
            <motion.div
              className="mt-4 p-3 rounded-xl flex items-center gap-3"
              style={{
                backgroundColor: `${missDirectionConfig[dominantMiss.type].color}08`,
                borderWidth: 1,
                borderColor: `${missDirectionConfig[dominantMiss.type].color}20`,
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
                style={{
                  backgroundColor: `${missDirectionConfig[dominantMiss.type].color}15`,
                  color: missDirectionConfig[dominantMiss.type].color,
                }}
              >
                {missDirectionConfig[dominantMiss.type].icon}
              </div>
              <div>
                <div className="text-sm font-medium text-slate-800">
                  Tendency to miss {dominantMiss.type}
                </div>
                <div className="text-xs text-slate-500">
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
