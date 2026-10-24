'use client';

/**
 * A Back the browser has already animated (CH-1908). On iOS, Safari and the app's WebView play the edge swipe
 * themselves, sliding the page off over a snapshot of the one underneath, then fire popstate with
 * `hasUAVisualTransition` (Safari 18 and later). Animating that Back again would show it twice, so for a moment
 * afterwards Clubhouse's own exit is instant: a pushed phone screen leaves at once (PhoneScreen), and the page
 * crossfade doesn't run (`data-ch-ua-pop` on <html>, shell.css). Elsewhere the flag never arrives and nothing changes.
 */
const UA_POP_MS = 1000;
let uaPopAt = -Infinity;
let clearAt = 0;

function mark() {
  uaPopAt = performance.now();
  const root = document.documentElement;
  root.setAttribute('data-ch-ua-pop', '');
  window.clearTimeout(clearAt);
  clearAt = window.setTimeout(() => root.removeAttribute('data-ch-ua-pop'), UA_POP_MS);
}

function onPopState(e: PopStateEvent) {
  if ((e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition) mark();
}

/**
 * A Back that Clubhouse's own swipe already drew (use-route-swipe.ts, C1): the same as one the browser animated, so the
 * pop and the page crossfade that would follow it don't run a second time.
 */
export function markHandPop(): void {
  if (typeof window !== 'undefined') mark();
}

// Capture, so it is known before the router and usePhoneStackHistory act on the same popstate.
if (typeof window !== 'undefined') window.addEventListener('popstate', onPopState, true);

/** Whether the browser itself just animated a Back, so the page's own exit should not run again. */
export function poppedByUA(): boolean {
  return performance.now() - uaPopAt < UA_POP_MS;
}
