/**
 * Session Activity Tracking
 *
 * Enforces an idle-session timeout: after SESSION_IDLE_TIMEOUT_MS of
 * no user activity while the tab is hidden, the user is signed out and must log
 * in again. While the tab is visible, a heartbeat keeps the session alive so
 * reading a dashboard without mouse/keyboard does not log the user out. Shares the
 * `sb_last_activity` cookie with the server middleware, which enforces the same
 * window on navigations/reopens — this hook covers the "app stays open but idle"
 * and "mobile reopen from background (bfcache — no network request)" cases the
 * server can't see.
 */

'use client';

import { useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  DEMO_SESSION_IDLE_TIMEOUT_MS,
  SESSION_IDLE_COOKIE,
  SESSION_IDLE_COOKIE_MAX_AGE_S,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_VISIBLE_HEARTBEAT_MS,
  isSessionIdleExpired,
  parseLastActivity,
} from '@/lib/auth/session-idle-shared';
import { isDemoMetadataUser, probeSignedIn, raceWithTimeout } from '@/lib/demo/gate-probe';

const ACTIVITY_CHECK_INTERVAL_MS = 60 * 1000; // Re-check every minute

/** Read the last-activity timestamp (epoch ms) from the shared cookie, or null. */
function getLastActivity(): number | null {
  if (typeof document === 'undefined') return null;

  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === SESSION_IDLE_COOKIE) return parseLastActivity(value);
  }
  return null;
}

/**
 * Write the last-activity timestamp to the shared cookie.
 *
 * NOT httpOnly (the client owns it) and long-lived (max-age, not expires-at-
 * timeout) so the timestamp survives an idle gap and can be detected as stale.
 * `Secure` only on https so it still works on http://localhost in dev.
 */
function updateLastActivity(): void {
  if (typeof document === 'undefined') return;

  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie =
    `${SESSION_IDLE_COOKIE}=${Date.now()}; path=/; max-age=${SESSION_IDLE_COOKIE_MAX_AGE_S}; SameSite=Lax${secure}`;
}

/** Clear the activity marker. */
function clearLastActivity(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_IDLE_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

/** True when the session has been idle past the given window. */
function isSessionTimedOut(timeoutMs: number): boolean {
  return isSessionIdleExpired(getLastActivity(), Date.now(), timeoutMs);
}

/**
 * Resolve which idle window applies to the CURRENT session: demo sessions
 * (user_metadata.is_demo, stamped by the demo gates) get the longer demo
 * window; everyone else gets the standard one.
 *
 * Reads the LOCAL session via getSession() — no auth-server round-trip on
 * page mount (this hook runs on every dashboard page; adding a network
 * getUser() here would worsen the exact burst-load profile the demo window
 * exists to survive). Timeout-guarded so a stuck read degrades to the
 * standard window instead of hanging the hook.
 */
async function resolveIdleTimeoutMs(
  supabase: ReturnType<typeof createClient>,
): Promise<number> {
  try {
    const {
      data: { session },
    } = await raceWithTimeout(supabase.auth.getSession(), 4000);
    return isDemoMetadataUser(session?.user)
      ? DEMO_SESSION_IDLE_TIMEOUT_MS
      : SESSION_IDLE_TIMEOUT_MS;
  } catch {
    return SESSION_IDLE_TIMEOUT_MS;
  }
}

/**
 * React hook for automatic idle-session timeout + activity tracking.
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   useSessionActivity();
 *   return <div>...</div>;
 * }
 * ```
 */
export function useSessionActivity() {
  const router = useRouter();
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Which idle window applies to this session (demo sessions get the longer
  // one). Starts at the standard window; resolved properly on mount BEFORE the
  // first staleness decision (see the effect's init below).
  const idleTimeoutMsRef = useRef<number>(SESSION_IDLE_TIMEOUT_MS);
  // Memoize — createClient() returns a fresh client per call; without this the
  // callbacks below would re-create on every render.
  const supabase = useMemo(() => createClient(), []);

  const handleLogout = useCallback(async () => {
    const path = window.location.pathname;
    const sport = path.startsWith('/golf')
      ? 'golf'
      : path.startsWith('/lifting')
        ? 'lifting'
        : path.startsWith('/baseball')
          ? 'baseball'
          : null;

    // A demo visitor never had a password — /login is a dead end for them.
    // Resolve demo-context BEFORE signing out (the metadata this reads only
    // exists on the still-live session); probeSignedIn is hard-timeout-guarded
    // so a stuck check can never block the logout itself (#918).
    const isDemo =
      (sport === 'golf' || sport === 'baseball') &&
      isDemoMetadataUser(await probeSignedIn(supabase));

    clearLastActivity();
    try {
      await supabase.auth.signOut();
    } catch {
      /* best-effort — still redirect to the login screen below */
    }

    if (path.startsWith('/admin')) {
      const params = new URLSearchParams({ message: 'session_expired', returnTo: path });
      router.replace(`/golf/login?${params.toString()}`);
      return;
    }

    if (isDemo && (sport === 'golf' || sport === 'baseball')) {
      // replace() so the back button doesn't return to the timed-out page.
      router.replace(`/${sport}/demo?message=demo_session_expired`);
      return;
    }

    // replace() so the back button doesn't return to the timed-out page.
    router.replace(`/${sport ?? 'baseball'}/login?message=session_expired`);
  }, [router, supabase]);

  const checkSessionTimeout = useCallback(async () => {
    if (isSessionTimedOut(idleTimeoutMsRef.current)) {
      await handleLogout();
    }
  }, [handleLogout]);

  useEffect(() => {
    let disposed = false;
    const disposers: Array<() => void> = [];

    // Setup is deferred behind an async init: the idle window must be resolved
    // (demo vs standard) BEFORE the mount staleness check, or a demo visitor
    // reopening after 10 quiet minutes — well inside the 30-min demo window —
    // would be booted by the default 5-minute one.
    const setup = () => {
    // Fresh/bootstrap: record activity now.
    updateLastActivity();

    let visibleHeartbeatRef: ReturnType<typeof setInterval> | null = null;

    const stopVisibleHeartbeat = () => {
      if (visibleHeartbeatRef) {
        clearInterval(visibleHeartbeatRef);
        visibleHeartbeatRef = null;
      }
    };

    const startVisibleHeartbeat = () => {
      if (visibleHeartbeatRef || document.visibilityState !== 'visible') return;
      visibleHeartbeatRef = setInterval(() => {
        if (document.visibilityState !== 'visible') {
          stopVisibleHeartbeat();
          return;
        }
        if (isSessionTimedOut(idleTimeoutMsRef.current)) {
          void handleLogout();
          return;
        }
        updateLastActivity();
      }, SESSION_VISIBLE_HEARTBEAT_MS);
    };

    const syncTabVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (isSessionTimedOut(idleTimeoutMsRef.current)) {
          void handleLogout();
          return;
        }
        updateLastActivity();
        startVisibleHeartbeat();
      } else {
        stopVisibleHeartbeat();
      }
    };

    // Periodic check catches hidden-tab idle (heartbeat is paused while hidden).
    checkIntervalRef.current = setInterval(() => {
      void checkSessionTimeout();
    }, ACTIVITY_CHECK_INTERVAL_MS);

    // Track real user interaction. Throttled so we don't rewrite the cookie on
    // every mousemove.
    const activityEvents = [
      'pointerdown',
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click',
    ] as const;

    let lastUpdate = Date.now();
    const throttleMs = 10 * 1000; // at most one cookie write / 10s

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastUpdate >= throttleMs) {
        updateLastActivity();
        lastUpdate = now;
      }
    };

    activityEvents.forEach((event) => {
      // Capture is intentional: navigation controls can start a server request
      // from their React click handler. Record the interaction before that
      // request reaches middleware so an active user's click can never be
      // mistaken for idle time.
      window.addEventListener(event, handleActivity, { passive: true, capture: true });
    });

    // Mobile Safari / PWA reopen restores from bfcache WITHOUT a network request,
    // so the server middleware never sees it. Re-check when the tab becomes visible
    // again (visibilitychange) or is restored (pageshow).
    syncTabVisibility();
    document.addEventListener('visibilitychange', syncTabVisibility);
    window.addEventListener('pageshow', syncTabVisibility);

    disposers.push(() => {
      stopVisibleHeartbeat();
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleActivity, { capture: true });
      });
      document.removeEventListener('visibilitychange', syncTabVisibility);
      window.removeEventListener('pageshow', syncTabVisibility);
    });
    };

    // NO logout decision at mount. A fresh page load only reaches this hook
    // because the MIDDLEWARE already ran its idle check (with the
    // last_sign_in_at guard) and let the page render — second-guessing it here
    // with the 30-day sb_last_activity marker booted freshly-signed-in users
    // whose marker predated the new session (2026-07-20 "signed out after ~2
    // minutes" incident). The genuinely-client-only stale case — a bfcache /
    // hidden-tab restore with NO network request — is still caught by
    // syncTabVisibility (visibilitychange/pageshow), which checks staleness
    // BEFORE any marker write. The window is resolved before setup() so that
    // first visibility check already uses the demo-aware timeout.
    const init = async () => {
      idleTimeoutMsRef.current = await resolveIdleTimeoutMs(supabase);
      if (disposed) return;
      setup();
    };

    void init();

    return () => {
      disposed = true;
      disposers.forEach((dispose) => dispose());
    };
  }, [handleLogout, checkSessionTimeout, supabase]);

  return null;
}
