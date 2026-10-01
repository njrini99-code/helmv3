'use client';

import type { ReactNode } from 'react';
import { useInClubhouse } from './context';

/**
 * For shared route files (loading.tsx): render the Clubhouse version inside
 * the Clubhouse shell and the existing version everywhere else.
 */
export function ClubhouseSwitch({ clubhouse, fallback }: { clubhouse: ReactNode; fallback: ReactNode }) {
  return <>{useInClubhouse() ? clubhouse : fallback}</>;
}
