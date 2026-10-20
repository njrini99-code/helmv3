'use client';

import { useSearchParams } from 'next/navigation';
import { useClubhouseRole } from '../../shell/context';
import { StatsProfileSkeleton, StatsSkeleton } from './StatsSkeleton';
import { StatsPlayerPhoneSkeleton, StatsTeamPhoneSkeleton } from './StatsPhoneSkeleton';
import { useChPhone } from '../../lib/use-phone';

/** `/stats` loads a profile for a player (their own) or for a coach with `?player=` (CH-5403); otherwise the team page (CH-4401). */
export function StatsRouteSkeleton() {
  const player = useSearchParams().get('player');
  const role = useClubhouseRole();
  const profile = role === 'player' || !!player;
  // The phone draws the phone page's own skeleton (F-44), never the desktop one.
  if (useChPhone()) return profile ? <StatsPlayerPhoneSkeleton /> : <StatsTeamPhoneSkeleton />;
  return profile ? <StatsProfileSkeleton coach={role === 'coach'} /> : <StatsSkeleton />;
}

/** The same choice for a known page (the dev preview): the phone's own skeleton on a phone (P004-D6, P005-D13). */
export function StatsSkeletonFor({ profile, coach = true }: { profile: boolean; coach?: boolean }) {
  if (useChPhone()) return profile ? <StatsPlayerPhoneSkeleton /> : <StatsTeamPhoneSkeleton />;
  return profile ? <StatsProfileSkeleton coach={coach} /> : <StatsSkeleton />;
}
