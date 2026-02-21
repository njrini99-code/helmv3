'use client';

import { useEffect, useState } from 'react';
import { motion, useSpring } from 'framer-motion';
import { cn } from '@/lib/utils';
import { AdminSparkline } from './AdminChart';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatCardV2Props {
  label: string;
  value: number | string;
  suffix?: string;
  icon: React.ReactNode;
  trend?: { value: number; label: string };
  sparklineData?: number[];
  onClick?: () => void;
  isLive?: boolean;
  severity?: 'success' | 'warning' | 'error' | 'neutral';
}

// ---------------------------------------------------------------------------
// Animated Counter
// ---------------------------------------------------------------------------

function AnimatedNumber({ value, duration = 1000 }: { value: number; duration?: number }) {
  const spring = useSpring(0, { duration });
  const [displayValue, setDisplayValue] = useState('0');

  useEffect(() => {
    spring.set(value);
    return spring.on('change', (latest) => {
      setDisplayValue(Math.round(latest).toLocaleString());
    });
  }, [spring, value]);

  return <>{displayValue}</>;
}

// ---------------------------------------------------------------------------
// Severity Config
// ---------------------------------------------------------------------------

const severityConfig = {
  success: {
    border: 'border-l-primary-500',
    sparkline: '#10B981',
    pulse: 'bg-primary-500',
    trend: {
      positive: 'bg-primary-50 text-primary-700',
      negative: 'bg-red-50 text-red-700',
    },
  },
  warning: {
    border: 'border-l-amber-500',
    sparkline: '#F59E0B',
    pulse: 'bg-amber-500',
    trend: {
      positive: 'bg-primary-50 text-primary-700',
      negative: 'bg-red-50 text-red-700',
    },
  },
  error: {
    border: 'border-l-red-500',
    sparkline: '#EF4444',
    pulse: 'bg-red-500',
    trend: {
      positive: 'bg-red-50 text-red-700',
      negative: 'bg-primary-50 text-primary-700',
    },
  },
  neutral: {
    border: 'border-l-warm-400',
    sparkline: '#78716c',
    pulse: 'bg-warm-500',
    trend: {
      positive: 'bg-primary-50 text-primary-700',
      negative: 'bg-red-50 text-red-700',
    },
  },
};

// ---------------------------------------------------------------------------
// StatCardV2 Component
// ---------------------------------------------------------------------------

export function StatCardV2({
  label,
  value,
  suffix,
  icon,
  trend,
  sparklineData,
  onClick,
  isLive,
  severity = 'success',
}: StatCardV2Props) {
  const config = severityConfig[severity];
  const isNumeric = typeof value === 'number';

  return (
    <motion.div
      onClick={onClick}
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={onClick ? { scale: 0.99 } : undefined}
      className={cn(
        'relative glass-standard rounded-2xl p-8',
        'border-l-[4px]',
        config.border,
        'transition-all duration-300',
        'hover:bg-white/80 active:bg-white/90 hover:shadow-card-hover',
        onClick && 'cursor-pointer'
      )}
    >
      {/* Live Indicator */}
      {isLive && (
        <div className="absolute top-4 right-4 flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={cn(
                'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
                config.pulse
              )}
            />
            <span
              className={cn(
                'relative inline-flex rounded-full h-2.5 w-2.5',
                config.pulse
              )}
            />
          </span>
          <span className="text-micro font-medium text-warm-400 uppercase tracking-wider">
            Live
          </span>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1 pr-4">
          <p className="text-sm font-medium text-warm-500 truncate mb-3">{label}</p>
          
          <p className="text-4xl font-bold text-warm-900 tabular-nums tracking-tight">
            {isNumeric ? (
              <AnimatedNumber value={value as number} />
            ) : (
              value
            )}
            {suffix && (
              <span className="text-xl font-normal text-warm-400 ml-1.5">{suffix}</span>
            )}
          </p>

          {/* Trend indicator */}
          {trend && (
            <div className="mt-3 flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full',
                  trend.value > 0
                    ? config.trend.positive
                    : trend.value < 0
                      ? config.trend.negative
                      : 'bg-warm-100 text-warm-500'
                )}
              >
                {trend.value > 0 ? (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                ) : trend.value < 0 ? (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                )}
                {trend.value > 0 ? '+' : ''}{trend.value}%
              </span>
              <span className="text-xs text-warm-400">{trend.label}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-3 shrink-0">
          <div className="p-3 bg-white/60 rounded-xl text-warm-600 shadow-sm">
            {icon}
          </div>
          
          {/* Larger sparkline */}
          {sparklineData && sparklineData.length >= 2 && (
            <AdminSparkline
              data={sparklineData}
              color={config.sparkline}
              width={120}
              height={48}
            />
          )}
        </div>
      </div>

      {/* Click hint */}
      {onClick && (
        <div className="absolute bottom-3 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-micro text-warm-400">Click for details →</span>
        </div>
      )}
    </motion.div>
  );
}

export default StatCardV2;
