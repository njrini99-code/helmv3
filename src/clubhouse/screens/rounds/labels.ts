import type { ChRoundType } from '../../data/rounds-shape';
import { zoneFormat } from '../../lib/zone-format';

// Plain values shared by the round's client pieces and the card's model (not a 'use client' module, so either side can call them).

/** A calendar date (yyyy-mm-dd) as a Date at noon UTC, so no zone moves it a day. */
export const dateOf = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);

/** "Tue Oct 14": a round's day for a kicker. Its formatters are kept once (lib/zone-format.ts), not built per review or card. */
export const kickerDay = (iso: string) =>
  `${zoneFormat('en-US', 'UTC', 'weekday', { weekday: 'short' }).format(dateOf(iso))} ${zoneFormat('en-US', 'UTC', 'month-day', { month: 'short', day: 'numeric' }).format(dateOf(iso))}`;

export const TYPE_LABEL: Record<ChRoundType, string> = { practice: 'Practice', tournament: 'Tournament', qualifier: 'Qualifier' };
