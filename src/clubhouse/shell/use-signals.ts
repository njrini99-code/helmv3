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
/** A working control: a burst of taps on one is a stepper or a counter, not frustration. */
const ENABLED_CONTROL = 'button:not([disabled]):not([aria-disabled="true"]),a[href]:not([aria-disabled="true"]),input,select,textarea,label,[role="button"]:not([aria-disabled="true"])';

function reportVital(metric: { name: string; value: number }) {
  if (!VITALS.has(metric.name)) return;
  // CLS is a unitless score: kept as thousandths so it fits the duration histogram's integers.
  chSignal({ kind: 'vital', code: 'CH-1954', act: metric.name, durationMs: metric.name === 'CLS' ? metric.value * 1000 : metric.value });
}

/**
 * The shell's half of the Bridge signals (plan §4.2, E6-E8), mounted once by ClubhouseFrame:
 *
 * - E6: tells the queue whether signals are on (the `clubhouse_signals` switch, read with the shell) and as whom, counts a
 *   view on every address, a team switch as its own view (10103), and the vitals CH-1954 names.
 * - E7: a tap on a numbered control (`data-ctl="CTL-P007-004"`) is counted under its control.
 * - E8: three clicks inside 600 ms on the same thing that isn't a working control (a disabled button, a label that looks
 *   like one) is a rage click, CH-1951. A text selection (a triple-click to select a paragraph) is not.
 */
export function useChSignals({ enabled, role, teamId, pathname, search }: { enabled: boolean; role: string; teamId: string | null; pathname: string; search: string }): void {
  const page = pageForPath(pathname, search, role);
  const lastTeam = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    configureSignals({ enabled, role, teamId, page });
    if (!enabled) return;
    const switched = lastTeam.current !== undefined && lastTeam.current !== teamId;
    lastTeam.current = teamId;
    chSignal(switched ? { kind: 'view', code: TEAM_SWITCH } : { kind: 'view' });
  }, [enabled, role, teamId, page, pathname]);

  useReportWebVitals(reportVital);

  useEffect(() => {
    if (!enabled) return undefined;
    let streak: { target: Element; first: number; count: number } | null = null;
    const onClick = (e: MouseEvent) => {
      try {
        const el = e.target instanceof Element ? e.target : null;
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
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      flushSignals();
    };
  }, [enabled]);
}
