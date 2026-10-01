'use client';

import { useSearchParams } from 'next/navigation';
import { useClubhouseRole } from '../../shell/context';
import { StatsProfileSkeleton, StatsSkeleton } from './StatsSkeleton';
import { StatsPlayerPhoneSkeleton, StatsTeamPhoneSkeleton } from './StatsPhoneSkeleton';
import { useChPhone } from '../../lib/use-phone';

/** `/stats` loads a profile for a player (their own) or for a coach with `?player=` (CH-5403); otherwise the team page (CH-4401). */
export function StatsRouteSkeleton() {
  const player = useSearchParams().get('player');
  const profile = useClubhouseRole() === 'player' || !!player;
  // The phone draws the phone page's own skeleton (F-44), never the desktop one.
  if (useChPhone()) return profile ? <StatsPlayerPhoneSkeleton /> : <StatsTeamPhoneSkeleton />;
  return profile ? <StatsProfileSkeleton /> : <StatsSkeleton />;
}
