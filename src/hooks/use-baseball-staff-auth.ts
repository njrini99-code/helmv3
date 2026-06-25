'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
// V11 capability key TYPE sourced from the capabilities module (the V11 source
// of truth). Type-only import — erased at build, so the server runtime in
// capabilities.ts is NOT pulled into this client bundle. The runtime key list
// below is kept local (and must stay in sync with BASEBALL_CAPABILITY_KEYS).
import type { BaseballCapability as BaseballStaffCapabilityKey } from '@/lib/baseball/capabilities';

/**
 * Authoritative per-staff capability context for baseball client components.
 *
 * WHY A SERVER ROUND-TRIP
 *   Capabilities (can_manage_roster, is_head_coach, …) gate sensitive coach
 *   actions and therefore CANNOT be trusted from anything the browser can
 *   forge. This hook NEVER computes a capability client-side: it asks the
 *   server for the resolved capability set for the authenticated user + the
 *   active team, and the server resolves it from baseball_team_coach_staff
 *   under RLS. The returned map is read-only context for the UI (show/hide,
 *   enable/disable) — the real enforcement still happens server-side in each
 *   server action. Hiding a button here is UX, not security.
 *
 * ERGONOMICS (mirrors use-baseball-auth.ts)
 *   Fast-path identity comes from the persisted Zustand auth store so there is
 *   no auth flash on repeat visits. The capability map is always fetched fresh
 *   from the server (it is the part that must be authoritative). A background
 *   session check redirects to /baseball/login if the session has expired.
 *
 * USAGE
 *   const { loading, role, activeTeamId, can, isHeadCoach } = useBaseballStaffAuth();
 *   if (can('can_manage_roster')) { ... }
 */

type Role = 'coach' | 'player';

/** Resolved boolean for every known capability flag, always fully populated. */
export type BaseballCapabilityMap = Record<BaseballStaffCapabilityKey, boolean>;

/** Shape returned by the authoritative server endpoint. */
export interface BaseballStaffContext {
  /** The staff member's coach id (baseball_coaches.id), if any. */
  coachId: string | null;
  /** Team this capability set is resolved for. */
  teamId: string | null;
  /** Free-text staff role label from baseball_team_coach_staff.role. */
  staffRole: string | null;
  /** Whether this staffer is the team's primary coach. */
  isPrimary: boolean;
  /** Whether this staffer is flagged as a head coach (implicit full authority). */
  isHeadCoach: boolean;
  /** Server-resolved capability booleans. Head coaches resolve to all-true. */
  capabilities: BaseballCapabilityMap;
}

export interface BaseballStaffAuthResult {
  /** True until the first authoritative capability fetch settles. */
  loading: boolean;
  /** True once a valid coach session + capability context is established. */
  authorized: boolean;
  /** Resolved role for the current user (capability context only applies to coaches). */
  role: Role | null;
  /** The team the capability context is scoped to. */
  activeTeamId: string | null;
  /** Free-text staff role label (e.g. "Pitching Coach"), server-provided. */
  staffRole: string | null;
  /** True when the current staffer is the team's primary coach. */
  isPrimary: boolean;
  /** True when the current staffer is a head coach (all capabilities granted). */
  isHeadCoach: boolean;
  /** Full authoritative capability map. */
  capabilities: BaseballCapabilityMap;
  /** Authoritative capability check. Head coaches always pass. */
  can: (cap: BaseballStaffCapabilityKey) => boolean;
  /** Convenience: passes only when ALL listed capabilities are granted. */
  canAll: (caps: BaseballStaffCapabilityKey[]) => boolean;
  /** Convenience: passes when ANY listed capability is granted. */
  canAny: (caps: BaseballStaffCapabilityKey[]) => boolean;
  /** The raw server context (null until loaded). */
  context: BaseballStaffContext | null;
  /** Re-fetch the authoritative capability set (e.g. after a role change). */
  refresh: () => void;
}

/**
 * The V11 capability keys (must stay in sync with BASEBALL_CAPABILITY_KEYS in
 * src/lib/baseball/capabilities.ts — the server-side source of truth). Kept as a
 * local const so this client bundle does not import the server-only module.
 */
const CAPABILITY_KEYS: readonly BaseballStaffCapabilityKey[] = [
  'can_manage_roster',
  'can_manage_practice',
  'can_manage_lifting',
  'can_manage_lineups',
  'can_view_academics',
  'can_manage_imports',
  'can_manage_stats',
  'can_invite_staff',
  'can_manage_settings',
  'can_view_readiness',
  'can_modify_availability',
  'can_view_medical',
  'can_view_private_notes',
  'can_message_players',
  'can_export_reports',
  'can_manage_calendar',
  'is_head_coach',
] as const;

/** All-false capability map — the safe default before/without authoritative data. */
function emptyCapabilities(): BaseballCapabilityMap {
  const map = {} as BaseballCapabilityMap;
  for (const key of CAPABILITY_KEYS) map[key] = false;
  return map;
}

/**
 * Coerce an unknown server payload into a fully-populated capability map.
 * Defaults every flag to false; a head-coach flag implies all-true so the UI
 * matches the server's authority model even if the server only sent the flag.
 */
function normalizeCapabilities(raw: unknown): BaseballCapabilityMap {
  const map = emptyCapabilities();
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const key of CAPABILITY_KEYS) {
      map[key] = obj[key] === true;
    }
  }
  if (map.is_head_coach) {
    for (const key of CAPABILITY_KEYS) map[key] = true;
  }
  return map;
}

function normalizeContext(raw: unknown): BaseballStaffContext {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const capabilities = normalizeCapabilities(obj.capabilities ?? obj);
  return {
    coachId: typeof obj.coachId === 'string' ? obj.coachId : null,
    teamId: typeof obj.teamId === 'string' ? obj.teamId : null,
    staffRole: typeof obj.staffRole === 'string' ? obj.staffRole : null,
    isPrimary: obj.isPrimary === true,
    isHeadCoach: capabilities.is_head_coach,
    capabilities,
  };
}

/**
 * Authoritative staff-capability hook.
 *
 * @param teamId Optional explicit team to scope capabilities to. When omitted,
 *   the server resolves the staffer's primary/active team.
 */
export function useBaseballStaffAuth(teamId?: string): BaseballStaffAuthResult {
  const router = useRouter();
  const supabaseRef = useRef(createClient());

  // Fast-path identity from the persisted auth store (no flash on repeat visits).
  const { user: storeUser, coach: storeCoach } = useAuthStore.getState();
  const initialRole: Role | null = storeCoach
    ? 'coach'
    : storeUser?.role === 'coach' || storeUser?.role === 'player'
      ? (storeUser.role as Role)
      : null;

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [role, setRole] = useState<Role | null>(initialRole);
  const [context, setContext] = useState<BaseballStaffContext | null>(null);
  // Bump to force a re-fetch of the authoritative capability set.
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      setLoading(true);

      // 1. Confirm a live session (authoritative — store identity can be stale).
      const { data: { user } } = await supabaseRef.current.auth.getUser();
      if (cancelled) return;

      if (!user) {
        useAuthStore.getState().clear();
        router.push('/baseball/login');
        return;
      }

      // 2. Ask the server for the authoritative capability set. The endpoint
      //    resolves capabilities from baseball_team_coach_staff under RLS for
      //    the authenticated user — the browser never decides what it may do.
      try {
        const res = await fetch('/api/baseball/staff/context', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ teamId: teamId ?? null }),
          cache: 'no-store',
        });

        if (cancelled) return;

        if (!res.ok) {
          // Not a coach / no staff membership / endpoint not yet live: treat as
          // an authenticated non-staff user with zero capabilities (deny-by-default).
          setContext(normalizeContext({ teamId: teamId ?? null }));
          setRole((prev) => prev);
          setAuthorized(false);
          setLoading(false);
          return;
        }

        const payload: unknown = await res.json();
        if (cancelled) return;

        const ctx = normalizeContext(payload);
        setContext(ctx);
        setRole('coach');
        setAuthorized(true);
      } catch {
        // Network/parse failure: fail closed (no capabilities), but keep the
        // user on the page rather than bouncing — the session is still valid.
        if (cancelled) return;
        setContext(normalizeContext({ teamId: teamId ?? null }));
        setAuthorized(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadContext();

    return () => {
      cancelled = true;
    };
  }, [router, teamId, refreshKey]);

  const capabilities = context?.capabilities ?? emptyCapabilities();

  const can = useCallback(
    (cap: BaseballStaffCapabilityKey): boolean => capabilities[cap] === true,
    [capabilities],
  );

  const canAll = useCallback(
    (caps: BaseballStaffCapabilityKey[]): boolean => caps.every((c) => capabilities[c] === true),
    [capabilities],
  );

  const canAny = useCallback(
    (caps: BaseballStaffCapabilityKey[]): boolean => caps.some((c) => capabilities[c] === true),
    [capabilities],
  );

  return {
    loading,
    authorized,
    role,
    activeTeamId: context?.teamId ?? teamId ?? null,
    staffRole: context?.staffRole ?? null,
    isPrimary: context?.isPrimary ?? false,
    isHeadCoach: context?.isHeadCoach ?? false,
    capabilities,
    can,
    canAll,
    canAny,
    context,
    refresh,
  };
}
