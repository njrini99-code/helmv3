'use client';

import { TourPlaceholder } from './TourPlaceholder';
import type { PlayerEventProps } from './types';
import '../../styles/tournaments-player.css';

/**
 * The player's Tournaments (plan 4.33, 5.11): the list, and an event's reveal, trip, tee times, record-only window
 * (D-87), results once Final (D-85), shared notes and reflection; desktop and phone. Players only. Owned by the player
 * lane (README.md). Placeholder until built.
 */
export function PlayerEvent({ data, load, phone }: PlayerEventProps) {
  const n = data.list.length;
  return (
    <TourPlaceholder
      view="player"
      eyebrow={data.team.label}
      title={data.event ? data.event.event.name : 'Tournaments'}
      name={data.event ? 'The player’s event' : 'The player’s Tournaments'}
      detail={data.event ? `${data.me.name} · ${data.event.reveal ? data.event.reveal.status.replace('_', ' ') : 'lineup not published yet'}` : `${data.me.name} · ${n} ${n === 1 ? 'event' : 'events'}`}
      load={load}
      phone={phone}
    />
  );
}
