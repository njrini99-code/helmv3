'use client';

import { TourPlaceholder } from './TourPlaceholder';
import type { HistoryProps } from './types';
import '../../styles/tournaments-review.css';

/**
 * Season history and trends (plan 4.33, 5.10): the team trend against course rating, the season band, head to head
 * and the splits; `search` holds the mode and adjustment (4.3). Coach only. Owned by the review lane (README.md).
 * Placeholder until built.
 */
export function History({ data, load, phone }: HistoryProps) {
  const n = data.events.length;
  return <TourPlaceholder view="history" eyebrow="Tournaments" title="History" detail={`${n} ${n === 1 ? 'event' : 'events'} across ${data.seasons.length} ${data.seasons.length === 1 ? 'season' : 'seasons'}`} load={load} phone={phone} />;
}
