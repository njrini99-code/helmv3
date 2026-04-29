'use client';

import { StatusPill, type StatusPillTone } from '@/components/ui/status-pill';
import type { RecruitStatus } from '@/app/golf/actions/recruiting';

/**
 * Recruiting funnel status chip. Thin wrapper over the shared StatusPill
 * so the recruiting funnel reuses the same chip-pill grammar as the rest
 * of the dashboard. The keyed array remains the source of truth for the
 * RecruitFormSheet picker (label + description) — only the rendering
 * changed.
 *
 * The legacy *Bg/Text/Ring/dot string fields stay on each entry because
 * the form sheet's filled-pill option buttons reach into them directly
 * for the active-button color recipe. New consumers should prefer the
 * `tone` field and call StatusPill directly.
 */

export const RECRUIT_STATUSES: Array<{
  value: RecruitStatus;
  label: string;
  description: string;
  tone: StatusPillTone;
  /** Form-sheet active-button background. */
  solidBg: string;
  solidText: string;
  /** Form-sheet inactive-button surface. */
  softBg: string;
  softText: string;
  softRing: string;
  /** Used by the form sheet's tiny indicator dots. */
  dot: string;
}> = [
  {
    value: 'watched',
    label: 'Watched',
    description: 'Tracking from a distance',
    tone: 'amber',
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
    tone: 'primary',
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
    tone: 'violet',
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
    tone: 'blue',
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
  const config = BY_VALUE[status] ?? RECRUIT_STATUSES[1]!;
  return (
    <StatusPill
      tone={config.tone}
      variant={variant}
      size={size}
      dot={variant !== 'dot'}
      className={className}
    >
      {config.label}
    </StatusPill>
  );
}
