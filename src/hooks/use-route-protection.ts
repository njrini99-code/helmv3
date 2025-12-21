'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

type CoachType = 'college' | 'high_school' | 'juco' | 'showcase';

interface RouteProtectionOptions {
  allowedCoachTypes?: CoachType[];
  requireRecruiting?: boolean;
  redirectTo?: string;
}

/**
 * Hook to protect routes based on coach type
 *
 * Usage:
 * ```tsx
 * const { isAllowed, isLoading } = useRouteProtection({
 *   allowedCoachTypes: ['college', 'juco'],
 *   requireRecruiting: true,
 * });
 * ```
 */
export function useRouteProtection(options: RouteProtectionOptions = {}) {
  const router = useRouter();
  const { user, coach, loading: authLoading } = useAuth();

  const {
    allowedCoachTypes = ['college', 'high_school', 'juco', 'showcase'],
    requireRecruiting = false,
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
 * Only HS, Showcase, and JUCO coaches can access
 */
export function useTeamRouteProtection() {
  return useRouteProtection({
    allowedCoachTypes: ['high_school', 'showcase', 'juco'],
    redirectTo: '/baseball/dashboard',
  });
}
