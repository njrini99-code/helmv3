/**
 * ============================================================================
 * Dashboard failure classifier — player CoachHelm dashboard error taxonomy
 * ----------------------------------------------------------------------------
 * `getPlayerCoachHelmDashboardImpl` (src/app/golf/actions/insights.ts) has an
 * outer catch that used to collapse EVERY failure (a transient Postgres
 * deadlock from ShotPatternMiner.savePatterns() racing a coachhelm-* cron, a
 * statement timeout, or a genuine bug) into the same generic
 * `{success:false, error:'An unexpected error occurred'}` — so the page could
 * never tell "retry me, I'll probably work" apart from "this is actually
 * broken" and always rendered the same hard dead-end ErrorState.
 *
 * This is a standalone, plain (non-'use server') module on purpose: it's a
 * pure classification function with no I/O, so it's trivially unit-testable
 * without spinning up the rest of insights.ts's dependency graph, and — since
 * a 'use server' file may only export async functions — a sync helper like
 * this couldn't be exported directly from insights.ts anyway.
 * ========================================================================== */

import { isTransientDbError } from '@/lib/supabase/bounded-query';

export type DashboardFailureCode = 'TRANSIENT_FAILURE' | 'UNKNOWN';

/*
 * Which faults count as retryable lives in ONE place,
 * `isTransientDbError` (src/lib/supabase/bounded-query.ts): the SQLSTATE
 * codes this file used to list (deadlock, statement/lock timeout, connection
 * exceptions), their Postgres message text for errors whose `.code` did not
 * survive a re-throw (e.g. `ShotPatternMiner.savePatterns` wrapping the pg
 * error into `new Error('Failed to save CoachHelm shot patterns: ' +
 * error.message)`), and — added after the 2026-09-24 pool-exhaustion
 * brownout (#2061) — PostgREST's own saturation codes PGRST003 (pool
 * timeout), PGRST002 (schema cache unreachable) and 53300 (too many
 * connections). Before that, the very errors of that brownout classified as
 * UNKNOWN and the page showed its hard dead-end instead of retrying.
 */
/**
 * Classifies an unexpected `getPlayerCoachHelmDashboardImpl` failure so the
 * caller can decide whether it's worth an automatic retry.
 *
 * - `TRANSIENT_FAILURE` — a retryable DB error (deadlock, statement/lock
 *   timeout, connection blip, pool exhaustion). The most common live cause is
 *   `ShotPatternMiner.savePatterns()` racing a concurrently-running
 *   coachhelm-* cron writer on `golf_patterns_v2`. A retry a moment later
 *   is very likely to succeed.
 * - `UNKNOWN` — anything else. Not worth an automatic retry.
 *
 * (`COACHHELM_DISABLED` / `UNAUTHORIZED` / `NOT_FOUND` are explicit,
 * non-exceptional early returns in `getPlayerCoachHelmDashboardImpl` — they
 * never reach the catch block this classifier serves, so they're not
 * modeled here.)
 */
export function classifyDashboardFailure(error: unknown): DashboardFailureCode {
  return isTransientDbError(error) ? 'TRANSIENT_FAILURE' : 'UNKNOWN';
}
