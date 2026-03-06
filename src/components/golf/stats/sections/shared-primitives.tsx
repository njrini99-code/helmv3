'use client';

import { useState, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconChevronDown } from '@/components/icons';
import { useAnimatedNumber } from '@/hooks/useAnimatedNumber';

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

export const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

export const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 300,
      damping: 24,
    },
  },
};

export const sectionVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 200,
      damping: 20,
    },
  },
};

export const tabContentVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

// ============================================================================
// FORMAT TOGGLE — 9H / 18H / All segmented control
// ============================================================================

export type HoleFormat = 'all' | '18' | '9';

export function FormatToggle({
  value,
  onChange,
  counts,
}: {
  value: HoleFormat;
  onChange: (format: HoleFormat) => void;
  counts: { all: number; h18: number; h9: number };
}) {
  const options: { id: HoleFormat; label: string; count: number }[] = [
    { id: 'all', label: 'All Rounds', count: counts.all },
    { id: '18', label: '18 Holes', count: counts.h18 },
    { id: '9', label: '9 Holes', count: counts.h9 },
  ];

  // Only show toggle if both formats exist
  if (counts.h18 === 0 || counts.h9 === 0) return null;

  return (
    <motion.div
      className="flex items-center gap-1 p-1 rounded-xl bg-warm-100/60 backdrop-blur-sm border border-warm-200/40"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 25 }}
    >
      {options.map((opt) => {
        const isActive = value === opt.id;
        return (
          <motion.button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              isActive
                ? 'text-primary-700'
                : 'text-warm-500 hover:text-warm-700'
            }`}
            whileTap={{ scale: 0.97 }}
          >
            {isActive && (
              <motion.div
                className="absolute inset-0 rounded-lg bg-white shadow-sm border border-warm-200/60"
                layoutId="format-toggle-bg"
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              />
            )}
            <span className="relative z-10">{opt.label}</span>
            <span className={`relative z-10 tabular-nums px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
              isActive
                ? 'bg-primary-100 text-primary-600'
                : 'bg-warm-200/60 text-warm-400'
            }`}>
              {opt.count}
            </span>
          </motion.button>
        );
      })}
    </motion.div>
  );
}

// ============================================================================
// SPARKLINE COMPONENT
// ============================================================================

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showDots?: boolean;
  lowerIsBetter?: boolean;
}

export function Sparkline({
  data,
  width = 80,
  height = 24,
  showDots = false,
  lowerIsBetter = false,
}: SparklineProps) {
  const instanceId = useId();
  if (!data || data.length < 2) return null;

  const padding = 2;
  const actualWidth = width - padding * 2;
  const actualHeight = height - padding * 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // Calculate points
  const points = data.map((value, index) => {
    const x = padding + (index / (data.length - 1)) * actualWidth;
    const y = padding + actualHeight - ((value - min) / range) * actualHeight;
    return { x, y, value };
  });

  // Create path
  const pathD = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  // Determine trend color
  const first = data[0];
  const last = data[data.length - 1];

  // Safety check (should never happen after length check above, but TypeScript needs this)
  if (first === undefined || last === undefined) return null;

  const isImproving = lowerIsBetter ? last < first : last > first;
  const trendColor = isImproving ? '#16A34A' : last === first ? '#94A3B8' : '#DC2626';

  // Get first and last points (guaranteed to exist since data.length >= 2)
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  if (!firstPoint || !lastPoint) return null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      {/* Gradient fill */}
      <defs>
        <linearGradient id={`sparkGradient-${instanceId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={trendColor} stopOpacity={0.3} />
          <stop offset="100%" stopColor={trendColor} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path
        d={`${pathD} L ${lastPoint.x} ${height} L ${firstPoint.x} ${height} Z`}
        fill={`url(#sparkGradient-${instanceId})`}
      />

      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke={trendColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dots */}
      {showDots && (
        <>
          <circle
            cx={firstPoint.x}
            cy={firstPoint.y}
            r={2}
            fill="white"
            stroke={trendColor}
            strokeWidth={1}
          />
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r={2.5}
            fill={trendColor}
            stroke="white"
            strokeWidth={1}
          />
        </>
      )}
    </svg>
  );
}

// ============================================================================
// STAT CARD COMPONENT
// ============================================================================

export function StatCard({
  label,
  value,
  subValue,
  highlight = false,
  large = false,
  numericValue,
  decimals = 1,
  animate = true,
  index = 0,
  trend,
  comparisonValue,
  comparisonLabel,
  sparklineData,
  sparklineLowerIsBetter,
}: {
  label: string;
  value: string;
  subValue?: string;
  highlight?: boolean;
  large?: boolean;
  numericValue?: number | null;
  decimals?: number;
  animate?: boolean;
  index?: number;
  trend?: 'improving' | 'declining' | 'stable';
  comparisonValue?: number | null;
  comparisonLabel?: string;
  sparklineData?: number[];
  sparklineLowerIsBetter?: boolean;
}) {
  const animatedValue = useAnimatedNumber(
    animate && numericValue !== undefined ? numericValue : null,
    800
  );
  const displayValue = animate && numericValue !== undefined
    ? animatedValue.toFixed(decimals)
    : value;

  // Get trend indicator styling
  const getTrendStyles = () => {
    if (!trend) return null;
    switch (trend) {
      case 'improving':
        return { icon: '↑', color: 'text-primary-500', bg: 'bg-primary-50' };
      case 'declining':
        return { icon: '↓', color: 'text-red-500', bg: 'bg-red-50' };
      case 'stable':
        return { icon: '→', color: 'text-warm-500', bg: 'bg-warm-50' };
    }
  };
  const trendStyles = getTrendStyles();

  return (
    <motion.div
      variants={itemVariants}
      className={`relative glass-standard rounded-xl overflow-hidden p-4 group cursor-default`}
      whileHover={{
        scale: 1.02,
        y: -4,
        transition: { type: 'spring', stiffness: 400, damping: 20 }
      }}
      style={{ willChange: 'transform' }}
    >
      {/* Animated shine effect on hover */}
      <motion.div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        initial={{ opacity: 0.5 }}
        whileHover={{ opacity: 1 }}
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)',
        }}
      />

      {/* Subtle glow effect on hover for highlighted cards */}
      {highlight && (
        <motion.div
          className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(22, 163, 74, 0.1) 0%, transparent 70%)',
          }}
        />
      )}

      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-warm-500 uppercase tracking-wide">
          {label}
        </span>
        {trendStyles && (
          <motion.span
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${trendStyles.bg} ${trendStyles.color}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            {trendStyles.icon}
          </motion.span>
        )}
      </div>
      <motion.div
        className={`font-bold ${large ? 'text-3xl' : 'text-2xl'} ${highlight ? 'text-primary-600' : 'text-warm-900'} tabular-nums`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: index * 0.05 }}
      >
        {displayValue}
      </motion.div>
      {subValue && (
        <motion.div
          className="text-xs text-warm-400 mt-0.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 + index * 0.05 }}
        >
          {subValue}
        </motion.div>
      )}
      {comparisonValue !== undefined && comparisonValue !== null && (
        <motion.div
          className="flex items-center gap-1 mt-1.5 text-xs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <span className="text-warm-400">{comparisonLabel || 'vs team'}:</span>
          <span className={comparisonValue > 0 ? 'text-red-500' : comparisonValue < 0 ? 'text-primary-500' : 'text-warm-500'}>
            {comparisonValue > 0 ? '+' : ''}{comparisonValue.toFixed(1)}
          </span>
        </motion.div>
      )}
      {/* Sparkline */}
      {sparklineData && sparklineData.length >= 3 && (
        <motion.div
          className="mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <Sparkline
            data={sparklineData}
            width={70}
            height={20}
            showDots
            lowerIsBetter={sparklineLowerIsBetter}
          />
        </motion.div>
      )}
    </motion.div>
  );
}

// ============================================================================
// STAT ROW COMPONENT
// ============================================================================

export function StatRow({ label, value, index = 0 }: { label: string; value: string; index?: number }) {
  return (
    <motion.div
      className="flex justify-between items-center py-2.5 border-b border-warm-100/80 last:border-0 group hover:bg-warm-50/50 transition-colors rounded px-1 -mx-1"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, type: 'spring', stiffness: 300, damping: 25 }}
    >
      <span className="text-sm text-warm-600 group-hover:text-warm-800 transition-colors">{label}</span>
      <span className="text-sm font-semibold text-warm-900 tabular-nums">{value}</span>
    </motion.div>
  );
}

// ============================================================================
// STAT SECTION COMPONENT
// ============================================================================

export function StatSection({
  title,
  children,
  delay = 0,
  collapsible = false,
}: {
  title: string;
  children: React.ReactNode;
  delay?: number;
  collapsible?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <motion.div
      className="relative glass-standard rounded-2xl overflow-hidden mb-4 group"
      variants={sectionVariants}
      initial="hidden"
      animate="visible"
      transition={{ delay }}
      whileHover={{ boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
    >
      {/* Animated shine effect */}
      <motion.div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        initial={{ opacity: 0.5, scaleX: 0.8 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ delay: delay + 0.1, duration: 0.5 }}
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)',
        }}
      />

      <div
        className={`p-4 ${collapsible ? 'cursor-pointer' : ''}`}
        onClick={() => collapsible && setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-warm-700 uppercase tracking-wide">
            {title}
          </h3>
          {collapsible && (
            <motion.div
              animate={{ rotate: isOpen ? 0 : -90 }}
              transition={{ duration: 0.2 }}
            >
              <IconChevronDown size={16} className="text-warm-400" />
            </motion.div>
          )}
        </div>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
              className="mt-3"
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
