'use client';

import { plural } from '../../lib/plural';
import { TourPlaceholder } from './TourPlaceholder';
import type { EventFormProps } from './types';
import '../../styles/tournaments-lineup.css';

/**
 * New and edit event (plan 4.33, 5.2): format defaults by kind, rounds and courses, 36-hole day detection, the field,
 * advice givers, the summary sentence and validation; a full page on desktop and a sheet on phone. Coach only. Owned by
 * the lineup lane (README.md). Placeholder until built.
 */
export function EventForm({ data, load, phone }: EventFormProps) {
  const n = data.initial.rounds.length;
  return (
    <TourPlaceholder
      view="form"
      eyebrow="Tournaments"
      title={data.mode === 'new' ? 'New event' : 'Edit event'}
      detail={`${data.initial.name || 'A new event'} · ${plural(n, 'round')}`}
      load={load}
      phone={phone}
    />
  );
}
