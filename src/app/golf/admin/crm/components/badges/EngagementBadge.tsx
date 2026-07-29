'use client';

import { StatusPill } from '@/components/fairway';
import type { FwStatusTone } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { IconFlame, IconSparkles, IconStar } from '@/components/icons';
import type { CoachEngagement } from '@/app/golf/admin/crm/types/foundations';

// ============================================================================
// EngagementBadge — Hot / Warm / Cold pill
// ============================================================================
// Tones mirror EmailStatusBadge.tsx — the same escalating Fairway accent ramp,
// because a HOT lead is a positive signal, not a warning: amber/red are
// reserved for the deliverability failure states. Cold sits neutral, Warm on
// the accent wash, Hot on the solid accent fill. The Flame/Sparkles/Star icon
// and the label carry the tier too, so colour is never the only channel.
//
// The parent surface (CoachTable) passes a pre-fetched engagement map and each
// badge looks up its own row — keeping the data fetch one-shot per page load
// while preserving per-row React.memo benefits.
// ============================================================================

interface EngagementBadgeProps {
  coachId: string;
  engagement?: CoachEngagement;
  size?: 'sm' | 'md';
}

interface EngagementTone {
  label: string;
  /** Fairway status tone (drives the base pill colours). */
  tone: FwStatusTone;
  /** Extra classes for the ramp step the base tone alone can't reproduce. */
  override: string;
  Icon: typeof IconFlame;
  iconClass: string;
}

const TONES: Record<'hot' | 'warm' | 'cold', EngagementTone> = {
  hot: {
    label: 'Hot',
    tone: 'accent',
    override: 'bg-accent-650 text-text-on-accent border-accent-700',
    Icon: IconFlame,
    iconClass: 'text-text-on-accent',
  },
  warm: {
    label: 'Warm',
    tone: 'accent',
    override: '',
    Icon: IconSparkles,
    iconClass: 'text-accent-700',
  },
  cold: {
    label: 'Cold',
    tone: 'neutral',
    override: '',
    Icon: IconStar,
    iconClass: 'text-text-tertiary',
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
        className="text-micro text-text-tertiary tabular-nums"
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
    <StatusPill
      tone={tone.tone}
      size="sm"
      dot={false}
      title={title}
      className={cn('gap-1 text-eyebrow', size === 'md' ? 'px-2' : 'px-1.5', tone.override)}
    >
      <tone.Icon size={iconSize} className={tone.iconClass} aria-hidden />
      {tone.label}
    </StatusPill>
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
