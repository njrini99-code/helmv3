'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import type { PlayerType } from '@/lib/types';

interface PlayerRecruitingGateResult {
  /** True only when the player is high_school/showcase/juco AND recruiting_activated === true */
  isActivated: boolean;
  /** The player's player_type, or null while loading */
  playerType: PlayerType | null;
  /** True while auth is resolving */
  isLoading: boolean;
}

/**
 * Gate for PLAYER-facing recruiting surfaces (e.g. /dashboard/activate,
 * /dashboard/college-interest-player).
 *
 * Rules:
 * - `college` players → blocked entirely; recruiting does not apply.
 * - all other (non-college) players → redirected away, regardless of
 *   `recruiting_activated`, since the calling component has no
 *   player-facing rendering path (avoids a permanent blank page for
 *   activated players who previously fell through every branch).
 *
 * College-player blocking is left to the calling component so it can
 * render a richer "not available" state rather than a silent redirect.
 */
export function usePlayerRecruitingGate(): PlayerRecruitingGateResult {
  const router = useRouter();
  const { user, player, loading: authLoading } = useAuth();

  const isLoading = authLoading;
  const playerType = (player?.player_type as PlayerType) ?? null;
  const isCollegePlayer = playerType === 'college';
  const isActivated = !isCollegePlayer && player?.recruiting_activated === true;

  // Redirect ANY non-college player away from recruiting pages gated by
  // this hook (the calling component has no player-facing rendering path,
  // so falling through to a null render previously left the page blank).
  // College players are NOT silently redirected — the calling component
  // renders an explicit "not available" state for them.
  useEffect(() => {
    if (isLoading) return;
    if (user?.role !== 'player') return;
    if (isCollegePlayer) return; // component handles this case with a locked state
    router.replace('/baseball/dashboard/journey');
  }, [isLoading, user?.role, isCollegePlayer, router]);

  return { isActivated, playerType, isLoading };
}
