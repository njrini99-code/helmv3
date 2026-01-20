'use client';

/**
 * Premium Putting Dispersion Chart
 *
 * Foundation-first design:
 * - Solid white background (no glass on data)
 * - Clear hierarchy (one dominant stat)
 * - Consistent 8px grid spacing
 * - Purposeful motion (fade-in, hover states only)
 * - Clean putting green visualization
 */

import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface PuttingDispersionProps {
  puttMissLeftPct: number | null;
  puttMissRightPct: number | null;
  puttMissShortPct: number | null;
  puttMissLongPct: number | null;
  puttMissLowPct: number | null;
  puttMissHighPct: number | null;
  totalPutts: number;
  onePuttsTotal: number;
  threePuttsTotal: number;
  className?: string;
}

type MissZone = 'left' | 'right' | 'short' | 'long' | 'hole' | null;

// ============================================================================
// MISS DIRECTION CONFIG
// ============================================================================

const missConfig = {
  left: { label: 'Left', color: '#ef4444', icon: '←' },
  right: { label: 'Right', color: '#f97316', icon: '→' },
  short: { label: 'Short', color: '#3b82f6', icon: '↓' },
  long: { label: 'Long', color: '#8b5cf6', icon: '↑' },
} as const;

// ============================================================================
// PUTTING GREEN VISUALIZATION
// ============================================================================

function PuttingGreenVisualization({
  left,
  right,
  short,
  long,
  hoveredZone,
  onHover,
}: {
  left: number;
  right: number;
  short: number;
  long: number;
  hoveredZone: MissZone;
  onHover: (zone: MissZone) => void;
}) {
  // Generate miss dots based on percentages
  const generateMissDots = () => {
    const dots: Array<{ x: number; y: number; zone: MissZone; delay: number }> = [];

    const zones: Array<{ zone: MissZone; pct: number; baseX: number; baseY: number }> = [
      { zone: 'left', pct: left, baseX: 30, baseY: 100 },
      { zone: 'right', pct: right, baseX: 170, baseY: 100 },
      { zone: 'short', pct: short, baseX: 100, baseY: 160 },
      { zone: 'long', pct: long, baseX: 100, baseY: 40 },
    ];

    zones.forEach(({ zone, pct, baseX, baseY }) => {
      const count = Math.min(Math.round(pct / 15), 5);
      for (let i = 0; i < count; i++) {
        const seed = (zone?.charCodeAt(0) || 0) * 1000 + i * 7919;
        const offsetX = ((seed % 30) - 15);
        const offsetY = (((seed * 31) % 30) - 15);
        dots.push({
          x: baseX + offsetX,
          y: baseY + offsetY,
          zone,
          delay: 0.2 + i * 0.04,
        });
      }
    });

    return dots;
  };

  const dots = generateMissDots();

  return (
    <svg viewBox="0 0 200 200" className="w-full max-w-[200px] mx-auto">
      <defs>
        {/* Green surface gradient */}
        <radialGradient id="puttingGreenGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.25" />
          <stop offset="70%" stopColor="#16a34a" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#15803d" stopOpacity="0.1" />
        </radialGradient>
      </defs>

      {/* Green surface */}
      <motion.rect
        x="10" y="10" width="180" height="180" rx="16"
        fill="url(#puttingGreenGrad)"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
      />

      {/* Grid lines */}
      <motion.line
        x1="100" y1="20" x2="100" y2="180"
        stroke="#16a34a" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.3"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      />
      <motion.line
        x1="20" y1="100" x2="180" y2="100"
        stroke="#16a34a" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.3"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      />

      {/* Hole */}
      <motion.g
        className="cursor-pointer"
        onMouseEnter={() => onHover('hole')}
        onMouseLeave={() => onHover(null)}
      >
        <motion.circle
          cx="100" cy="100" r="8"
          fill="#1f2937"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 300 }}
        />
        {/* Hole highlight */}
        <circle cx="98" cy="98" r="2" fill="#374151" opacity="0.5" />
      </motion.g>

      {/* Miss dots */}
      {dots.map((dot, i) => {
        const config = dot.zone ? missConfig[dot.zone as keyof typeof missConfig] : null;
        const isHovered = hoveredZone === dot.zone;
        const isOtherHovered = hoveredZone !== null && hoveredZone !== dot.zone && hoveredZone !== 'hole';

        return (
          <motion.circle
            key={i}
            cx={dot.x}
            cy={dot.y}
            r={4}
            fill={config?.color || '#94a3b8'}
            className="cursor-pointer"
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: isHovered ? 1.3 : 1,
              opacity: isOtherHovered ? 0.3 : 0.75,
            }}
            transition={{
              delay: dot.delay,
              duration: 0.2,
              scale: { duration: 0.15 },
            }}
            style={{
              filter: isHovered ? `drop-shadow(0 0 4px ${config?.color})` : 'none',
            }}
            onMouseEnter={() => onHover(dot.zone)}
            onMouseLeave={() => onHover(null)}
          />
        );
      })}

      {/* Zone labels - only show when hovered or dominant */}
      {(['left', 'right', 'short', 'long'] as const).map((zone) => {
        const config = missConfig[zone];
        const positions = {
          left: { x: 25, y: 100 },
          right: { x: 175, y: 100 },
          short: { x: 100, y: 175 },
          long: { x: 100, y: 25 },
        };
        const pos = positions[zone];
        const isHovered = hoveredZone === zone;

        return (
          <motion.text
            key={zone}
            x={pos.x}
            y={pos.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="9"
            fontWeight={isHovered ? '600' : '500'}
            fill={isHovered ? config.color : '#94a3b8'}
            initial={{ opacity: 0 }}
            animate={{ opacity: isHovered ? 1 : 0.5 }}
            transition={{ duration: 0.15 }}
          >
            {config.label.toUpperCase()}
          </motion.text>
        );
      })}
    </svg>
  );
}

// ============================================================================
// STAT PILL
// ============================================================================

function MissStatPill({
  label,
  percentage,
  icon,
  color,
  isActive,
  onClick,
}: {
  label: string;
  percentage: number;
  icon: string;
  color: string;
  isActive?: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.button
      type="button"
      className={cn(
        'flex items-center justify-between p-3 rounded-xl border transition-all w-full',
        isActive ? 'ring-2 ring-offset-1' : 'bg-slate-50 border-slate-200',
        onClick && 'cursor-pointer hover:shadow-sm',
      )}
      style={{
        backgroundColor: isActive ? `${color}10` : undefined,
        borderColor: isActive ? `${color}40` : undefined,
        // @ts-expect-error CSS custom property
        '--tw-ring-color': color,
      }}
      whileHover={onClick ? { y: -1 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <span style={{ color }} className="text-sm">{icon}</span>
        <span className="text-sm text-slate-600">{label}</span>
      </div>
      <span className="text-lg font-bold tabular-nums" style={{ color }}>
        {percentage.toFixed(0)}%
      </span>
    </motion.button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const PuttingDispersionPremium = memo(function PuttingDispersionPremium({
  puttMissLeftPct,
  puttMissRightPct,
  puttMissShortPct,
  puttMissLongPct,
  puttMissLowPct,
  puttMissHighPct,
  totalPutts,
  onePuttsTotal,
  threePuttsTotal,
  className,
}: PuttingDispersionProps) {
  const [hoveredZone, setHoveredZone] = useState<MissZone>(null);

  const left = puttMissLeftPct ?? 0;
  const right = puttMissRightPct ?? 0;
  const short = puttMissShortPct ?? 0;
  const long = puttMissLongPct ?? 0;
  const low = puttMissLowPct ?? 0;
  const high = puttMissHighPct ?? 0;

  // Find dominant miss
  const misses = [
    { zone: 'left' as const, pct: left },
    { zone: 'right' as const, pct: right },
    { zone: 'short' as const, pct: short },
    { zone: 'long' as const, pct: long },
  ];
  const dominantMiss = misses.reduce((a, b) => a.pct > b.pct ? a : b);
  const hasDominantPattern = dominantMiss.pct >= 35;

  // Read tendency
  const hasReadData = low > 0 || high > 0;
  const readTendency = low > high + 10 ? 'under-read' : high > low + 10 ? 'over-read' : 'balanced';

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
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
              Putting Miss Pattern
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Where missed putts finish
            </p>
          </div>

          {/* Dominant stat */}
          <div className="text-right">
            <motion.div
              className="text-4xl font-bold text-slate-900 tabular-nums tracking-tight"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
            >
              {totalPutts}
            </motion.div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">
              Total Putts
            </div>
          </div>
        </div>
      </div>

      {/* Putting visualization */}
      <div className="px-6 py-6 bg-slate-50/50">
        <PuttingGreenVisualization
          left={left}
          right={right}
          short={short}
          long={long}
          hoveredZone={hoveredZone}
          onHover={setHoveredZone}
        />

        {/* Hover tooltip */}
        <AnimatePresence>
          {hoveredZone && hoveredZone !== 'hole' && (
            <motion.div
              className="mt-3 text-center"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: `${missConfig[hoveredZone].color}15`,
                  color: missConfig[hoveredZone].color,
                }}
              >
                <span>{missConfig[hoveredZone].icon}</span>
                {misses.find(m => m.zone === hoveredZone)?.pct.toFixed(0)}% miss {hoveredZone}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Stats */}
      <div className="px-6 py-5 bg-white border-t border-slate-100">
        {/* Quick stats row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="text-center p-3 rounded-xl bg-green-50 border border-green-200">
            <div className="text-2xl font-bold text-green-700 tabular-nums">{onePuttsTotal}</div>
            <div className="text-xs font-medium text-slate-600">1-Putts</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-2xl font-bold text-slate-700 tabular-nums">{totalPutts - onePuttsTotal - threePuttsTotal}</div>
            <div className="text-xs font-medium text-slate-600">2-Putts</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-red-50 border border-red-200">
            <div className="text-2xl font-bold text-red-600 tabular-nums">{threePuttsTotal}</div>
            <div className="text-xs font-medium text-slate-600">3-Putts</div>
          </div>
        </div>

        {/* Miss direction breakdown */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            Miss Direction
          </div>
          <div className="grid grid-cols-2 gap-2">
            {misses.map(({ zone, pct }) => (
              <MissStatPill
                key={zone}
                label={missConfig[zone].label}
                percentage={pct}
                icon={missConfig[zone].icon}
                color={missConfig[zone].color}
                isActive={hoveredZone === zone}
                onClick={() => setHoveredZone(hoveredZone === zone ? null : zone)}
              />
            ))}
          </div>
        </div>

        {/* Read pattern (if available) */}
        {hasReadData && (
          <motion.div
            className="mt-5 pt-4 border-t border-slate-100"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              Green Reading
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className={cn(
                'p-3 rounded-xl border',
                readTendency === 'under-read' ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'
              )}>
                <div className="text-xs text-slate-500 mb-1">Under-read (Low)</div>
                <div className={cn(
                  'text-xl font-bold tabular-nums',
                  readTendency === 'under-read' ? 'text-amber-600' : 'text-slate-600'
                )}>
                  {low.toFixed(0)}%
                </div>
              </div>
              <div className={cn(
                'p-3 rounded-xl border',
                readTendency === 'over-read' ? 'bg-cyan-50 border-cyan-200' : 'bg-slate-50 border-slate-200'
              )}>
                <div className="text-xs text-slate-500 mb-1">Over-read (High)</div>
                <div className={cn(
                  'text-xl font-bold tabular-nums',
                  readTendency === 'over-read' ? 'text-cyan-600' : 'text-slate-600'
                )}>
                  {high.toFixed(0)}%
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Dominant miss insight */}
        <AnimatePresence>
          {hasDominantPattern && (
            <motion.div
              className="mt-4 p-3 rounded-xl flex items-center gap-3"
              style={{
                backgroundColor: `${missConfig[dominantMiss.zone].color}08`,
                borderWidth: 1,
                borderColor: `${missConfig[dominantMiss.zone].color}20`,
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
                style={{
                  backgroundColor: `${missConfig[dominantMiss.zone].color}15`,
                  color: missConfig[dominantMiss.zone].color,
                }}
              >
                {missConfig[dominantMiss.zone].icon}
              </div>
              <div>
                <div className="text-sm font-medium text-slate-800">
                  Dominant miss: {missConfig[dominantMiss.zone].label}
                </div>
                <div className="text-xs text-slate-500">
                  {dominantMiss.pct.toFixed(0)}% of missed putts
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
});

export default PuttingDispersionPremium;
