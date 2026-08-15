// ============================================================================
// Timeline UI configuration — color + icon-key + label per source.
// ============================================================================
//
// Source -> visual treatment map. Icon keys are looked up against the
// `@/components/icons` exports inside the rendering component. Colors use
// Tailwind text-utility classes that compose with the existing CRM palette.
//
// Verified icon export names against /Users/ricknini/Downloads/helmv3/src/
// components/icons/index.tsx — all five names exist.
//
// ============================================================================

import type { TimelineSource } from '@/app/golf/admin/crm/types/foundations';

export interface TimelineSourceConfig {
  color: string;       // Tailwind text-* class for the dot/icon
  ringColor: string;   // Tailwind ring-* class for the dot ring (matched palette)
  bgColor: string;     // Tailwind bg-* class for the dot fill
  iconKey: TimelineIconKey;
  label: string;
}

// Constrained to the names that actually exist in our icon registry. Picking
// `IconCheckCircle2` for tasks because there is no `IconCheckSquare` in
// `@/components/icons`. Verified at index.tsx grep.
export type TimelineIconKey =
  | 'IconMessageSquare'
  | 'IconMail'
  | 'IconCalendar'
  | 'IconFileText'
  | 'IconCheckCircle2'
  // Distinct from contact_log's IconMessageSquare on purpose — an inbound reply
  // must not look like our own logged outreach at a glance.
  | 'IconMessage'
  // A demo tour is the coach being *inside the product*, so it gets the screen
  // glyph rather than another message/mail shape.
  | 'IconMonitor';

export const TIMELINE_CONFIG: Record<TimelineSource, TimelineSourceConfig> = {
  contact_log: {
    color: 'text-accent-700',
    ringColor: 'ring-border-subtle',
    bgColor: 'bg-text-tertiary',
    iconKey: 'IconMessageSquare',
    label: 'Contact',
  },
  email_event: {
    color: 'text-accent-700',
    ringColor: 'ring-accent-200',
    bgColor: 'bg-accent-500',
    iconKey: 'IconMail',
    label: 'Email',
  },
  crm_event: {
    color: 'text-accent-700',
    ringColor: 'ring-accent-200',
    bgColor: 'bg-accent-500',
    iconKey: 'IconCalendar',
    label: 'Event',
  },
  note: {
    color: 'text-fw-warning-ink',
    ringColor: 'ring-fw-warning-ring',
    bgColor: 'bg-fw-warning',
    iconKey: 'IconFileText',
    label: 'Note',
  },
  task: {
    color: 'text-accent-700',
    ringColor: 'ring-accent-200',
    bgColor: 'bg-accent-500',
    iconKey: 'IconCheckCircle2',
    label: 'Task',
  },
  // The only INBOUND source on the timeline, so it gets the strongest treatment
  // in the accent ramp — a coach replying is the event a rep most needs to spot
  // while scanning. Stays inside the one accent language (no rainbow).
  reply: {
    color: 'text-fw-success-ink',
    ringColor: 'ring-accent-300',
    bgColor: 'bg-accent-750',
    iconKey: 'IconMessage',
    label: 'Reply',
  },
  // The second inbound source, and the one a rep most needs to spot after a
  // reply — a coach who toured the demo has already self-qualified. Sits one
  // rung deeper than reply in the same accent ramp so the two inbound sources
  // read as a pair against the outbound sources, still no rainbow.
  demo_session: {
    color: 'text-accent-900',
    ringColor: 'ring-accent-400',
    bgColor: 'bg-accent-750',
    iconKey: 'IconMonitor',
    label: 'Demo',
  },
};
