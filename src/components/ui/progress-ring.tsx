import { cn } from '@/lib/utils';

interface ProgressRingProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  color?: 'primary' | 'green' | 'amber' | 'red' | 'blue';
  className?: string;
  label?: string;
}

const sizes = {
  sm: { outer: 48, stroke: 4, text: 'text-xs', gap: 'gap-0.5' },
  md: { outer: 72, stroke: 5, text: 'text-sm', gap: 'gap-1' },
  lg: { outer: 112, stroke: 7, text: 'text-lg', gap: 'gap-1.5' },
};

const colors = {
  primary: 'stroke-primary-600',
  green: 'stroke-primary-600',
  amber: 'stroke-amber-500',
  red: 'stroke-red-500',
  blue: 'stroke-blue-500',
};

const trackColors = {
  primary: 'stroke-primary-100',
  green: 'stroke-primary-100',
  amber: 'stroke-amber-100',
  red: 'stroke-red-100',
  blue: 'stroke-blue-100',
};

export function ProgressRing({
  value,
  max = 100,
  size = 'md',
  showLabel = true,
  color = 'primary',
  className,
  label,
}: ProgressRingProps) {
  const { outer, stroke, text } = sizes[size];
  const radius = (outer - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <svg width={outer} height={outer} className="transform -rotate-90">
        {/* Track */}
        <circle
          cx={outer / 2}
          cy={outer / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className={trackColors[color]}
        />
        {/* Progress */}
        <circle
          cx={outer / 2}
          cy={outer / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn(colors[color], 'transition-all duration-700 ease-out')}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('font-bold text-warm-900 tabular-nums', text)}>
            {Math.round(percentage)}%
          </span>
          {label && size !== 'sm' && (
            <span className="text-[10px] text-warm-500 font-medium">{label}</span>
          )}
        </div>
      )}
    </div>
  );
}
