'use client';

import { useClubhouseRole } from '@/clubhouse/shell/context';
import { RoundsSkeleton } from '@/clubhouse/screens/rounds/RoundsSkeleton';
import { TeamRoundsSkeleton } from '@/clubhouse/screens/rounds/TeamRoundsSkeleton';

// The player's library, or the coach's team list. A client component because the shell's role is read from context.
export default function Loading() {
  return useClubhouseRole() === 'coach' ? <TeamRoundsSkeleton /> : <RoundsSkeleton />;
}
