'use client';

import { cn } from '@/lib/utils';

interface EngagementScoreProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  tier?: string;
  className?: string;
}

const sizePx = { sm: 32, md: 48, lg: 64 } as const;
const strokeWidths = { sm: 3, md: 4, lg: 5 } as const;
const fontSizes = { sm: 'text-eyebrow', md: 'text-sm', lg: 'text-lg' } as const;
const labelSizes = { sm: 'text-eyebrow', md: 'text-eyebrow', lg: 'text-xs' } as const;

function getScoreColor(score: number): string {
  if (score >= 75) return '#059669'; // emerald-600
  if (score >= 50) return '#16A34A'; // green-600 / primary
  if (score >= 25) return '#F59E0B'; // amber-500
  return '#EF4444'; // red-500
}

export function EngagementScore({
  score,
  size = 'md',
  showLabel = false,
  tier,
  className,
}: EngagementScoreProps) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const px = sizePx[size];
  const sw = strokeWidths[size];
  const radius = (px - sw) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (clampedScore / 100) * circumference;
  const color = getScoreColor(clampedScore);

  return (
    <div className={cn('inline-flex flex-col items-center gap-1', className)}>
      <div className="relative" style={{ width: px, height: px }}>
        <svg width={px} height={px} className="transform -rotate-90">
          {/* Background track */}
          <circle
            cx={px / 2}
            cy={px / 2}
            r={radius}
            fill="none"
            stroke="#F5F5F0"
            strokeWidth={sw}
          />
          {/* Progress arc */}
          <circle
            cx={px / 2}
            cy={px / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeDasharray={`${progress} ${circumference - progress}`}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        {/* Score text */}
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center font-bold tabular-nums text-warm-900',
            fontSizes[size]
          )}
        >
          {Math.round(clampedScore)}
        </span>
      </div>
      {showLabel && tier && (
        <span className={cn('text-warm-500 font-medium', labelSizes[size])}>
          {tier}
        </span>
      )}
    </div>
  );
}
