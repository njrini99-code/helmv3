'use client';

import { useSearchParams } from 'next/navigation';
import { useClubhouseRole } from '../../shell/context';
import { StatsProfileSkeleton, StatsSkeleton } from './StatsSkeleton';

/** `/stats` loads a profile for a player (their own) or for a coach with `?player=` (CH-5403); otherwise the team page (CH-4401). */
export function StatsRouteSkeleton() {
  const player = useSearchParams().get('player');
  return useClubhouseRole() === 'player' || player ? <StatsProfileSkeleton /> : <StatsSkeleton />;
}
