'use client';

import { createContext, useContext, useMemo } from 'react';
import type { CoachTeamOption } from '@/lib/golf/resolve-team';

export interface GolfUserData {
  role: 'coach' | 'player';
  userId: string;
  name: string;
  teamName?: string;
  avatarUrl?: string;
  // IDs that pages need for queries — avoids re-fetching
  coachId?: string;
  playerId?: string;
  teamId?: string;
  organizationId?: string;
  /**
   * All teams the coach is staffed on (populated for coaches only).
   * Used by the TeamSwitcher at the top of the dashboard.
   * Empty array = single-team coach (switcher hidden).
   */
  coachTeams?: CoachTeamOption[];
  /**
   * Program-head gate: true only when the coach staffs >1 team via
   * golf_team_coach_staff AND holds role 'head_coach' on at least one staff
   * row. Controls whether the TeamSwitcher renders at all. Assistants and
   * single-team head coaches keep standard single-team viewing.
   */
  canSwitchTeams?: boolean;
}

const GolfUserContext = createContext<GolfUserData | null>(null);

export function GolfUserProvider({
  children,
  userData,
}: {
  children: React.ReactNode;
  userData: GolfUserData;
}) {
  // PERF: Memoize context value by its constituent fields to prevent unnecessary
  // re-renders of all consumers when the parent re-renders with a new object reference.
  const memoizedValue = useMemo(
    () => userData,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userData.userId, userData.role, userData.teamId, userData.coachId, userData.playerId, userData.avatarUrl, userData.name]
  );

  return (
    <GolfUserContext.Provider value={memoizedValue}>
      {children}
    </GolfUserContext.Provider>
  );
}

/**
 * Access the authenticated golf user's resolved data (role, IDs, team info).
 * Available in all pages under the golf dashboard layout.
 * Eliminates the need for pages to re-fetch user/coach/player/team records.
 */
export function useGolfUser(): GolfUserData {
  const ctx = useContext(GolfUserContext);
  if (!ctx) {
    throw new Error('useGolfUser must be used within GolfUserProvider (golf dashboard layout)');
  }
  return ctx;
}
