'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** The sign-in panel's views (CH-15920): the sign-in form, the reset form, and its check-your-email. */
export type AuthView = 'signin' | 'forgot' | 'sent';

const PARAM = 'view';

const urlWantsForgot = () => new URLSearchParams(window.location.search).get(PARAM) === 'forgot';

function urlWith(forgot: boolean): string {
  const url = new URL(window.location.href);
  if (forgot) url.searchParams.set(PARAM, 'forgot');
  else url.searchParams.delete(PARAM);
  return url.pathname + url.search + url.hash;
}

/**
 * Which view the panel shows, kept in the URL (`?view=forgot`, both reset views) so the browser's Back returns to sign
 * in and a reload or a link opens the reset form. The server always draws sign in; the URL is read after hydration.
 * `before` runs ahead of every change (the stage captures its glide there). `moved` stays false until the view first
 * changes, so first paint moves no focus. `dir` is the direction of travel for the panel's slide.
 */
export function useAuthView(before: () => void) {
  const [view, setView] = useState<AuthView>('signin');
  const [dir, setDir] = useState<1 | -1>(1);
  const [moved, setMoved] = useState(false);
  const current = useRef<AuthView>('signin');
  // True while the reset form's history entry sits on top of sign in's, so leaving pops it rather than stacking another.
  const pushed = useRef(false);

  const go = useCallback(
    (next: AuthView, d: 1 | -1) => {
      if (current.current === next) return;
      before();
      current.current = next;
      setDir(d);
      setView(next);
      setMoved(true);
    },
    [before],
  );

  useEffect(() => {
    const sync = (e?: PopStateEvent) => {
      const forgot = urlWantsForgot();
      if (forgot && current.current === 'signin') {
        // Forward onto the reset entry: sign in's entry is behind it again. A first load straight onto it has none.
        pushed.current = !!e;
        go('forgot', 1);
      } else if (!forgot && current.current !== 'signin') {
        pushed.current = false;
        go('signin', -1);
      }
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [go]);

  const openForgot = useCallback(() => {
    if (current.current !== 'signin') return;
    window.history.pushState(null, '', urlWith(true));
    pushed.current = true;
    go('forgot', 1);
  }, [go]);

  const showSent = useCallback(() => go('sent', 1), [go]);

  const backToSignIn = useCallback(() => {
    if (current.current === 'signin') return;
    go('signin', -1);
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else window.history.replaceState(null, '', urlWith(false));
  }, [go]);

  return { view, dir, moved, openForgot, showSent, backToSignIn };
}
