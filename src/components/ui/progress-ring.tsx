import { cn } from '@/lib/utils';

interface ProgressRingProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  color?: 'brand' | 'green' | 'amber' | 'red' | 'blue';
  className?: string;
}

const sizes = {
  sm: { outer: 60, stroke: 4, text: 'text-xs' },
  md: { outer: 80, stroke: 6, text: 'text-sm' },
  lg: { outer: 120, stroke: 8, text: 'text-lg' },
};

const colors = {
  brand: 'stroke-brand-600',
  green: 'stroke-green-600',
  amber: 'stroke-amber-600',
  red: 'stroke-red-600',
  blue: 'stroke-blue-600',
};

export function ProgressRing({
  value,
  max = 100,
  size = 'md',
  showLabel = true,
  color = 'brand',
  className,
}: ProgressRingProps) {
  const { outer, stroke, text } = sizes[size];
  const radius = (outer - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const percentage = (value / max) * 100;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={outer} height={outer} className="transform -rotate-90">
        <circle
          cx={outer / 2}
          cy={outer / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className="text-gray-200"
        />
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
          className={cn(colors[color], 'transition-all duration-500')}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn('font-semibold text-gray-900', text)}>
            {Math.round(percentage)}%
          </span>
        </div>
      )}
    </div>
  );
}
