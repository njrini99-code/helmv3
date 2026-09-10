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
 * Tone → dot color class. Mirrors the one exhaustive-over-`FwStatusTone`
 * table FairwayDayStrip keeps today (its own comment explains why it is
 * keyed by tone rather than by type: a type-keyed dot map would be a FOURTH
 * copy of this presentation table that a new event_type could miss). Kept
 * here, private, so `dotClassFor`/`TYPE_DOT_CLASS` below can derive a
 * per-TYPE class through `typeMeta` without any caller re-deriving
 * tone → color for itself.
 */
const TONE_DOT_CLASS: Record<FwStatusTone, string> = {
  neutral: 'bg-text-tertiary',
  accent: 'bg-accent-500',
  success: 'bg-fw-success',
  warning: 'bg-fw-warning',
  danger: 'bg-fw-danger',
  info: 'bg-text-primary',
};

/** One dot color for an event type, derived from `typeMeta` (and so from
 *  TYPE_META) — a new event_type gets a correct dot the moment it is added
 *  to TYPE_META, with nothing else to keep in sync. */
export function dotClassFor(eventType: string | null | undefined): string {
  return TONE_DOT_CLASS[typeMeta(eventType).tone];
}

/** Every known event type's dot class, precomputed from TYPE_META's own
 *  keys — for callers that want a lookup table rather than a function call. */
export const TYPE_DOT_CLASS: Record<string, string> = Object.fromEntries(
  Object.keys(TYPE_META).map((type) => [type, dotClassFor(type)]),
);

/** RSVP status → pill copy + tone (a player's own response). */
export const RSVP_PILL: Record<RSVPStatus, EventTypeMeta> = {
  accepted: { label: 'Going', tone: 'accent' },
  tentative: { label: 'Maybe', tone: 'warning' },
  declined: { label: 'Declined', tone: 'danger' },
  pending: { label: 'Reply', tone: 'neutral' },
};
