'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

/**
 * A switch between views of the CoachHelm page (Board, Ask, Game profile, Standing, Deep dive), each its own address. The same
 * pattern as Stats' window switch (F-55): the tap takes effect on the control at once (`shown`: the view being loaded, not the one
 * still on screen), the page stays as it is, marked busy (`pending`: the owner sets `aria-busy`, and coachhelm.css dims what is
 * changing), and the new view replaces it in one swap when the server has it. Nothing blanks and no skeleton is drawn for a
 * switch (the route's Suspense is not keyed by view, so React keeps the revealed view until the next one is ready).
 *
 * `active` is the view the server last drew. Choosing the one already shown does nothing; choosing the one on screen while
 * another is loading sends the page back to it.
 */
export function useViewSwitch<V extends string>(active: V, hrefOf: (view: V) => string) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<V | null>(null);
  // The server answered with a new view (this owner is replaced, so this is the same-view answer), or the navigation ended
  // without one: either way the tap is no longer waiting, and the control goes back to the view that is on screen.
  useEffect(() => {
    if (!pending) setTarget(null);
  }, [pending, active]);
  const shown = target ?? active;
  const go = (view: V) => {
    if (view === shown) return;
    setTarget(view);
    start(() => router.push(hrefOf(view)));
  };
  return { shown, pending, go };
}
