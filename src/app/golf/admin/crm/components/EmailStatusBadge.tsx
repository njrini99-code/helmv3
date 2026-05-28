'use client';

import { Badge, type BadgeTone } from '@/components/ui/badge';

// ============================================================================
// TYPES
// ============================================================================
// These two fields are added by Stream 1's migration on the crm_coaches table.
// The hand-written `Coach` type in crm-config.tsx may not yet include them, so
// this helper accepts optional primitives rather than the full Coach object.
// Consumers can extend their Coach type with `EmailStatusFields` as an
// additive intersection to stay fully type-safe.
export interface EmailStatusFields {
  email_status?: string | null;
  last_email_event_type?: string | null;
  last_email_event_at?: string | null;
}

export type LastEmailEventType =
  | 'sent'
  | 'delivered'
  | 'delivery_delayed'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained';

interface EmailStatusBadgeProps extends EmailStatusFields {
  compact?: boolean;
}

// ============================================================================
// STATUS -> LABEL/COLOR MAP
// ============================================================================
// Tones match the warm-/warm- palette used across the CRM (see STATUS_CONFIG
// in crm-config.tsx for reference tones: amber, red, emerald/green, blue,
// warm/neutral).
interface EmailTone {
  label: string;
  /** Canonical Badge tone (color-faithful base hue). */
  tone: BadgeTone;
  /** Extra classes for tints the tone alone doesn't reproduce. */
  override?: string;
}

const TONE_BOUNCED: EmailTone = {
  label: 'Bounced',
  tone: 'red',
};

const TONE_COMPLAINED: EmailTone = {
  label: 'Complained',
  tone: 'red',
};

const TONE_UNSUBSCRIBED: EmailTone = {
  label: 'Unsubscribed',
  tone: 'warm',
  // Stronger warm-100 tint + warm-600 text (Badge warm-soft is warm-50/700).
  override: 'bg-warm-100 text-warm-600',
};

// Inline ban / no-symbol glyph — the icon set ships no equivalent, and this
// badge is the only consumer for now.
function IconBan({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m4.93 4.93 14.14 14.14" />
    </svg>
  );
}

const EVENT_TONES: Record<LastEmailEventType, EmailTone> = {
  clicked: { label: 'Clicked', tone: 'emerald' },
  opened: { label: 'Opened', tone: 'blue' },
  delivered: { label: 'Delivered', tone: 'warm' }, // warm-soft text-700 matches
  delivery_delayed: { label: 'Delayed', tone: 'amber' },
  sent: { label: 'Sent', tone: 'warm', override: 'text-warm-600' },
  // Bounced/complained as last event fall back to their dedicated tones via
  // the priority rule below, but include them here for completeness.
  bounced: TONE_BOUNCED,
  complained: TONE_COMPLAINED,
};

// ============================================================================
// COMPONENT
// ============================================================================
/**
 * Compact pill badge that summarizes a coach's email deliverability + last
 * tracked event. Priority:
 *   1. email_status === 'bounced'    -> red "Bounced"
 *   2. email_status === 'complained' -> red "Complained"
 *   3. last_email_event_type         -> colored by event (see map above)
 *   4. null / unknown                -> muted em-dash placeholder
 */
export function EmailStatusBadge({
  email_status,
  last_email_event_type,
  last_email_event_at,
  compact = false,
}: EmailStatusBadgeProps) {
  const tone = resolveTone(email_status, last_email_event_type);

  const title = last_email_event_at
    ? `${tone?.label ?? 'No email activity'} · ${last_email_event_at}`
    : tone?.label ?? 'No email activity';

  if (!tone) {
    return (
      <span
        title={title}
        className="text-micro text-warm-300 tabular-nums"
        aria-label="No email activity"
      >
        &mdash;
      </span>
    );
  }

  const isUnsubscribed = email_status === 'unsubscribed';

  return (
    <Badge
      tone={tone.tone}
      size="none"
      title={title}
      icon={isUnsubscribed ? <IconBan size={compact ? 10 : 11} /> : undefined}
      // Plain string (not the shared cn): Badge's custom-fontSize-aware merge
      // keeps BOTH `text-eyebrow` and the tone/override text color. Pre-merging
      // here with the default cn would drop the size.
      className={`gap-1 text-eyebrow px-1.5 py-0.5 ${tone.override ?? ''}`}
    >
      {tone.label}
    </Badge>
  );
}

// ============================================================================
// HELPERS
// ============================================================================
function resolveTone(
  emailStatus: string | null | undefined,
  lastEventType: string | null | undefined,
): EmailTone | null {
  if (emailStatus === 'bounced') return TONE_BOUNCED;
  if (emailStatus === 'complained') return TONE_COMPLAINED;
  if (emailStatus === 'unsubscribed') return TONE_UNSUBSCRIBED;

  if (lastEventType && isKnownEventType(lastEventType)) {
    return EVENT_TONES[lastEventType];
  }

  return null;
}

function isKnownEventType(value: string): value is LastEmailEventType {
  return (
    value === 'sent' ||
    value === 'delivered' ||
    value === 'delivery_delayed' ||
    value === 'opened' ||
    value === 'clicked' ||
    value === 'bounced' ||
    value === 'complained'
  );
}
