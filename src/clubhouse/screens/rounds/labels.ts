import type { ChRoundType } from '../../data/rounds-shape';

// Plain values shared by the round's client pieces and the card's model (not a 'use client' module, so either side can call them).

/** A calendar date (yyyy-mm-dd) as a Date at noon UTC, so no zone moves it a day. */
export const dateOf = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);

export const TYPE_LABEL: Record<ChRoundType, string> = { practice: 'Practice', tournament: 'Tournament', qualifier: 'Qualifier' };
