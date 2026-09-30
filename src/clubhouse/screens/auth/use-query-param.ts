'use client';

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}

/**
 * One query parameter of the page's own URL, null on the server and during
 * hydration. It is read through the browser rather than Next's
 * `useSearchParams` on purpose: that hook makes a statically prerendered page
 * render only its Suspense fallback on the server, so the sign-in form would
 * not be in the HTML at all until the client had booted. This way the form is
 * server-rendered, and the few things that depend on the URL (the invite
 * returnTo, the demo ref, a `?message=` notice) land right after hydration.
 */
export function useQueryParam(name: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
}
