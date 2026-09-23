'use client';

/**
 * ============================================================================
 * Fairway · Calendar · useIsOnline — shared by S7 (my availability) and S9
 * (calendar subscriptions), SCREEN-BUILD-PLAN.md §2.7 / §2.9 "offline" states.
 * ----------------------------------------------------------------------------
 * A minimal `navigator.onLine` + online/offline listener hook. Deliberately
 * NOT the heavier `use-connection-status.ts` (shot-tracking's periodic
 * fetch-based connectivity probe) — these two screens only need "does the
 * browser currently think it has a connection", not RTT/quality metrics, and
 * a settings sheet has no business issuing background pings.
 * ========================================================================== */

import * as React from 'react';

function readOnline(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true;
  return navigator.onLine;
}

export function useIsOnline(): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined') return () => {};
      window.addEventListener('online', onChange);
      window.addEventListener('offline', onChange);
      return () => {
        window.removeEventListener('online', onChange);
        window.removeEventListener('offline', onChange);
      };
    },
    readOnline,
    () => true,
  );
}
