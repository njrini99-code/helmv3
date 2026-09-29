'use client';

import { createContext, useContext, type ReactNode } from 'react';

const InClubhouse = createContext(false);

/** Marks a subtree as rendered inside the Clubhouse shell. */
export function ClubhouseMarker({ children }: { children: ReactNode }) {
  return <InClubhouse.Provider value>{children}</InClubhouse.Provider>;
}

/**
 * True inside the Clubhouse shell. Shared route files (template, loading,
 * error boundaries) use it to step aside so Fairway UI never renders inside
 * the Clubhouse frame.
 */
export function useInClubhouse(): boolean {
  return useContext(InClubhouse);
}
