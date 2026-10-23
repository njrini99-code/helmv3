'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { fetchAhead, prefetchAllowed, whenIdle } from '../../shell/use-prefetch-tabs';

/**
 * A switch between views of the CoachHelm page (Board, Ask, Standing, Deep dive), each its own address. The same
 * pattern as Stats' window switch (F-55): the tap takes effect on the control at once (`shown`: the view being loaded, not the one
 * still on screen), the page stays as it is, marked busy (`pending`: the owner sets `aria-busy`, and coachhelm.css dims what is
 * changing), and the new view replaces it in one swap when the server has it. Nothing blanks and no skeleton is drawn for a
 * switch (the route's Suspense is not keyed by view, so React keeps the revealed view until the next one is ready).
 *
 * `active` is the view the server last drew. Choosing the one already shown does nothing; choosing the one on screen while
 * another is loading sends the page back to it.
 *
 * The other `views` are fetched whole once the page is idle, as the phone's tabs are (use-prefetch-tabs): a default prefetch
 * stops at the route's loading boundary, so every switch waited on the server for the whole page (owner, desktop Safari,
 * 2026-10-16). Skipped with Data Saver on or offline; Next prefetches only in production builds.
 */
export function useViewSwitch<V extends string>(active: V, hrefOf: (view: V) => string, views: readonly V[] = []) {
  const router = useRouter();
  const others = views.filter((v) => v !== active).map(hrefOf).join('|');
  useEffect(() => {
    if (!others || !prefetchAllowed(typeof navigator === 'undefined' ? undefined : navigator)) return;
    return whenIdle(() => {
      for (const href of others.split('|')) fetchAhead(router, href, Date.now());
    });
  }, [others, router]);
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
