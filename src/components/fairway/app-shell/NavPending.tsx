'use client';

/**
 * ============================================================================
 * Fairway · app-shell — NavPending
 * ----------------------------------------------------------------------------
 * Immediate feedback for the gap between "I clicked a nav item" and "the new
 * page is on screen".
 *
 * In the App Router that gap is a server round trip: the RSC payload for the
 * destination has to come back before its `loading.tsx` can even render, and
 * until then the OLD page sits there, unchanged, with nothing indicating the
 * click landed. Measured on this app (dev server, warm):
 *
 *     /dashboard/stats      284 ms
 *     /dashboard/coachhelm  401 ms
 *     /dashboard/rounds     588 ms
 *     /dashboard/calendar  1695 ms
 *
 * Nearly 1.7 s of a dead-looking UI on the worst one. That is the whole of the
 * "transitions could be smoother" feeling — not the reveal animation, which is
 * already tuned (see dashboard/template.tsx), but the silence before it.
 *
 * `useLinkStatus` reports pending state for the enclosing Next `<Link>` from
 * the moment it is clicked, so the affordance appears on the FIRST frame. It
 * must be rendered as a descendant of that `<Link>`; when the ancestor is a
 * plain `<a>` (the Fairway shells accept an injectable link component and
 * default to one for Storybook/tests) the hook simply reports
 * `pending: false`, so this degrades to rendering nothing.
 *
 * Deliberately NOT a spinner-replaces-icon swap: replacing the icon makes the
 * row twitch and reads as an error state. The dot is additive, occupies space
 * that is already reserved, and is suppressed under reduced-motion in favour
 * of a static mark.
 * ========================================================================== */

import { useLinkStatus } from 'next/link';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface NavPendingDotProps {
  /** Extra classes for positioning within the row. */
  className?: string;
}

/**
 * A small pulsing dot shown while the enclosing `<Link>` navigation is in
 * flight. Renders nothing when idle, so it costs no layout when not pending.
 */
export function NavPendingDot({ className }: NavPendingDotProps) {
  const { pending } = useLinkStatus();
  const prefersReducedMotion = useReducedMotion();

  if (!pending) return null;

  return (
    <>
      <span
        aria-hidden
        className={cn(
          'ml-auto inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-nav-accent',
          // Reduced motion still gets the dot — just not the pulse. The signal
          // is "your click registered", which is exactly what a motion-sensitive
          // user still needs.
          prefersReducedMotion ? 'opacity-80' : 'animate-pulse',
          className,
        )}
      />
      {/* The same information the dot carries, for screen readers. Announced
          once when it appears and removed on arrival — not a per-keystroke
          live region. `aria-busy` on the row itself is not reachable here:
          useLinkStatus only reports inside the <Link> subtree, so a hook
          returning props to spread ONTO that <Link> could never see pending. */}
      <span role="status" className="sr-only">
        Loading
      </span>
    </>
  );
}
