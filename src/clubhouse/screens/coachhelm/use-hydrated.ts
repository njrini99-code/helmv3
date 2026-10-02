'use client';

import { useSyncExternalStore } from 'react';

const never = () => () => {};

/**
 * False while React is hydrating server markup, true on every render after it (and on a render that never hydrated, a client navigation).
 *
 * The shell's `useChSessionState` reads sessionStorage in its initialiser once `RouteFrame` has marked the app running, and every CoachHelm
 * view sits in the route's one Suspense, so a hard reload can hydrate a view after that mark: the kept value would be drawn over server
 * markup made from the default. A view masks its kept value with this during the hydration pass (it draws the default, as the server did)
 * and the kept value shows in the render React does straight after, with nothing flashed on a client navigation.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(never, () => true, () => false);
}
