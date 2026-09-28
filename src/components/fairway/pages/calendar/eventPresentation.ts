/**
 * Calendar · event presentation metadata
 * ----------------------------------------------------------------------------
 * The ONE place an event_type (and a player's RSVP) maps to a label, a status
 * tone and a line icon. Shared by the agenda row and the month grid so the
 * two never disagree about what a "qualifier" looks like. Presentation only —
 * no fetching, no dates.
 */
import {
  BookOpen,
  CalendarDays,
  Dumbbell,
  Flag,
  Plane,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import type { FwStatusTone } from '@/components/fairway';
import type { RSVPStatus } from '@/hooks/useRSVP';

export interface EventTypeMeta {
  label: string;
  tone: FwStatusTone;
}

const TYPE_META: Record<string, EventTypeMeta> = {
  practice: { label: 'Practice', tone: 'accent' },
  tournament: { label: 'Tournament', tone: 'warning' },
  qualifier: { label: 'Qualifier', tone: 'success' },
  qualifying: { label: 'Qualifier', tone: 'success' },
  travel: { label: 'Travel', tone: 'neutral' },
  workout: { label: 'Workout', tone: 'accent' },
  team_meeting: { label: 'Meeting', tone: 'neutral' },
  meeting: { label: 'Meeting', tone: 'neutral' },
  // A synced class meeting shows on the team calendar by design, so it has to
  // SAY it's a class — otherwise a roster's worth of classes reads as
  // unexplained "Event" rows.
  class: { label: 'Class', tone: 'neutral' },
  other: { label: 'Event', tone: 'neutral' },
};

const TYPE_META_FALLBACK: EventTypeMeta = { label: 'Event', tone: 'neutral' };

export function typeMeta(eventType: string | null | undefined): EventTypeMeta {
  return TYPE_META[(eventType || 'other').toLowerCase()] ?? TYPE_META_FALLBACK;
}

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  practice: Flag,
  tournament: Trophy,
  qualifier: Target,
  qualifying: Target,
  travel: Plane,
  workout: Dumbbell,
  team_meeting: Users,
  meeting: Users,
  class: BookOpen,
  other: CalendarDays,
};

export function typeIcon(eventType: string | null | undefined): React.ComponentType<{ className?: string }> {
  return TYPE_ICON[(eventType || 'other').toLowerCase()] ?? CalendarDays;
}

/**
 * Event type → its colour on the time grid and the month grid: one of the
 * eight pastel identity tints (`--fw-tint-N-bg` / `-ink`, light and dark
 * aware), so a coach can tell practice from a qualifier at a glance. The ink
 * is AA on its own tint. Unknown types stay neutral rather than borrowing a
 * colour that means something else.
 */
export interface EventTone {
  bg: string;
  ink: string;
}

const TYPE_TINT: Record<string, number> = {
  practice: 1, // sage: the everyday green
  workout: 7, // clay
  tournament: 3, // gold
  qualifier: 5, // violet
  qualifying: 5,
  travel: 2, // blue
  team_meeting: 6, // teal
  meeting: 6,
  class: 8, // cyan
};

export function typeTone(eventType: string | null | undefined): EventTone {
  const slot = TYPE_TINT[(eventType || 'other').toLowerCase()];
  if (!slot) return { bg: 'var(--fw-color-surface-sunken)', ink: 'var(--fw-color-text-secondary)' };
  return { bg: `var(--fw-tint-${slot}-bg)`, ink: `var(--fw-tint-${slot}-ink)` };
}

/** RSVP status → pill copy + tone (a player's own response). */
export const RSVP_PILL: Record<RSVPStatus, EventTypeMeta> = {
  accepted: { label: 'Going', tone: 'accent' },
  tentative: { label: 'Maybe', tone: 'warning' },
  declined: { label: 'Declined', tone: 'danger' },
  pending: { label: 'Reply', tone: 'neutral' },
};
