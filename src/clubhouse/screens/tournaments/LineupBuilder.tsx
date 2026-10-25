'use client';

import { TourPlaceholder } from './TourPlaceholder';
import type { LineupBuilderProps } from './types';
import '../../styles/tournaments-lineup.css';

/**
 * The lineup builder (plan 4.33, 5.3): slots by drag and keyboard, the fifth-spot bench, form strips, the projection
 * range (D-93), the lock countdown and the publish sheet (D-90). Coach only. Owned by the lineup lane (README.md).
 * Placeholder until built.
 */
export function LineupBuilder({ data, load, phone }: LineupBuilderProps) {
  return <TourPlaceholder view="lineup" eyebrow={data.event.name} title="Lineup" detail={`${data.lineup.set} of ${data.lineup.of} set`} load={load} phone={phone} />;
}
