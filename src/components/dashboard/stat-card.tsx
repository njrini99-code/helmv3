import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  accent?: boolean;
}

export function StatCard({
  label,
  value,
  change,
  changeLabel,
  icon,
  accent = false,
}: StatCardProps) {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;
  const TrendIcon = isPositive ? TrendingDown : isNegative ? TrendingUp : Minus;
  // Note: For handicap/scores, DOWN is good (green), UP is bad (red)

  return (
    <div
      className={cn(
        // Glass effect
        'relative overflow-hidden',
        'bg-white/70 backdrop-blur-[12px]',
        'border rounded-[16px]',
        'p-5',

        // Shadow with inset highlight
        'shadow-[0_1px_2px_rgba(0,0,0,0.02),0_4px_8px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.6)]',

        // Hover state
        'transition-all duration-300',
        'hover:bg-white/75',
        'hover:-translate-y-0.5',
        'hover:shadow-[0_4px_12px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]',

        // Accent border
        accent
          ? 'border-l-[3px] border-l-primary-600 border-t-white/40 border-r-white/40 border-b-white/40'
          : 'border-white/40'
      )}
    >
      {/* Subtle inner gradient for depth */}
      <div
        className="
        absolute inset-0
        bg-gradient-to-br from-white/30 via-transparent to-transparent
        pointer-events-none
        rounded-[16px]
      "
      />

      {/* Content */}
      <div className="relative">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-warm-500">{label}</span>
          {icon && (
            <div
              className="
              w-9 h-9 rounded-[10px]
              bg-primary-50
              flex items-center justify-center
              text-primary-600
            "
            >
              {icon}
            </div>
          )}
        </div>

        {/* Value */}
        <div className="text-3xl font-bold text-warm-900 tracking-tight">
          {value}
        </div>

        {/* Change indicator */}
        {change !== undefined && (
          <div
            className={cn(
              'flex items-center gap-1.5 mt-2',
              isNegative && 'text-primary-600', // Down = good for handicap
              isPositive && 'text-red-500', // Up = bad for handicap
              !isPositive && !isNegative && 'text-warm-400'
            )}
          >
            <TrendIcon className="w-4 h-4" />
            <span className="text-sm font-medium">{Math.abs(change)}</span>
            {changeLabel && (
              <span className="text-sm text-warm-400">{changeLabel}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
