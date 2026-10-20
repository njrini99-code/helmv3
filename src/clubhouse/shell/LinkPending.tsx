'use client';

import { useLinkStatus } from 'next/link';

/**
 * The tap landed, before the page has. Rendered inside a nav `<Link>` (the sidebar, the tab bar, the phone's More
 * sheet): while that navigation is in flight, `useLinkStatus` reports pending and this marks the row
 * (`.ch-navitem:has(.ch-lp)` in shell.css takes the selected look at once, as a native tab bar does) and draws a
 * hairline across the top of the page that only shows if the wait passes 120ms, so a prefetched page never flickers
 * it. Nothing renders when idle; the screen-reader status says "Loading" once.
 *
 * Next's guidance for dynamic routes on slow networks (`useLinkStatus`, a debounced hint): docs/clubhouse/PROGRESS.md
 * "Page transitions" (2026-10-01).
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span className="ch-lp" aria-hidden="false">
      <span className="ch-lp__bar" aria-hidden="true" />
      <span role="status" className="ch-sr-only">
        Loading
      </span>
    </span>
  );
}
