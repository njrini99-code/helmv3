'use client';

import { ViewTransitions } from 'next-view-transitions';
import { ReactNode } from 'react';

export function ViewTransitionsProvider({ children }: { children: ReactNode }) {
  return <ViewTransitions>{children}</ViewTransitions>;
}
