'use client';

import { cn } from '@/lib/utils';
import { AdminSparkline } from './AdminChart';

interface AdminStatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  suffix?: string;
  detail?: string;
  accentColor?: 'green' | 'red' | 'amber' | 'blue';
  trend?: { value: number; label: string };
  sparklineData?: number[];
  sparklineColor?: string;
}

const accents = {
  green: 'border-l-primary-600',
  red: 'border-l-red-500',
  amber: 'border-l-amber-500',
  blue: 'border-l-blue-500',
};

const sparklineColors: Record<string, string> = {
  green: '#16A34A',
  red: '#EF4444',
  amber: '#F59E0B',
  blue: '#2563EB',
};

export function AdminStatCard({
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
  return (
    <div
      className={cn(
        'relative bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6',
        'border-l-[3px]',
        accents[accentColor],
        'transition-all duration-200 hover:bg-white/80 hover:shadow-card-hover hover:-translate-y-0.5'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-warm-500 truncate">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-warm-900 tabular-nums tracking-tight">
            {typeof value === 'number' ? value.toLocaleString() : value}
            {suffix && (
              <span className="text-lg font-normal text-warm-400 ml-1">{suffix}</span>
            )}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {trend && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full',
                  trend.value > 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : trend.value < 0
                      ? 'bg-red-50 text-red-700'
                      : 'bg-warm-100 text-warm-500'
                )}
              >
                {trend.value > 0 ? '\u2191' : trend.value < 0 ? '\u2193' : '\u2192'}
                {trend.value > 0 ? '+' : ''}{trend.value}% {trend.label}
              </span>
            )}
            {detail && <p className="text-xs text-warm-400">{detail}</p>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="p-2.5 bg-white/50 rounded-lg text-warm-500">
            {icon}
          </div>
          {sparklineData && sparklineData.length >= 2 && (
            <AdminSparkline
              data={sparklineData}
              color={sparklineColor ?? sparklineColors[accentColor] ?? '#16A34A'}
              width={64}
              height={20}
            />
          )}
        </div>
      </div>
    </div>
  );
}
