'use client';

import { useEffect } from 'react';

/** The suffix `src/app/golf/layout.tsx` gives every GolfHelm page title (`%s · GolfHelm`). */
const SUFFIX = ' · GolfHelm';

/**
 * A screen pushed inside a route (a player's profile over Roster) names the tab, the app switcher and VoiceOver's
 * window title for itself while it is up, and gives the route's own title back as it leaves (PLAYER-04, WCAG 2.4.2).
 * The route keeps its metadata title; this only covers the pushed screen's lifetime. If the route changed the title
 * meanwhile (a navigation), that title stands.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title || typeof document === 'undefined') return;
    const was = document.title;
    const mine = `${title}${SUFFIX}`;
    document.title = mine;
    return () => {
      if (document.title === mine) document.title = was;
    };
  }, [title]);
}

/** `useDocumentTitle` as an element, for a screen that is rendered conditionally. */
export function DocumentTitle({ title }: { title: string }): null {
  useDocumentTitle(title);
  return null;
}
