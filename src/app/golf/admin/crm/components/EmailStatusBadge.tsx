'use client';

import { StatusPill } from '@/components/fairway';
import type { FwStatusTone } from '@/components/fairway';
import { cn } from '@/lib/utils';

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
// Renders the Fairway StatusPill, not the pre-Fairway `@/components/ui/badge`:
// that shared Badge resolves its `blue`/`amber`/`emerald` tones to raw Tailwind
// hues, which are fixed-light and were the last palette leak inside the CRM
// shell. The escalating accent ramp below matches resend/shared.tsx's
// STATUS_CONFIG so the two email surfaces read as one vocabulary:
//   sent (neutral) → delivered (accent-50) → opened (accent-100) → clicked
//   (the solid accent fill — the strongest buying signal).
interface EmailTone {
  label: string;
  /** Fairway status tone (drives the base pill + dot colours). */
  tone: FwStatusTone;
  /** Extra classes for the ramp steps the base tone alone can't reproduce. */
  override?: string;
}

const TONE_BOUNCED: EmailTone = {
  label: 'Bounced',
  tone: 'danger',
};

const TONE_COMPLAINED: EmailTone = {
  label: 'Complained',
  tone: 'danger',
};

const TONE_UNSUBSCRIBED: EmailTone = {
  label: 'Unsubscribed',
  tone: 'neutral',
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
  clicked: {
    label: 'Clicked',
    tone: 'accent',
    override: 'bg-accent-650 text-text-on-accent border-accent-700',
  },
  opened: { label: 'Opened', tone: 'accent', override: 'bg-accent-100 text-fw-success-ink border-accent-300' },
  delivered: { label: 'Delivered', tone: 'accent' },
  delivery_delayed: { label: 'Delayed', tone: 'warning' },
  sent: { label: 'Sent', tone: 'neutral' },
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
        className="text-micro text-text-tertiary tabular-nums"
        aria-label="No email activity"
      >
        &mdash;
      </span>
    );
  }

  const isUnsubscribed = email_status === 'unsubscribed';

  return (
    <StatusPill
      tone={tone.tone}
      size="sm"
      dot={!isUnsubscribed}
      title={title}
      className={cn('gap-1 px-1.5 text-eyebrow', tone.override)}
    >
      {isUnsubscribed ? <IconBan size={compact ? 10 : 11} /> : null}
      {tone.label}
    </StatusPill>
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
