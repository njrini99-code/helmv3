'use client';

import { cn } from '@/lib/utils';
import { IconFlame, IconSparkles, IconStar } from '@/components/icons';
import type { CoachEngagement } from '@/app/golf/admin/crm/types/foundations';

// ============================================================================
// EngagementBadge — Hot / Warm / Cold pill
// ============================================================================
// Tones mirror EmailStatusBadge.tsx (warm-/warm-/red-/blue palette). The
// parent surface (CoachTable) passes a pre-fetched engagement map and each
// badge looks up its own row — keeping the data fetch one-shot per page load
// while preserving per-row React.memo benefits.
// ============================================================================

interface EngagementBadgeProps {
  coachId: string;
  engagement?: CoachEngagement;
  size?: 'sm' | 'md';
}

interface BadgeTone {
  label: string;
  bg: string;
  text: string;
  border: string;
  Icon: typeof IconFlame;
  iconClass: string;
}

const TONES: Record<'hot' | 'warm' | 'cold', BadgeTone> = {
  hot: {
    label: 'Hot',
    bg: 'bg-gradient-to-r from-orange-50 to-red-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    Icon: IconFlame,
    iconClass: 'text-orange-500',
  },
  warm: {
    label: 'Warm',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    Icon: IconSparkles,
    iconClass: 'text-amber-500',
  },
  cold: {
    label: 'Cold',
    bg: 'bg-warm-50',
    text: 'text-warm-500',
    border: 'border-warm-200',
    Icon: IconStar,
    iconClass: 'text-warm-400',
  },
};

export function EngagementBadge({
  coachId: _coachId,
  engagement,
  size = 'sm',
}: EngagementBadgeProps) {
  if (!engagement) {
    return (
      <span
        className="text-micro text-warm-300 tabular-nums"
        aria-label="No engagement data"
      >
        &mdash;
      </span>
    );
  }

  const tone = TONES[engagement.temperature];
  if (!tone) return null;

  const lastEventLabel = engagement.last_event_at
    ? ` · last ${formatRelative(engagement.last_event_at)}`
    : '';
  const title =
    `${tone.label} (score ${engagement.score}) — ${engagement.opens_90d} opens, ${engagement.clicks_90d} clicks in last 90d${lastEventLabel}`;

  const iconSize = size === 'md' ? 12 : 10;

  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium',
        size === 'md'
          ? 'text-eyebrow px-2 py-0.5'
          : 'text-eyebrow px-1.5 py-0.5',
        tone.bg,
        tone.text,
        tone.border,
      )}
    >
      <tone.Icon size={iconSize} className={tone.iconClass} />
      {tone.label}
    </span>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function formatRelative(iso: string): string {
  const days = Math.floor(
    (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
