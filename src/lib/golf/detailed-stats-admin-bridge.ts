import 'server-only';

/**
 * ============================================================================
 * Trusted-server bridge for `getDetailedStatsAsAdmin`
 * ----------------------------------------------------------------------------
 * SECURITY: the real implementation (service-role admin client, zero user
 * auth gate, caller-supplied player_id) lives as a MODULE-PRIVATE function
 * inside `src/app/golf/actions/stats-data.ts` (a 'use server' file) — it is
 * intentionally NOT exported from there. Every exported async function in a
 * 'use server' file is registered by Next.js as a public, directly-POSTable
 * server action (discoverable by its action id) regardless of whether any
 * client component ever imports it, so exporting an admin-bypass function
 * from that file would let anyone POST an arbitrary player_id and read that
 * player's full shot-level stats with no session.
 *
 * This file is a plain server module (no 'use server', no 'use client') —
 * its exports are ordinary functions, never actions. It exists purely to
 * hand the ALREADY-AUTHORIZED, non-interactive callers that legitimately
 * need the admin-scoped query (the CoachHelm v2 engine's `fetchPlayerStats`,
 * invoked from post-round fire-and-forget / safety-net cron / roster-sweep
 * cron) a way to reach that private implementation without stats-data.ts
 * ever exporting it.
 *
 * Wiring: stats-data.ts calls `__registerGetDetailedStatsAsAdmin(...)` at
 * its own module scope (a side effect, not an export) to hand this bridge a
 * reference to the withAdminObserved-wrapped impl. `getDetailedStatsAsAdmin`
 * below lazily triggers that registration (via a dynamic import of
 * stats-data.ts, same technique the engine already used pre-fix) the first
 * time it's called in a given process, then delegates to the registered
 * function on every call — same object, same behavior, just never exported
 * from a 'use server' module.
 * ========================================================================== */

import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { StatsFilter } from '@/app/golf/actions/stats-data-types';

type TrustedDetailedStatsFn = (
  playerId: string,
  roundId?: string | 'overall',
  filter?: StatsFilter,
) => Promise<GolfStats>;

let impl: TrustedDetailedStatsFn | null = null;

/**
 * Called once by stats-data.ts's module-scope side effect on first load.
 * Do not call this from anywhere else — it exists only so that file can
 * hand this bridge a reference to its own module-private implementation.
 */
export function __registerGetDetailedStatsAsAdmin(fn: TrustedDetailedStatsFn): void {
  impl = fn;
}

/**
 * Trusted-server variant of `getDetailedStats` for callers that don't have a
 * user session on the request — specifically the CoachHelm engine's
 * `fetchPlayerStats` when invoked from fire-and-forget post-round triggers,
 * the safety-net cron, or the roster-sweep cron. Uses the service-role
 * admin client and skips the auth/access check (both are enforced by the
 * trusted caller that dispatched the engine run).
 *
 * DO NOT call this from client-reachable code — always prefer
 * `getDetailedStats` (the authed action in stats-data.ts) when a user
 * session exists. NEVER re-export this from a 'use server' file.
 */
export async function getDetailedStatsAsAdmin(
  playerId: string,
  roundId?: string | 'overall',
  filter?: StatsFilter,
): Promise<GolfStats> {
  if (!impl) {
    // Load stats-data.ts so its registration side effect runs. Cheap after
    // the first call — subsequent imports hit the module cache.
    await import('@/app/golf/actions/stats-data');
  }
  if (!impl) {
    throw new Error(
      '[detailed-stats-admin-bridge] getDetailedStatsAsAdmin not registered — ' +
        'stats-data.ts failed to load or its registration call was removed',
    );
  }
  return impl(playerId, roundId, filter);
}
