'use client';

import { useEffect } from 'react';

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * The sign in's painted course, fetched while the landing page sits idle. The course is its own chunk (SceneMount, so
 * the form never waits for it), and a tap on Log in asked for it only once /golf/login had mounted: for its first 300ms
 * the sign in showed the daytime still, then the real hour's sky snapped in over it (WebKit film, 2026-11-12, 16:20 ET:
 * day, then gold; owner: "landing > sign in glitchy"). With the chunk already here the course draws on the first frame.
 * Rendered by the landing route only when the Clubhouse front door is on. Safari has no requestIdleCallback: a timer.
 */
export function SignInScenePreload() {
  useEffect(() => {
    const load = () => {
      void import('./GolfScene').catch(() => {
        // A failed preload costs nothing: SceneMount asks again on the sign in.
      });
    };
    const w = window as IdleWindow;
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(load, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(load, 1500);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
