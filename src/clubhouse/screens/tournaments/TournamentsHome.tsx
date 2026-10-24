'use client';

import { TourPlaceholder } from './TourPlaceholder';
import type { TournamentsHomeProps } from './types';
import '../../styles/tournaments-home.css';

/**
 * Season home (plan 4.33, 5.1): the next-up hero with its week rail, the season path, the ledger of events, the roster
 * heatmap and the ranking explainer; desktop and phone. Owned by the home lane (README.md). Placeholder until built.
 */
export function TournamentsHome({ data, load, phone }: TournamentsHomeProps) {
  const n = data.events.filter((e) => e.seasonId === data.season.id).length;
  return <TourPlaceholder view="home" eyebrow={data.team.label} title="Tournaments" detail={`${data.season.label} · ${n} ${n === 1 ? 'event' : 'events'}`} load={load} phone={phone} />;
}
