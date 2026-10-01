'use client';

import { useSyncExternalStore } from 'react';

/** The phone layout's width, the same breakpoint as `@media (max-width: 820px)` in the stylesheets. */
export const CH_PHONE_QUERY = '(max-width: 820px)';

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(CH_PHONE_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/**
 * True at phone width, for a page whose phone structure differs from desktop
 * (a sheet instead of a panel). Layout-only differences stay in CSS. The
 * server snapshot is desktop, so a phone renders desktop for one frame at
 * hydration; hide that with CSS rather than reading the user agent.
 */
export function useChPhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(CH_PHONE_QUERY).matches,
    () => false,
  );
}
