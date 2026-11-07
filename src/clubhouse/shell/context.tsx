'use client';

import { createContext, useContext, type ReactNode } from 'react';

const InClubhouse = createContext(false);
const Role = createContext<'coach' | 'player' | null>(null);
const ClassAwareness = createContext(false);

/** Which of CoachHelm's views are on: the flag registry is server-only, so the shell reads them once and hands them down. Outside the shell, none. */
export interface ChHelmViews {
  /** coachhelm_monday_brief_v1: the coach's Brief is a view of the page. */
  /** coachhelm_player_ask_v1: the player's Ask is a view of the page. */
  playerAsk?: boolean;
  /** coachhelm_team_board_v1, Team first: the coach's first view is Team, not Board. */
  team?: boolean;
}
const HelmViews = createContext<ChHelmViews>({});

/** Marks a subtree as rendered inside the Clubhouse shell, for the signed-in role. */
export function ClubhouseMarker({ children, role = null, classAwareness = false, helmViews }: { children: ReactNode; role?: 'coach' | 'player' | null; classAwareness?: boolean; helmViews?: ChHelmViews }) {
  return (
    <InClubhouse.Provider value>
      <Role.Provider value={role}>
        <ClassAwareness.Provider value={classAwareness}>
          <HelmViews.Provider value={helmViews ?? NO_VIEWS}>{children}</HelmViews.Provider>
        </ClassAwareness.Provider>
      </Role.Provider>
    </InClubhouse.Provider>
  );
}

const NO_VIEWS: ChHelmViews = {};

/** Which of CoachHelm's views the strips offer. */
export function useHelmViews(): ChHelmViews {
  return useContext(HelmViews);
}

/**
 * True inside the Clubhouse shell. Shared route files (template, loading,
 * error boundaries) use it to step aside so Fairway UI never renders inside
 * the Clubhouse frame.
 */
export function useInClubhouse(): boolean {
  return useContext(InClubhouse);
}

/** The shell's role, for route files (loading) that draw a role's own shape before its page loads. */
export function useClubhouseRole(): 'coach' | 'player' | null {
  return useContext(Role);
}

/**
 * P-10: whether class awareness (`class_awareness_v1`) is on for this session. The flag registry is server-only, so the
 * shell reads it once and hands it down here. Every class read and every class line starts from this: false means no
 * RPC, no new column in a query, nothing drawn. Outside the shell (a bare screen in a test) it reads false.
 */
export function useClassAwareness(): boolean {
  return useContext(ClassAwareness);
}
