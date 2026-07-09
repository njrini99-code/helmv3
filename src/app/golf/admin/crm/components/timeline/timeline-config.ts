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
  | 'IconCheckCircle2';

export const TIMELINE_CONFIG: Record<TimelineSource, TimelineSourceConfig> = {
  contact_log: {
    color: 'text-blue-600',
    ringColor: 'ring-blue-200',
    bgColor: 'bg-blue-500',
    iconKey: 'IconMessageSquare',
    label: 'Contact',
  },
  email_event: {
    color: 'text-purple-600',
    ringColor: 'ring-purple-200',
    bgColor: 'bg-purple-500',
    iconKey: 'IconMail',
    label: 'Email',
  },
  crm_event: {
    color: 'text-primary-600',
    ringColor: 'ring-primary-200',
    bgColor: 'bg-primary-500',
    iconKey: 'IconCalendar',
    label: 'Event',
  },
  note: {
    color: 'text-amber-600',
    ringColor: 'ring-amber-200',
    bgColor: 'bg-amber-500',
    iconKey: 'IconFileText',
    label: 'Note',
  },
  task: {
    color: 'text-indigo-600',
    ringColor: 'ring-indigo-200',
    bgColor: 'bg-indigo-500',
    iconKey: 'IconCheckCircle2',
    label: 'Task',
  },
};
