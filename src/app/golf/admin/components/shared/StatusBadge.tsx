'use client';

import { Badge, type BadgeTone } from '@/components/ui/badge';

type StatusType = 'healthy' | 'warning' | 'critical' | 'info' | 'neutral';

interface StatusBadgeProps {
  status: StatusType;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

// status → canonical Badge tone (color-faithful). `neutral` kept the slightly
// stronger warm-100 tint, layered back via className below.
const STATUS_TONE: Record<StatusType, BadgeTone> = {
  healthy: 'primary',
  warning: 'amber',
  critical: 'red',
  info: 'blue',
  neutral: 'warm',
};

const sizeClasses = {
  sm: 'text-eyebrow px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
};

export function StatusBadge({
  status,
  label,
  size = 'md',
  className,
}: StatusBadgeProps) {
  return (
    <Badge
      tone={STATUS_TONE[status]}
      size="none"
      showDot
      // Plain string (not the shared cn): Badge's custom-fontSize-aware merge
      // keeps BOTH the `text-eyebrow` size and the tone/neutral text color.
      // Pre-merging the neutral text-warm-600 with text-eyebrow via the default
      // cn would drop the size.
      className={`whitespace-nowrap ${sizeClasses[size]} ${
        // Preserve the neutral status' warm-100 tint (Badge soft uses warm-50).
        status === 'neutral' ? 'bg-warm-100 text-warm-600' : ''
      } ${className ?? ''}`}
    >
      {label}
    </Badge>
  );
}
