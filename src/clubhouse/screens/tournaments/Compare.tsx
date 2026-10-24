'use client';

import { TourPlaceholder } from './TourPlaceholder';
import type { CompareProps } from './types';
import '../../styles/tournaments-compare.css';

/**
 * The comparison workspace (plan 4.33, section 6): the question bar, the tiered verdict (D-101), the pair heroes, the
 * results screen, presets and share cards; A and B scopes come from `search` (URL tokens, 6.4). `embedded` draws it
 * inside the desk's Compare tab. Coach only. Owned by the compare lane (README.md). Placeholder until built.
 */
export function Compare({ data, load, phone }: CompareProps) {
  const n = data.rounds.length;
  return <TourPlaceholder view="compare" eyebrow="Tournaments" title="Compare" detail={`${n} ${n === 1 ? 'round' : 'rounds'} to draw on`} load={load} phone={phone} />;
}
