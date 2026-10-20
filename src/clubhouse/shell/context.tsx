'use client';

import { createContext, useContext, type ReactNode } from 'react';

const InClubhouse = createContext(false);
const Role = createContext<'coach' | 'player' | null>(null);

/** Marks a subtree as rendered inside the Clubhouse shell, for the signed-in role. */
export function ClubhouseMarker({ children, role = null }: { children: ReactNode; role?: 'coach' | 'player' | null }) {
  return (
    <InClubhouse.Provider value>
      <Role.Provider value={role}>{children}</Role.Provider>
    </InClubhouse.Provider>
  );
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
