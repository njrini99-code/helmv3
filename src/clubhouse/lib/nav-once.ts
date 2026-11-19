'use client';

import { useCallback, useEffect, useRef } from 'react';
import { CH_PUSH_MS } from './motion';
import { chNavKind } from './nav-motion';

/** How long a navigation stays "on its way" if the address never changes (a refused or slow navigation). */
const HOLD_MS = 1000;
/**
 * How long after the tap that started a navigation a second tap is still taken for the same intent: a double tap's
 * second tap comes within about 300 ms of its first (UIKit's double-tap window is 0.35 s). On a prefetched page the new
 * page commits about 80 ms after the tap, so without this the second tap of a double tap landed on the new page
 * (audit 2026-11-18: a rounds row's second tap opened the course page; Home's Message team pushed twice).
 */
const DOUBLE_TAP_MS = 350;

/** What a tap can activate: every link and button, and the roles that stand in for them. */
const ACTIVATES = 'a[href], button, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="option"], summary';

/** The navigation under way: its address and when it started. Null when none is. */
let pending: { key: string; at: number } | null = null;
/** After the page commits, taps stay held until then (the rest of the double-tap window, or the push still sliding). */
let quietUntil = 0;
/** A link click seen at capture that will start a navigation unless something below swallows it. */
let candidate: { event: MouseEvent; key: string; at: number; x: number; y: number } | null = null;
/**
 * Where the tap that started the hold landed, or null when the hold came from code (a push) and covers every tap. A double
 * tap's second tap lands where its first did; a tap somewhere else is a person changing their mind (Stats, then Calendar a
 * moment later), which iOS's tab bar always answers. Measured 2026-11-19 (WebKit desk): with every tap held, Calendar
 * 200 ms after Stats was dropped and the desk stayed on Stats.
 */
let heldAt: { x: number; y: number } | null = null;
/** How far a second tap may land from the first and still be its twin, in CSS px (a fingertip's slop). */
const TWIN_PX = 24;

const here = () => location.pathname + location.search;
const keyOf = (href: string) => {
  const url = new URL(href, location.href);
  return { url, key: url.pathname + url.search };
};

/** Whether a navigation is on its way, or has just landed and the tap that started it may still have a twin. */
export function chNavHeld(now: number = performance.now()): boolean {
  if (pending && now - pending.at >= HOLD_MS) pending = null;
  return !!pending || now < quietUntil;
}

/** A navigation started (a link's click, or a push in code): the shared hold starts. Same address: nothing to hold. */
export function chNavStarted(href: string, now: number = performance.now()): void {
  const { key } = keyOf(href);
  if (key === here()) return;
  pending = { key, at: now };
  quietUntil = Math.max(quietUntil, now + DOUBLE_TAP_MS);
  heldAt = null;
}

/**
 * The page committed (ClubhouseFrame's pathname or search changed). The hold ends, but not before the double-tap
 * window has passed, and on a phone not while the push still slides the new page in under the finger (lib/nav-motion.ts).
 */
export function chNavCommitted(now: number = performance.now()): void {
  if (!pending) return;
  const push = chNavKind() === 'push' ? now + CH_PUSH_MS : 0;
  quietUntil = Math.max(quietUntil, pending.at + DOUBLE_TAP_MS, push);
  pending = null;
}

/** Test seam: forget every hold. */
export function chNavOnceReset(): void {
  pending = null;
  quietUntil = 0;
  candidate = null;
  heldAt = null;
}

function onClickCapture(e: MouseEvent) {
  candidate = null;
  if (e.button !== 0) return;
  const el = e.target instanceof Element ? e.target : null;
  if (!el?.closest("[data-ui='clubhouse']")) return;
  const control = el.closest(ACTIVATES);
  if (!control) return;
  // A pushed page's Back is left alone: a Back during a push reverses it from where it stands (takeRunningPush). A tap well
  // away from the one that started the hold is a new choice, not its twin, and goes through.
  const twin = !heldAt || Math.hypot(e.clientX - heldAt.x, e.clientY - heldAt.y) <= TWIN_PX;
  if (chNavHeld() && twin && !control.closest('.ch-pbar__back')) {
    // A second activation while a navigation is on its way: dropped, before Next's Link, the navigation classifier and
    // any React onClick (stopPropagation at window capture reaches none of them).
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = control.closest<HTMLAnchorElement>('a[href]');
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
  const { url, key } = keyOf(a.href);
  // A hash on this page, or this page again (a retapped tab), is not a navigation: nothing to hold.
  if (url.origin !== location.origin || key === here()) return;
  candidate = { event: e, key, at: performance.now(), x: e.clientX, y: e.clientY };
}

/**
 * The same click as it leaves the document: it reached the link, so the navigation starts. A row that swallowed it (a
 * peek's hold, a swipe row's drag: stopPropagation) never gets here, and nothing is held.
 */
function onClickBubble(e: MouseEvent) {
  const c = candidate;
  candidate = null;
  if (!c || c.event !== e) return;
  pending = { key: c.key, at: c.at };
  quietUntil = Math.max(quietUntil, c.at + DOUBLE_TAP_MS);
  heldAt = { x: c.x, y: c.y };
}

/**
 * The same guard for a navigation in code (a segment's `router.push`), per component: a second push of the same
 * address within the hold is dropped (F-0026), and the push holds every other tap as a link's does. Returns the push to call.
 */
export function usePushOnce<R>(router: { push: (href: string, options?: { scroll?: boolean }) => R }) {
  const last = useRef<{ key: string; at: number } | null>(null);
  return useCallback(
    // The push's own result goes back, so a transition that awaits it (Stats' busy mark) still does.
    (href: string, options?: { scroll?: boolean }): R | undefined => {
      const { key } = keyOf(href);
      const now = performance.now();
      if (last.current && last.current.key === key && now - last.current.at < HOLD_MS) return undefined;
      last.current = { key, at: now };
      chNavStarted(href, now);
      // No options, no second argument: the router is called exactly as a plain push would call it.
      return options ? router.push(href, options) : router.push(href);
    },
    [router],
  );
}

/**
 * One navigation per intent (F-0026; audit 2026-11-18, P1): while a navigation is on its way, a second activation of any
 * link or button in Clubhouse is dropped, so a quick double tap neither pushes the same page twice nor lands its second
 * tap on whatever the first one opened. The hold starts when a link's click reaches it (or a `usePushOnce` push) and
 * ends when the address changes, but not before the double-tap window from the first tap has passed, nor while a
 * phone push is still sliding; a navigation that never commits lets go after a second. Window capture, so it runs
 * before the navigation classifier (lib/nav-motion.ts, document capture), Next's Link and every React handler.
 */
export function useNavOnce(pathname: string, search: string): void {
  useEffect(() => {
    window.addEventListener('click', onClickCapture, true);
    window.addEventListener('click', onClickBubble);
    return () => {
      window.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('click', onClickBubble);
    };
  }, []);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    chNavCommitted();
  }, [pathname, search]);
}
