'use client';

import { useSearchParams } from 'next/navigation';
import { ShsPlayerSkeleton } from './ShsSkeleton';
import { useClubhouseRole } from '../../shell/context';
import { StatsProfileSkeleton, StatsSkeleton } from './StatsSkeleton';
import { StatsPlayerPhoneSkeleton, StatsTeamPhoneSkeleton } from './StatsPhoneSkeleton';
import { useChPhone } from '../../lib/use-phone';

/** `/stats` loads a profile for a player (their own) or for a coach with `?player=` (CH-5403); otherwise the team page (CH-4401). */
export function StatsRouteSkeleton({ shs = false }: { /** clubhouse_stats_redesign_v1, read by the route's loading file. */ shs?: boolean } = {}) {
  const player = useSearchParams().get('player');
  const role = useClubhouseRole();
  const profile = role === 'player' || !!player;
  // The phone draws the phone page's own skeleton (F-44), never the desktop one.
  const phone = useChPhone();
  if (phone && shs && profile) return <ShsPlayerSkeleton />;
  if (phone) return profile ? <StatsPlayerPhoneSkeleton /> : <StatsTeamPhoneSkeleton />;
  return profile ? <StatsProfileSkeleton coach={role === 'coach'} /> : <StatsSkeleton />;
}

/** The same choice for a known page (the dev preview): the phone's own skeleton on a phone (P004-D6, P005-D13). */
export function StatsSkeletonFor({ profile, coach = true, shs = false }: { profile: boolean; coach?: boolean; shs?: boolean }) {
  const phone = useChPhone();
  if (phone && shs && profile) return <ShsPlayerSkeleton />;
  if (phone) return profile ? <StatsPlayerPhoneSkeleton /> : <StatsTeamPhoneSkeleton />;
  return profile ? <StatsProfileSkeleton coach={coach} /> : <StatsSkeleton />;
}
