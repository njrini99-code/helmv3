'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import type { PlayerType } from '@/lib/types';

type CoachType = 'college' | 'high_school' | 'juco' | 'showcase';

interface RouteProtectionOptions {
  allowedCoachTypes?: CoachType[];
  requireRecruiting?: boolean;
  redirectTo?: string;
}

/**
 * Base hook that gates COACH-ONLY routes by coach_type.
 *
 * This is a COACH-type gate — it restricts which flavour of coach
 * (college / high_school / juco / showcase) can reach a given route.
 * It has nothing to do with player-facing recruiting surfaces; for
 * those, use `usePlayerRecruitingGate` instead.
 *
 * Usage:
 * ```tsx
 * const { isAllowed, isLoading } = useRouteProtection({
 *   allowedCoachTypes: ['college', 'juco'],
 * });
 * ```
 */
export function useRouteProtection(options: RouteProtectionOptions = {}) {
  const router = useRouter();
  const { user, coach, loading: authLoading } = useAuth();

  const {
    allowedCoachTypes = ['college', 'high_school', 'juco', 'showcase'],
    // requireRecruiting is reserved for future use
    redirectTo = '/baseball/dashboard/team',
  } = options;

  const isLoading = authLoading;

  // Determine if user is allowed
  let isAllowed = false;

  if (!isLoading && user?.role === 'coach' && coach) {
    const coachType = coach.coach_type as CoachType;
    isAllowed = allowedCoachTypes.includes(coachType);
  }

  // Redirect if not allowed
  useEffect(() => {
    if (!isLoading && user?.role === 'coach' && !isAllowed) {
      router.replace(redirectTo);
    }
  }, [isLoading, user?.role, isAllowed, router, redirectTo]);

  return { isAllowed, isLoading };
}

/**
 * Recruiting-only pages (discover, watchlist, pipeline, compare, camps)
 * Only College and JUCO coaches can access
 */
export function useRecruitingRouteProtection() {
  return useRouteProtection({
    allowedCoachTypes: ['college', 'juco'],
    redirectTo: '/baseball/dashboard/team',
  });
}

/**
 * Team-only pages (roster, dev-plans, college-interest)
 * Only HS, Showcase, and JUCO coaches can access.
 *
 * NOTE: this is a COACH-type gate, not a player gate. It prevents the
 * wrong flavour of coach from landing on team-management surfaces. It
 * is NOT meant to guard player-facing recruiting surfaces — use
 * `usePlayerRecruitingGate` for that.
 */
export function useTeamRouteProtection() {
  return useRouteProtection({
    allowedCoachTypes: ['high_school', 'showcase', 'juco'],
    redirectTo: '/baseball/dashboard',
  });
}

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
 * - non-college players with `recruiting_activated !== true` → redirect
 *   to /baseball/player/today with an honest empty-state message.
 * - non-college players with `recruiting_activated === true` → allowed.
 *
 * The hook only redirects for the unactivated case. College-player
 * blocking is left to the calling component so it can render a richer
 * "not available" state rather than a silent redirect.
 */
export function usePlayerRecruitingGate(): PlayerRecruitingGateResult {
  const router = useRouter();
  const { user, player, loading: authLoading } = useAuth();

  const isLoading = authLoading;
  const playerType = (player?.player_type as PlayerType) ?? null;
  const isCollegePlayer = playerType === 'college';
  const isActivated = !isCollegePlayer && player?.recruiting_activated === true;

  // Redirect unactivated (non-college) players away from recruiting pages.
  // College players are NOT silently redirected — the calling component
  // renders an explicit "not available" state for them.
  useEffect(() => {
    if (isLoading) return;
    if (user?.role !== 'player') return;
    if (isCollegePlayer) return; // component handles this case with a locked state
    if (!isActivated) {
      router.replace('/baseball/player/today');
    }
  }, [isLoading, user?.role, isCollegePlayer, isActivated, router]);

  return { isActivated, playerType, isLoading };
}
