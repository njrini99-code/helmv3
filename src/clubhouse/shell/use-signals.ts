'use client';

import { useReportWebVitals } from 'next/web-vitals';
import { useEffect, useRef } from 'react';
import { chSignal, configureSignals, flushSignals } from '../lib/signal';
import { pageForPath } from '../lib/signal-page';

/** Three clicks on the same thing inside this window is a rage click (CH-1951). */
export const RAGE_CLICKS = 3;
export const RAGE_WINDOW_MS = 600;
/** The vitals CH-1954 names: how slow a tap answers, how much the page shifts, how long the main content takes. */
const VITALS = new Set(['INP', 'LCP', 'CLS']);
/** Team switch (Bridge ID 10103, P001): the page reads again for the new team. */
const TEAM_SWITCH = '10103';
/** A page switch slower than this is not a switch (a tab left open, a lost start): it sends no duration. */
export const SWITCH_MAX_MS = 60_000;
/** A working control: a burst of taps on one is a stepper or a counter, not frustration. */
const ENABLED_CONTROL = 'button:not([disabled]):not([aria-disabled="true"]),a[href]:not([aria-disabled="true"]),input,select,textarea,label,[role="button"]:not([aria-disabled="true"])';

/** Where a switch started: when, and the address it was going to. */
type SwitchStart = { at: number; to: string };
/** A view waiting for its page's first frame, with what it will carry. */
type PendingView = { input: { kind: 'view'; code?: string; page: string }; start: number; frame: number };

function trimPath(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * Where an address lands, for switch timing: the path and the Bridge page it is. A query that changes the page
 * (Team stats to one player, `?player=`) is a switch; a query that only filters one page, or a hash, is not.
 */
export function switchKey(pathname: string, search: string, role: string): string {
  return `${trimPath(pathname)}|${pageForPath(pathname, search, role)}`;
}

/**
 * The start of a switch, from a tap on an in-app link: the main button, no modifier, the same tab and origin, and an
 * address other than this one. Anything else (a new tab, a download, a hash on this page) is not a switch.
 */
function linkSwitch(e: MouseEvent, el: Element | null, role: string): SwitchStart | null {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = el?.closest('a[href]');
  if (!(a instanceof HTMLAnchorElement) || a.hasAttribute('download')) return null;
  if (a.target && a.target !== '_self') return null;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return null;
  const to = switchKey(url.pathname, url.search, role);
  return to === switchKey(location.pathname, location.search, role) ? null : { at: performance.now(), to };
}

function reportVital(metric: { name: string; value: number }) {
  if (!VITALS.has(metric.name)) return;
  // CLS is a unitless score: kept as thousandths so it fits the duration histogram's integers.
  chSignal({ kind: 'vital', code: 'CH-1954', act: metric.name, durationMs: metric.name === 'CLS' ? metric.value * 1000 : metric.value });
}

/**
 * The shell's half of the Bridge signals (plan §4.2, E6-E8), mounted once by ClubhouseFrame:
 *
 * - E6: tells the queue whether signals are on (the `clubhouse_signals` switch, read with the shell) and as whom, counts a
 *   view on every address, a team switch as its own view (10103), and the vitals CH-1954 names. A view after a tap on
 *   an in-app link, or after back or forward, carries the switch time (`durationMs`) to the new page's first frame.
 * - E7: a tap on a numbered control (`data-ctl="CTL-P007-004"`) is counted under its control.
 * - E8: three clicks inside 600 ms on the same thing that isn't a working control (a disabled button, a label that looks
 *   like one) is a rage click, CH-1951. A text selection (a triple-click to select a paragraph) is not.
 */
export function useChSignals({ enabled, role, teamId, userId = null, pathname, search }: { enabled: boolean; role: string; teamId: string | null; userId?: string | null; pathname: string; search: string }): void {
  const page = pageForPath(pathname, search, role);
  const lastTeam = useRef<string | null | undefined>(undefined);
  const lastPath = useRef<string | null>(null);
  // The listeners below are added once per enable; they read the role a link's page is judged as from here.
  const roleRef = useRef(role);
  useEffect(() => {
    roleRef.current = role;
  }, [role]);
  const switchStart = useRef<SwitchStart | null>(null);
  const pendingView = useRef<PendingView | null>(null);

  useEffect(() => {
    configureSignals({ enabled, role, teamId, page, userId });
    if (!enabled) return undefined;
    const switched = lastTeam.current !== undefined && lastTeam.current !== teamId;
    lastTeam.current = teamId;
    const input = switched ? { kind: 'view' as const, code: TEAM_SWITCH } : { kind: 'view' as const };
    // Switch time (Bridge Speed): from the tap or the back gesture that changed the address to the new page's first
    // frame (a loading state counts). The first view of a load has none (LCP covers it); a switch with no known start
    // (a push from code), or one slower than SWITCH_MAX_MS, has none either. A start is used once, or dropped.
    const path = `${trimPath(pathname)}|${page}`;
    const moved = lastPath.current !== null && lastPath.current !== path;
    lastPath.current = path;
    const start = switchStart.current;
    switchStart.current = null;
    const known = moved && start !== null && start.to === path && performance.now() - start.at <= SWITCH_MAX_MS;
    if (!known || typeof requestAnimationFrame !== 'function' || document.visibilityState === 'hidden') {
      chSignal(input);
      return undefined;
    }
    const pending: PendingView = { input: { ...input, page }, start: start.at, frame: 0 };
    pendingView.current = pending;
    // Two frames: the first runs before the new page paints, the second after it has.
    pending.frame = requestAnimationFrame(() => {
      pending.frame = requestAnimationFrame(() => {
        if (pendingView.current !== pending) return;
        pendingView.current = null;
        const durationMs = performance.now() - pending.start;
        chSignal(durationMs <= SWITCH_MAX_MS ? { ...pending.input, durationMs } : pending.input);
      });
    });
    return () => {
      // Left before it painted (another switch, a team change, the shell going away): the view still counts, untimed.
      if (pendingView.current !== pending) return;
      pendingView.current = null;
      cancelAnimationFrame(pending.frame);
      chSignal(pending.input);
    };
  }, [enabled, role, teamId, userId, page, pathname]);

  useReportWebVitals(reportVital);

  useEffect(() => {
    if (!enabled) return undefined;
    let streak: { target: Element; first: number; count: number } | null = null;
    const onClick = (e: MouseEvent) => {
      try {
        const el = e.target instanceof Element ? e.target : null;
        const start = linkSwitch(e, el, roleRef.current);
        if (start) switchStart.current = start;
        if (!el?.closest('[data-ui="clubhouse"]')) return;
        const control = el.closest('[data-ctl]')?.getAttribute('data-ctl') ?? undefined;
        if (control) chSignal({ kind: 'tap', control });
        if (el.closest(ENABLED_CONTROL)) {
          streak = null;
          return;
        }
        const now = e.timeStamp || performance.now();
        if (streak && streak.target === el && now - streak.first <= RAGE_WINDOW_MS) streak.count += 1;
        else streak = { target: el, first: now, count: 1 };
        if (streak.count === RAGE_CLICKS && window.getSelection()?.isCollapsed !== false) chSignal({ kind: 'frustration', code: 'CH-1951', control });
      } catch {
        // A signal never gets in the way of a tap.
      }
    };
    // Back and forward (the edge swipe, the phone's back button) start a switch; the browser has already moved the
    // address, so that is where it goes. A step between hashes on one page is not a switch.
    const onPopState = () => {
      try {
        const to = switchKey(location.pathname, location.search, roleRef.current);
        if (to !== lastPath.current) switchStart.current = { at: performance.now(), to };
      } catch {
        // A signal never gets in the way of going back.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      // A switch started and then put away would time the time away: drop its start, and send a waiting view untimed.
      switchStart.current = null;
      const pending = pendingView.current;
      if (!pending) return;
      pendingView.current = null;
      cancelAnimationFrame(pending.frame);
      chSignal(pending.input);
      flushSignals();
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('visibilitychange', onVisibility);
      switchStart.current = null;
      flushSignals();
    };
  }, [enabled]);
}
