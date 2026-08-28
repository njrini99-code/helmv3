'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { describeError } from '@/lib/utils/describe-error';

const HEARTBEAT_INTERVAL = 60000; // 1 minute
const INITIAL_HEARTBEAT_DELAY = 5000;

/**
 * Hook to track user online presence
 * Sends periodic heartbeats to update last_seen timestamp
 */
export function usePresence() {
  // The lazy initializer creates exactly one browser client for this hook
  // instance. Calling createClient() directly during render would create a new
  // client on every render and repeatedly restart this effect.
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    let active = true;
    let authenticatedUserId: string | null = null;
    let authRevision = 0;
    let initialTimeout: ReturnType<typeof setTimeout> | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;

    const stopTimers = () => {
      if (initialTimeout) {
        clearTimeout(initialTimeout);
        initialTimeout = null;
      }
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const sendHeartbeat = async () => {
      const userId = authenticatedUserId;
      if (!active || !userId) return;

      try {
        // Take the session immediately BEFORE the call, not just once when the
        // timers started.
        //
        // `startTimers` confirms the user with `getUser()` and then fires every
        // 60 seconds for as long as the page lives. The access token can expire
        // inside any one of those gaps — reliably so on iOS WKWebView, where a
        // backgrounded tab misses the auto-refresh window and comes back with a
        // dead JWT. PostgREST then evaluates the call as `anon`, and
        // `public.heartbeat()` grants EXECUTE to `authenticated` and
        // `service_role` only, so it comes back `42501 permission denied for
        // function heartbeat`.
        //
        // That is not a grant to widen: `heartbeat` is SECURITY DEFINER and
        // writing presence for an unauthenticated caller is exactly what the
        // missing grant is preventing (`.claude/rules/shipping.md` — never
        // grant `anon` EXECUTE on a SECURITY DEFINER function). The call simply
        // should not be made without a live token.
        //
        // `getSession()` reads local state and refreshes an expired token
        // rather than round-tripping Auth every minute, so this is cheap and
        // also repairs the common case instead of only detecting it. The error
        // branch below stays as the backstop for a token that dies between
        // this check and the RPC.
        //
        // Measured 2026-08-27: 10 occurrences across the two round pages in
        // 72h, still firing. Handled correctly by this hook — it stops the
        // timers — but `@supabase/supabase-js/tracing` reports the failed RPC
        // to Sentry independently of our handling, so a silently-correct
        // recovery still surfaced as a production error.
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (!active || authenticatedUserId !== userId) return;
        if (sessionError || !session?.access_token || session.user?.id !== userId) {
          console.debug('[Presence] Skipping heartbeat — no live session for this user.');
          authenticatedUserId = null;
          stopTimers();
          return;
        }

        const { error } = await supabase.rpc('heartbeat');
        if (!error) return;

        console.debug('[Presence] Heartbeat failed:', describeError(error));

        // Supabase RPC failures resolve through `error` rather than throwing.
        // Re-check auth so an expired/signed-out session cannot keep emitting
        // anonymous heartbeat attempts. A transport failure leaves the current
        // authenticated state intact and the next scheduled tick may retry.
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (
          active &&
          authenticatedUserId === userId &&
          !authError &&
          (!user || user.id !== userId)
        ) {
          authenticatedUserId = null;
          stopTimers();
        }
      } catch (error) {
        // Silently fail - presence is non-critical
        console.debug('[Presence] Heartbeat failed:', describeError(error));
      }
    };

    const startTimers = (userId: string) => {
      if (!active || (authenticatedUserId === userId && (initialTimeout || interval))) {
        return;
      }
      stopTimers();
      authenticatedUserId = userId;

      // PERF: Defer initial heartbeat so it does not compete with critical
      // dashboard data fetching during page load.
      initialTimeout = setTimeout(() => {
        initialTimeout = null;
        void sendHeartbeat();
      }, INITIAL_HEARTBEAT_DELAY);
      interval = setInterval(() => {
        void sendHeartbeat();
      }, HEARTBEAT_INTERVAL);
    };

    const stopPresence = () => {
      authenticatedUserId = null;
      stopTimers();
    };

    const confirmAuthenticatedUser = (expectedUserId: string, revision: number) => {
      void supabase.auth.getUser().then(({ data: { user }, error }) => {
        if (!active || authRevision !== revision) return;
        if (error || !user || user.id !== expectedUserId) {
          stopPresence();
          return;
        }
        startTimers(user.id);
      }).catch((error: unknown) => {
        // Auth lookup failure is non-critical, but it must never fall through
        // to scheduling an anonymous heartbeat.
        console.debug('[Presence] Auth check failed:', describeError(error));
        if (active && authRevision === revision) stopPresence();
      });
    };

    // Also send heartbeat on visibility change (when user returns to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && authenticatedUserId) {
        void sendHeartbeat();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Subscribe before the initial auth lookup so a sign-out that happens
    // while getUser() is in flight wins over that stale response.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      authRevision += 1;
      if (session?.user) {
        // Session events can originate from locally cached state. Verify the
        // JWT with Auth before allowing even the first heartbeat.
        confirmAuthenticatedUser(session.user.id, authRevision);
      } else {
        stopPresence();
      }
    });

    const initialAuthRevision = authRevision;
    void supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (!active || authRevision !== initialAuthRevision) return;
      if (error || !user) {
        stopPresence();
        return;
      }
      startTimers(user.id);
    }).catch((error: unknown) => {
      console.debug('[Presence] Auth check failed:', describeError(error));
      if (active && authRevision === initialAuthRevision) stopPresence();
    });

    return () => {
      active = false;
      stopPresence();
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [supabase]);
}

/**
 * Check if a user is considered online
 * @param lastSeen - The user's last_seen timestamp
 * @param thresholdMinutes - How many minutes of inactivity before considered offline (default: 5)
 */
export function isUserOnline(lastSeen: string | null, thresholdMinutes: number = 5): boolean {
  if (!lastSeen) return false;

  const lastSeenDate = new Date(lastSeen);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastSeenDate.getTime()) / (1000 * 60);

  return diffMinutes < thresholdMinutes;
}
