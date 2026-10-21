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
 * aware), so a coach can tell practice from a qualifier at a glance. Unknown
 * types stay neutral rather than borrowing a colour that means something else.
 *
 * `fill` is what an event is PAINTED with: the tint deepened with a little of
 * its own ink, so a block reads as a solid colour on the cream card (the bare
 * tint is too close to the cream to hold its edge). Title and time sit on it
 * in text-primary / text-secondary, both AA on every fill; the ink is the
 * bar down the block's left edge and its icon.
 */
export interface EventTone {
  bg: string;
  ink: string;
  fill: string;
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

/** How much of the ink goes into an event's fill. */
export const FILL_INK_PCT = 18;

function toneFrom(bg: string, ink: string): EventTone {
  return { bg, ink, fill: `color-mix(in oklch, ${bg} ${100 - FILL_INK_PCT}%, ${ink})` };
}

export function typeTone(eventType: string | null | undefined): EventTone {
  const slot = TYPE_TINT[(eventType || 'other').toLowerCase()];
  if (!slot) return toneFrom('var(--fw-color-surface-sunken)', 'var(--fw-color-text-secondary)');
  return toneFrom(`var(--fw-tint-${slot}-bg)`, `var(--fw-tint-${slot}-ink)`);
}

/**
 * The CSS variables an event surface paints with (`--ev-fill`, `--ev-ink`).
 * The Day block, the all-day chip, the Week bar and the Month chip all read
 * these, so the three views agree on every colour. A cancelled event drops to
 * the sunken ground with a neutral bar. `tint` overrides the type colour (a
 * class chip wears its player's identity tint).
 */
export function eventToneVars(
  eventType: string | null | undefined,
  { cancelled = false, tint }: { cancelled?: boolean; tint?: { bg: string; text: string } | null } = {},
): React.CSSProperties {
  if (cancelled) {
    return { '--ev-fill': 'var(--fw-color-surface-sunken)', '--ev-ink': 'var(--fw-color-border-strong)' } as React.CSSProperties;
  }
  const tone = tint ? toneFrom(tint.bg, tint.text) : typeTone(eventType);
  return { '--ev-fill': tone.fill, '--ev-ink': tone.ink } as React.CSSProperties;
}

/**
 * Paints an event surface from `eventToneVars`: the fill, a faint edge in the
 * type's ink, a firmer edge and a soft lift on hover (shadow alpha under 0.08).
 * Pair it with `overflow-clip` + a radius so `EVENT_BAR` follows the corner.
 */
export const EVENT_SURFACE =
  'bg-[color:var(--ev-fill)] [box-shadow:inset_0_0_0_1px_color-mix(in_oklch,var(--ev-ink)_22%,transparent)] ' +
  'hover:[box-shadow:inset_0_0_0_1px_color-mix(in_oklch,var(--ev-ink)_45%,transparent),0_4px_12px_-6px_oklch(0.3_0.03_70/0.07)]';

/** The 3px bar of the type's ink down an event's left edge. */
export const EVENT_BAR = 'pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-[color:var(--ev-ink)]';

/**
 * The same tint as classes, for surfaces that paint it without inline style
 * (month chips, legend and phone dots). Literal strings so Tailwind sees each.
 * `chip` = tint ground + ink; `dot` = the ink; `swatch` = the tint ground;
 * `vars` = the `--ev-fill` / `--ev-ink` pair `EVENT_SURFACE` and `EVENT_BAR`
 * read, as classes (82% = 100 − FILL_INK_PCT: keep the two in step).
 */
export interface EventToneClasses {
  chip: string;
  dot: string;
  swatch: string;
  vars: string;
}

const TINT_CLASSES: Record<number, EventToneClasses> = {
  1: {
    chip: 'bg-[color:var(--fw-tint-1-bg)] text-[color:var(--fw-tint-1-ink)]',
    dot: 'bg-[color:var(--fw-tint-1-ink)]',
    swatch: 'bg-[color:var(--fw-tint-1-bg)]',
    vars: '[--ev-fill:color-mix(in_oklch,var(--fw-tint-1-bg)_82%,var(--fw-tint-1-ink))] [--ev-ink:var(--fw-tint-1-ink)]',
  },
  2: {
    chip: 'bg-[color:var(--fw-tint-2-bg)] text-[color:var(--fw-tint-2-ink)]',
    dot: 'bg-[color:var(--fw-tint-2-ink)]',
    swatch: 'bg-[color:var(--fw-tint-2-bg)]',
    vars: '[--ev-fill:color-mix(in_oklch,var(--fw-tint-2-bg)_82%,var(--fw-tint-2-ink))] [--ev-ink:var(--fw-tint-2-ink)]',
  },
  3: {
    chip: 'bg-[color:var(--fw-tint-3-bg)] text-[color:var(--fw-tint-3-ink)]',
    dot: 'bg-[color:var(--fw-tint-3-ink)]',
    swatch: 'bg-[color:var(--fw-tint-3-bg)]',
    vars: '[--ev-fill:color-mix(in_oklch,var(--fw-tint-3-bg)_82%,var(--fw-tint-3-ink))] [--ev-ink:var(--fw-tint-3-ink)]',
  },
  4: {
    chip: 'bg-[color:var(--fw-tint-4-bg)] text-[color:var(--fw-tint-4-ink)]',
    dot: 'bg-[color:var(--fw-tint-4-ink)]',
    swatch: 'bg-[color:var(--fw-tint-4-bg)]',
    vars: '[--ev-fill:color-mix(in_oklch,var(--fw-tint-4-bg)_82%,var(--fw-tint-4-ink))] [--ev-ink:var(--fw-tint-4-ink)]',
  },
  5: {
    chip: 'bg-[color:var(--fw-tint-5-bg)] text-[color:var(--fw-tint-5-ink)]',
    dot: 'bg-[color:var(--fw-tint-5-ink)]',
    swatch: 'bg-[color:var(--fw-tint-5-bg)]',
    vars: '[--ev-fill:color-mix(in_oklch,var(--fw-tint-5-bg)_82%,var(--fw-tint-5-ink))] [--ev-ink:var(--fw-tint-5-ink)]',
  },
  6: {
    chip: 'bg-[color:var(--fw-tint-6-bg)] text-[color:var(--fw-tint-6-ink)]',
    dot: 'bg-[color:var(--fw-tint-6-ink)]',
    swatch: 'bg-[color:var(--fw-tint-6-bg)]',
    vars: '[--ev-fill:color-mix(in_oklch,var(--fw-tint-6-bg)_82%,var(--fw-tint-6-ink))] [--ev-ink:var(--fw-tint-6-ink)]',
  },
  7: {
    chip: 'bg-[color:var(--fw-tint-7-bg)] text-[color:var(--fw-tint-7-ink)]',
    dot: 'bg-[color:var(--fw-tint-7-ink)]',
    swatch: 'bg-[color:var(--fw-tint-7-bg)]',
    vars: '[--ev-fill:color-mix(in_oklch,var(--fw-tint-7-bg)_82%,var(--fw-tint-7-ink))] [--ev-ink:var(--fw-tint-7-ink)]',
  },
  8: {
    chip: 'bg-[color:var(--fw-tint-8-bg)] text-[color:var(--fw-tint-8-ink)]',
    dot: 'bg-[color:var(--fw-tint-8-ink)]',
    swatch: 'bg-[color:var(--fw-tint-8-bg)]',
    vars: '[--ev-fill:color-mix(in_oklch,var(--fw-tint-8-bg)_82%,var(--fw-tint-8-ink))] [--ev-ink:var(--fw-tint-8-ink)]',
  },
};

const NEUTRAL_CLASSES: EventToneClasses = {
  chip: 'bg-surface-sunken text-text-secondary',
  dot: 'bg-text-tertiary',
  swatch: 'bg-surface-sunken',
  vars: '[--ev-fill:color-mix(in_oklch,var(--fw-color-surface-sunken)_82%,var(--fw-color-text-secondary))] [--ev-ink:var(--fw-color-text-secondary)]',
};

/** A cancelled event, as classes: the sunken ground with a neutral bar. */
export const CANCELLED_TONE_VARS = '[--ev-fill:var(--fw-color-surface-sunken)] [--ev-ink:var(--fw-color-border-strong)]';

export function typeToneClasses(eventType: string | null | undefined): EventToneClasses {
  const slot = TYPE_TINT[(eventType || 'other').toLowerCase()];
  return (slot ? TINT_CLASSES[slot] : undefined) ?? NEUTRAL_CLASSES;
}

/** RSVP status → pill copy + tone (a player's own response). */
export const RSVP_PILL: Record<RSVPStatus, EventTypeMeta> = {
  accepted: { label: 'Going', tone: 'accent' },
  tentative: { label: 'Maybe', tone: 'warning' },
  declined: { label: 'Declined', tone: 'danger' },
  pending: { label: 'Reply', tone: 'neutral' },
};
