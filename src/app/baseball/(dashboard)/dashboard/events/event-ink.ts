/**
 * event-ink.ts — the event-type → lane-ink map, shared across every baseball
 * surface that renders an event (spec's colour law: green = team/development,
 * clay = recruiting/pursuit — showcases and tryouts are the recruiting-facing
 * event types).
 *
 * Extracted out of `EventsClient` so `CalendarFairway`
 * (`src/components/baseball/calendar/CalendarFairway.tsx`) can import the same
 * mapping instead of re-deriving (or hardcoding a single tone for) event-type
 * ink, keeping the two surfaces from drifting apart.
 *
 * Only 3 non-reserved tones exist (`sodium` is reserved for a genuinely
 * live/PR moment, never a category), so `variant` adds a second axis to keep
 * 7 event types visually distinct; `meeting`/`other` share the
 * lowest-salience combo since the label text carries the rest of the read.
 */
import type { InkBadgeProps } from '@/components/baseball/living-annual';

export type EventInk = { tone: NonNullable<InkBadgeProps['tone']>; variant: NonNullable<InkBadgeProps['variant']> };

export const DEFAULT_EVENT_INK: EventInk = { tone: 'neutral', variant: 'soft' };

export const eventTypeInk: Record<string, EventInk> = {
  game: { tone: 'team', variant: 'solid' },
  practice: { tone: 'team', variant: 'soft' },
  showcase: { tone: 'pursuit', variant: 'solid' },
  tryout: { tone: 'pursuit', variant: 'soft' },
  tournament: { tone: 'neutral', variant: 'solid' },
  meeting: { tone: 'neutral', variant: 'soft' },
  other: DEFAULT_EVENT_INK,
};

export function eventInk(eventType: string): EventInk {
  return eventTypeInk[eventType] ?? DEFAULT_EVENT_INK;
}
