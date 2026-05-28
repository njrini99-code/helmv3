'use client';

/**
 * Status Badge Component
 *
 * Universal status indicator for calendar events.
 * Supports:
 * - Draft, Confirmed, Cancelled, Completed states
 * - Icon + label combinations
 * - Compact and full modes
 * - Consistent color coding per design tokens
 */

import { cn } from '@/lib/utils';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import {
  CheckCircle,
  XCircle,
  Clock,
  Edit3,
  type LucideIcon,
} from 'lucide-react';

export interface StatusBadgeProps {
  status: 'draft' | 'confirmed' | 'cancelled' | 'completed' | 'pending';
  className?: string;
  compact?: boolean;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

interface StatusConfig {
  icon: LucideIcon;
  label: string;
  /**
   * Badge tone reproducing the original 100-tint look. draft/completed →
   * warm, confirmed → primary, cancelled → rose, pending → amber. The original
   * used `bg-X-100`; the canonical Badge soft surface uses `bg-X-50` — we
   * keep the slightly stronger 100 tint via `bgTintClass` below for fidelity.
   */
  tone: BadgeTone;
  bgTintClass: string;
}

const STATUS_CONFIGS: Record<StatusBadgeProps['status'], StatusConfig> = {
  draft: { icon: Edit3, label: 'Draft', tone: 'warm', bgTintClass: 'bg-warm-100 text-warm-600' },
  confirmed: { icon: CheckCircle, label: 'Confirmed', tone: 'primary', bgTintClass: 'bg-primary-100 text-primary-700' },
  cancelled: { icon: XCircle, label: 'Cancelled', tone: 'rose', bgTintClass: 'bg-rose-100 text-rose-700' },
  completed: { icon: CheckCircle, label: 'Completed', tone: 'warm', bgTintClass: 'bg-warm-100 text-warm-600' },
  pending: { icon: Clock, label: 'Pending', tone: 'amber', bgTintClass: 'bg-amber-100 text-amber-700' },
};

const SIZE_CONFIGS = {
  sm: {
    container: 'px-1.5 py-0.5 text-xs gap-0.5',
    icon: 'w-2.5 h-2.5',
  },
  md: {
    container: 'px-2 py-1 text-xs gap-1',
    icon: 'w-3 h-3',
  },
  lg: {
    container: 'px-2.5 py-1.5 text-sm gap-2',
    icon: 'w-3.5 h-3.5',
  },
};

export function StatusBadge({
  status,
  className,
  compact = false,
  showIcon = true,
  size = 'md',
}: StatusBadgeProps) {
  const config = STATUS_CONFIGS[status];
  const sizeConfig = SIZE_CONFIGS[size];
  const Icon = config.icon;

  // Delegate the colored pill shell to the canonical Badge. We keep the
  // calendar's stronger 100-tint + uppercase/tracking treatment (and the
  // original size paddings/gaps) by layering them via className.
  return (
    <Badge
      tone={config.tone}
      size="none"
      icon={showIcon ? <Icon className={sizeConfig.icon} /> : undefined}
      className={cn(
        'uppercase tracking-wide gap-0',
        sizeConfig.container,
        config.bgTintClass,
        className
      )}
    >
      {!compact && <span>{config.label}</span>}
    </Badge>
  );
}

