'use client';

// =============================================================================
// src/hooks/use-baseball-nav-context.ts
//
// Routes & Nav — capability context wiring (post-build review fix, critical).
//
// Client hook the baseball dashboard layouts use to obtain the SERVER-RESOLVED
// nav context (role + real capability map) so capability-gated coach verticals
// actually appear in the sidebar + mobile nav. Without this, the shell fell back
// to an empty capability map and fail-closed every gated entry (see
// src/lib/baseball/nav-context.ts for the full bug write-up).
//
// WHY A HOOK (not a server component)
//   The dashboard layouts are client components: they own the useBaseballAuth
//   loading/redirect gate (fast-path from the persisted auth store, no layout
//   flash). Converting them to server components would lose that. Instead this
//   hook does one tiny server hop (getBaseballNavContext) and hands the layout a
//   resolved context to pass into <BaseballDashboardShell navContext=... />.
//
// CACHING / FLICKER
//   - The resolved context is cached at module scope, keyed by auth user id, so
//     route-to-route navigations inside the dashboard do NOT re-hit the server
//     and the gated entries never flicker in/out.
//   - While the first resolve is in flight, `navContext` is null and `loading`
//     is true; the shell renders its fail-closed role-only fallback (gated
//     entries hidden) until the real map lands — never a wrong-but-permissive
//     state.
//   - The cache is invalidated automatically when the auth user id changes
//     (sign-out / account switch), so a new user never inherits stale caps.
//
// SECURITY: capabilities come only from the server resolver; the client never
// asserts a capability. Nav filtering is a UX affordance — gated routes are
// enforced server-side regardless (see nav-registry.ts).
// =============================================================================

import { useEffect, useState } from 'react';
import { getBaseballNavContext } from '@/lib/baseball/nav-context';
import type { BaseballNavContext } from '@/lib/baseball/nav-registry';
import { useAuthStore } from '@/stores/auth-store';

interface NavContextResult {
  /** Fully server-resolved nav context, or null until the first resolve lands. */
  navContext: BaseballNavContext | null;
  /** True until the first server resolve settles (success or failure). */
  loading: boolean;
}

// Module-scope cache so dashboard route changes don't re-resolve capabilities.
// Keyed by auth user id so a different signed-in user never reads stale caps.
const NAV_CACHE_TTL_MS = 5000;
let cacheUserId: string | null = null;
let cachedContext: BaseballNavContext | null = null;
let cacheResolvedAt = 0;
let inflight: Promise<BaseballNavContext | null> | null = null;

function clearNavContextCache() {
  cacheUserId = null;
  cachedContext = null;
  cacheResolvedAt = 0;
  inflight = null;
}

function hasWarmNavCache(userId: string | null): boolean {
  return (
    userId !== null &&
    userId === cacheUserId &&
    cachedContext !== null &&
    Date.now() - cacheResolvedAt < NAV_CACHE_TTL_MS
  );
}

function resolveForUser(userId: string | null): Promise<BaseballNavContext | null> {
  if (hasWarmNavCache(userId)) {
    return Promise.resolve(cachedContext);
  }

  if (userId === null) {
    return Promise.resolve(null);
  }

  // Same user + a resolve already in flight → share it (dedupe concurrent mounts).
  if (userId === cacheUserId && inflight) {
    return inflight;
  }

  // New user (or first resolve): reset cache and start a fresh server hop.
  cacheUserId = userId;
  cachedContext = null;
  cacheResolvedAt = 0;
  inflight = getBaseballNavContext()
    .then((ctx) => {
      // Only commit if the user hasn't changed underneath us.
      if (cacheUserId === userId) {
        cachedContext = ctx;
        cacheResolvedAt = Date.now();
      }
      return ctx;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Resolve the baseball nav context (role + real capability map) for the current
 * user. While resolving, returns `{ navContext: null, loading: true }` and the
 * shell renders its fail-closed fallback. After resolve, gated coach entries the
 * user actually holds become visible.
 */
export function useBaseballNavContext(): NavContextResult {
  // Track the auth user id so a sign-out / account switch invalidates the cache.
  const userId = useAuthStore((s) => s.user?.id ?? null);

  const [navContext, setNavContext] = useState<BaseballNavContext | null>(() =>
    hasWarmNavCache(userId) ? cachedContext : null,
  );
  const [loading, setLoading] = useState<boolean>(() => !hasWarmNavCache(userId));

  useEffect(() => {
    let alive = true;

    if (userId === null && cacheUserId !== null) {
      clearNavContextCache();
    }

    if (userId === null) {
      setNavContext(null);
      setLoading(true);
      return;
    }

    if (hasWarmNavCache(userId)) {
      setNavContext(cachedContext);
      setLoading(false);
      return;
    }

    setLoading(true);
    void resolveForUser(userId).then((ctx) => {
      if (!alive) return;
      setNavContext(ctx);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [userId]);

  return { navContext, loading };
}
