'use client';

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
// Tones match the warm-/slate- palette used across the CRM (see STATUS_CONFIG
// in crm-config.tsx for reference tones: amber, red, emerald/green, blue,
// warm/neutral).
interface BadgeTone {
  label: string;
  bg: string;
  text: string;
  border: string;
}

const TONE_BOUNCED: BadgeTone = {
  label: 'Bounced',
  bg: 'bg-red-50',
  text: 'text-red-700',
  border: 'border-red-200',
};

const TONE_COMPLAINED: BadgeTone = {
  label: 'Complained',
  bg: 'bg-red-50',
  text: 'text-red-700',
  border: 'border-red-200',
};

const EVENT_TONES: Record<LastEmailEventType, BadgeTone> = {
  clicked: {
    label: 'Clicked',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
  },
  opened: {
    label: 'Opened',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  delivered: {
    label: 'Delivered',
    bg: 'bg-warm-50',
    text: 'text-warm-700',
    border: 'border-warm-200',
  },
  delivery_delayed: {
    label: 'Delayed',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  sent: {
    label: 'Sent',
    bg: 'bg-warm-50',
    text: 'text-warm-600',
    border: 'border-warm-200',
  },
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

  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        compact ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-1.5 py-0.5',
        tone.bg,
        tone.text,
        tone.border,
      )}
    >
      {tone.label}
    </span>
  );
}

// ============================================================================
// HELPERS
// ============================================================================
function resolveTone(
  emailStatus: string | null | undefined,
  lastEventType: string | null | undefined,
): BadgeTone | null {
  if (emailStatus === 'bounced') return TONE_BOUNCED;
  if (emailStatus === 'complained') return TONE_COMPLAINED;

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
