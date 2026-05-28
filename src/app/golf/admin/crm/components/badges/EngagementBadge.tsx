'use client';

import { Badge, type BadgeTone } from '@/components/ui/badge';
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

interface EngagementTone {
  label: string;
  /** Canonical Badge tone (color-faithful base hue). */
  tone: BadgeTone;
  /**
   * Extra classes layered over the Badge soft surface to reproduce looks the
   * tone alone can't: the Hot gradient, and the muted text shades.
   */
  override: string;
  Icon: typeof IconFlame;
  iconClass: string;
}

const TONES: Record<'hot' | 'warm' | 'cold', EngagementTone> = {
  hot: {
    label: 'Hot',
    // Hot keeps its orange→red gradient surface (no single tone reproduces it).
    tone: 'orange',
    override: 'bg-gradient-to-r from-orange-50 to-red-50 text-orange-700 border-orange-200',
    Icon: IconFlame,
    iconClass: 'text-orange-500',
  },
  warm: {
    label: 'Warm',
    tone: 'amber',
    override: '',
    Icon: IconSparkles,
    iconClass: 'text-amber-500',
  },
  cold: {
    label: 'Cold',
    tone: 'warm',
    // Cold uses the muted warm-500 text (Badge warm-soft is warm-700).
    override: 'text-warm-500',
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
    <Badge
      tone={tone.tone}
      size="none"
      title={title}
      icon={<tone.Icon size={iconSize} className={tone.iconClass} />}
      // Plain string (not the shared cn): Badge's own custom-fontSize-aware
      // merge dedups these, keeping BOTH `text-eyebrow` and the tone/override
      // text color. Pre-merging here with the default cn would drop the size.
      className={`gap-1 ${
        size === 'md' ? 'text-eyebrow px-2 py-0.5' : 'text-eyebrow px-1.5 py-0.5'
      } ${tone.override}`}
    >
      {tone.label}
    </Badge>
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
