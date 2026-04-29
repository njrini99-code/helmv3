'use client';

import { cn } from '@/lib/utils';
import type { RecruitStatus } from '@/app/golf/actions/recruiting';

export const RECRUIT_STATUSES: Array<{
  value: RecruitStatus;
  label: string;
  description: string;
  /** Primary swatch — solid pill background. */
  solidBg: string;
  solidText: string;
  /** Soft swatch — used for the default un-selected card chip. */
  softBg: string;
  softText: string;
  softRing: string;
  /** Dot color for tiny variants. */
  dot: string;
}> = [
  {
    value: 'watched',
    label: 'Watched',
    description: 'Tracking from a distance',
    solidBg: 'bg-amber-500',
    solidText: 'text-white',
    softBg: 'bg-amber-50',
    softText: 'text-amber-700',
    softRing: 'ring-amber-200',
    dot: 'bg-amber-500',
  },
  {
    value: 'recruiting',
    label: 'Recruiting',
    description: 'Actively engaged',
    solidBg: 'bg-primary-600',
    solidText: 'text-white',
    softBg: 'bg-primary-50',
    softText: 'text-primary-700',
    softRing: 'ring-primary-200',
    dot: 'bg-primary-500',
  },
  {
    value: 'offered',
    label: 'Offered',
    description: 'Offer extended',
    solidBg: 'bg-violet-600',
    solidText: 'text-white',
    softBg: 'bg-violet-50',
    softText: 'text-violet-700',
    softRing: 'ring-violet-200',
    dot: 'bg-violet-500',
  },
  {
    value: 'committed',
    label: 'Committed',
    description: 'Locked in',
    solidBg: 'bg-blue-600',
    solidText: 'text-white',
    softBg: 'bg-blue-50',
    softText: 'text-blue-700',
    softRing: 'ring-blue-200',
    dot: 'bg-blue-500',
  },
];

const BY_VALUE = Object.fromEntries(RECRUIT_STATUSES.map((s) => [s.value, s]));

interface RecruitStatusChipProps {
  status: RecruitStatus;
  variant?: 'soft' | 'solid' | 'dot';
  size?: 'sm' | 'md';
  className?: string;
}

export function RecruitStatusChip({
  status,
  variant = 'soft',
  size = 'sm',
  className,
}: RecruitStatusChipProps) {
  const config = BY_VALUE[status] ?? RECRUIT_STATUSES[1]!; // fall back to recruiting
  const sizing = size === 'md'
    ? 'px-2.5 py-1 text-xs'
    : 'px-2 py-0.5 text-[11px]';

  if (variant === 'dot') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium text-warm-700', className)}>
        <span className={cn('w-2 h-2 rounded-full', config.dot)} aria-hidden="true" />
        {config.label}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold tracking-wide',
        sizing,
        variant === 'solid'
          ? cn(config.solidBg, config.solidText, 'shadow-sm')
          : cn(config.softBg, config.softText, 'ring-1 ring-inset', config.softRing),
        className,
      )}
    >
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          variant === 'solid' ? 'bg-white/80' : config.dot,
        )}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}
