'use client';

import { TourPlaceholder } from './TourPlaceholder';
import type { LinkInboxProps } from './types';
import '../../styles/tournaments-review.css';

/**
 * The round link inbox (plan 4.33, 5.12): GolfHelm rounds that look like tournament rounds, with a suggested event and
 * round and a confidence, plus lineup players with no round linked. Coach only. Owned by the review lane (README.md).
 * Placeholder until built.
 */
export function LinkInbox({ data, load, phone }: LinkInboxProps) {
  const n = data.candidates.length;
  return <TourPlaceholder view="links" eyebrow="Tournaments" title="Link rounds" detail={`${n} ${n === 1 ? 'round' : 'rounds'} to link`} load={load} phone={phone} />;
}
