'use client';

import { usePathname } from 'next/navigation';
import { useClubhouseRole } from '@/clubhouse/shell/context';
import { RoundReviewSkeleton, RoundsSkeleton } from '@/clubhouse/screens/rounds/RoundsSkeleton';
import { TeamRoundsSkeleton } from '@/clubhouse/screens/rounds/TeamRoundsSkeleton';

/** A round's own address (not /new, /recover, /continue or /course): its review is on the way. */
const REVIEW = /^\/golf\/dashboard\/rounds\/[0-9a-f-]{36}\/?$/i;

// The player's library, or the coach's team list. A client component because the shell's role is read from context.
// A tap on a round before Next knows the review's route shape commits onto this boundary, not the review's own (E-1,
// audit 2026-11-19: the push slid in a team-rounds skeleton for 300 ms): at a round's address it draws the review's
// skeleton, with the hero the row carried, so the push lands on the round either way. The server reads the same address.
export default function Loading() {
  const path = usePathname() ?? '';
  const role = useClubhouseRole();
  if (REVIEW.test(path)) return <RoundReviewSkeleton />;
  return role === 'coach' ? <TeamRoundsSkeleton /> : <RoundsSkeleton />;
}
