'use client';

import { memo, ReactNode } from 'react';
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { AdminSparkline } from './AdminChart';

interface AdminStatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  suffix?: string;
  detail?: string;
  accentColor?: 'green' | 'red' | 'amber' | 'blue' | 'violet';
  trend?: { value: number; label: string };
  sparklineData?: number[];
  sparklineColor?: string;
}

const accentBorders: Record<string, string> = {
  green: 'border-l-primary-600',
  red: 'border-l-red-500',
  amber: 'border-l-amber-500',
  blue: 'border-l-blue-500',
  violet: 'border-l-violet-500',
};

const iconBgColors: Record<string, string> = {
  green: 'bg-primary-50',
  red: 'bg-red-50',
  amber: 'bg-amber-50',
  blue: 'bg-blue-50',
  violet: 'bg-violet-50',
};

const iconTextColors: Record<string, string> = {
  green: 'text-primary-600',
  red: 'text-red-600',
  amber: 'text-amber-600',
  blue: 'text-blue-600',
  violet: 'text-violet-600',
};

const sparklineColors: Record<string, string> = {
  green: '#16A34A',
  red: '#EF4444',
  amber: '#F59E0B',
  blue: '#2563EB',
  violet: '#8B5CF6',
};

export const AdminStatCard = memo(function AdminStatCard({
  label,
  value,
  icon,
  suffix,
  detail,
  accentColor = 'green',
  trend,
  sparklineData,
  sparklineColor,
}: AdminStatCardProps) {
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value));
  const isNumeric = !isNaN(numericValue);
  const hasSparkline = sparklineData && sparklineData.length >= 2;
  const hasNoData = value === null || value === undefined;

  return (
    <m.div
      className={cn(
        'relative overflow-hidden group',
        // Premium glass effect
        'bg-white/65 backdrop-blur-[16px]',
        'border rounded-2xl',
        // Premium shadow
        'shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]',
        'hover:shadow-[0_8px_24px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.8)]',
        'transition-shadow duration-200',
        // Bigger padding
        'p-4 sm:p-5 md:p-6',
        // Accent border
        'border-l-[3px] border-t-white/30 border-r-white/30 border-b-white/30',
        accentBorders[accentColor]
      )}
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Subtle inner gradient for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent pointer-events-none rounded-2xl" />

      {/* Hover glow effect */}
      <div className="absolute -inset-1 bg-primary-500/0 group-hover:bg-primary-500/5 rounded-2xl transition-colors duration-300 pointer-events-none" />

      <div className="relative flex items-start justify-between gap-2 sm:gap-3">
        <div className="flex-1 min-w-0">
          {/* Label with premium styling */}
          <p className="text-label md:text-xs font-medium text-warm-400 uppercase tracking-wider mb-2">
            {label}
          </p>

          {/* Value with AnimatedNumber */}
          <div className="flex items-baseline gap-1 sm:gap-2 flex-wrap" aria-live="polite">
            <p className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-warm-900 tabular-nums">
              {isNumeric ? (
                <>
                  <AnimatedNumber
                    value={numericValue}
                    decimals={String(value).includes('.') ? 1 : 0}
                    suffix=""
                  />
                  {suffix && <span className="text-sm md:text-base font-semibold text-warm-400 ml-1">{suffix}</span>}
                </>
              ) : hasNoData ? (
                <span className="text-warm-400">&mdash;</span>
              ) : (
                <>
                  {value}
                  {suffix && <span className="text-sm md:text-base font-semibold text-warm-400 ml-1">{suffix}</span>}
                </>
              )}
            </p>
          </div>

          {/* Trend badge + Detail */}
          <div className="flex items-center flex-wrap gap-2 mt-2">
            {trend && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-micro font-semibold px-1.5 py-0.5 rounded-full',
                  trend.value > 0
                    ? 'bg-primary-50 text-primary-700'
                    : trend.value < 0
                      ? 'bg-red-50 text-red-700'
                      : 'bg-warm-100 text-warm-500'
                )}
              >
                {trend.value > 0 ? '↑' : trend.value < 0 ? '↓' : '→'}
                {trend.value > 0 ? '+' : ''}{trend.value}%
                {trend.label && <span className="ml-0.5 font-medium opacity-75">{trend.label}</span>}
              </span>
            )}
            {detail && (
              <p className="text-eyebrow sm:text-xs text-warm-400 leading-snug break-words">{detail}</p>
            )}
          </div>
        </div>

        {/* Right side: icon or sparkline */}
        <div className="flex flex-col items-end gap-3 flex-shrink-0">
          {/* Icon container - premium styling */}
          <div
            className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]',
              'group-hover:scale-105 transition-transform duration-200',
              iconBgColors[accentColor],
              iconTextColors[accentColor]
            )}
          >
            {icon}
          </div>

          {/* Sparkline with larger size */}
          {hasSparkline && (
            <AdminSparkline
              data={sparklineData}
              color={sparklineColor ?? sparklineColors[accentColor] ?? '#16A34A'}
              width={100}
              height={40}
              showEndDot
            />
          )}
        </div>
      </div>
    </m.div>
  );
});
