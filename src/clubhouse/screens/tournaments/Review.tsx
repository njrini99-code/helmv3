'use client';

import { TourPlaceholder } from './TourPlaceholder';
import type { ReviewProps } from './types';
import '../../styles/tournaments-review.css';

/**
 * An event's review (plan 4.33, 5.9): the layered observations, the leak table, per-player debrief lines shared one by
 * one, reflections and Make it a focus. Coach only. Owned by the review lane (README.md). Placeholder until built.
 */
export function Review({ data, load, phone }: ReviewProps) {
  return <TourPlaceholder view="review" eyebrow={data.event.name} title="Review" detail={`${data.findings.length} ${data.findings.length === 1 ? 'finding' : 'findings'}`} load={load} phone={phone} />;
}
