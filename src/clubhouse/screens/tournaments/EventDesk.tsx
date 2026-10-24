'use client';

import { TourPlaceholder } from './TourPlaceholder';
import type { EventDeskProps } from './types';
import '../../styles/tournaments-desk.css';

/**
 * The event desk (plan 4.33, 5.4, 5.6, 5.7, 5.13): header and Overview in the prep, live, result and review moods,
 * the field table, findings, Who counted, the hole grid and the evidence drawer; desktop and phone. The tab, round and
 * views come from `search` (URL state, 4.3). Owned by the desk lane (README.md). Placeholder until built.
 */
export function EventDesk({ data, search, load, phone }: EventDeskProps) {
  return <TourPlaceholder view="desk" eyebrow="Event desk" title={data.event.name} name="The event desk" detail={`${data.event.short} · ${search.tab}`} load={load} phone={phone} />;
}
