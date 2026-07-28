import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { isTransientFetchError, delay } from '@/lib/utils/transient-error';

/**
 * Result of an access verification check.
 * - `allowed`: whether the user may read/write the scoped resource
 * - `reason`: which branch granted or denied access, for logging/debugging
 * - `coachId`: when granted via coach access, the matched coach.id from
 *   `golf_team_coach_staff`. Lets callers attribute writes without a second
 *   `golf_coaches` lookup (which is ambiguous for multi-org users).
 *
 * `'denied'` vs `'unavailable'` (2026-07-28): a probe that FAILED never
 * answered the question, so reporting it as `'denied'` states something the
 * check never established. It also mislabels the telemetry — a database blip
 * arrived in the Bridge as an access denial, and the denial was then filed
 * again by the caller as its own `Unauthorized` incident. `'unavailable'`
 * separates "we asked, the answer is no" from "we could not ask".
 *
 * `allowed` is `false` for BOTH: this distinction never grants access, so it
 * cannot widen anyone's permissions. Callers that only branch on `allowed`
 * keep their existing fail-closed behavior unchanged.
 */
export interface VerifyResult {
  allowed: boolean;
  reason?: 'self' | 'coach' | 'denied' | 'unavailable';
  coachId?: string;
}

/**
 * The two ways a check can end in "no". Narrower than `VerifyResult['reason']`
 * on purpose, so these constants and `reportProbeFailure` satisfy every result
 * shape in this file (`VerifyResult` and `VerifyInsightResult` both admit
 * `'denied' | 'unavailable'`, but neither admits the other's grant reasons).
 */
type ProbeFailure = { allowed: false; reason: 'denied' | 'unavailable' };

const DENIED: ProbeFailure = { allowed: false, reason: 'denied' };
const UNAVAILABLE: ProbeFailure = { allowed: false, reason: 'unavailable' };

/** Spacing before the single retry below. */
const TRANSIENT_RETRY_DELAY_MS = 250;

/**
 * Run one access probe, retrying ONCE when the first attempt failed for
 * transport reasons instead of answering.
 *
 * These probes are read-only and idempotent (two `maybeSingle`s and two
 * `SECURITY DEFINER` RPCs), so a retry is free of side effects. It matters
 * because the server Supabase client aborts any request over 10s
 * (src/lib/supabase/server.ts) and under load that abort was denying
 * legitimate coaches — `verifyTeamAccess failed: TimeoutError: The operation
 * was aborted due to timeout` was the single largest server incident class
 * (n=9) in the 2026-07 Bridge export.
 *
 * Handles both shapes an abort can take: supabase-js normally RESOLVES with
 * a plain `{ message, code: '' }` error object, but the underlying fetch can
 * also THROW before the builder converts it.
 */
async function probeWithRetry<T>(
  run: () => PromiseLike<{ data: T; error: unknown }>,
): Promise<{ data: T | null; error: unknown }> {
  const attempt = async (): Promise<{ data: T | null; error: unknown }> => {
    try {
      return await run();
    } catch (thrown) {
      return { data: null, error: thrown };
    }
  };

  const first = await attempt();
  if (!first.error || !isTransientFetchError(first.error)) return first;

  await delay(TRANSIENT_RETRY_DELAY_MS);
  return attempt();
}

/**
 * Tier a failed probe: a transport blip is a handled, self-recovering
 * condition ('warning'), a real query failure is an incident ('error').
 */
async function reportProbeFailure(
  message: string,
  error: unknown,
  context: Parameters<typeof logServerError>[1],
): Promise<ProbeFailure> {
  const transient = isTransientFetchError(error);
  await logServerError(
    `${message}: ${describeError(error)}`,
    {
      ...context,
      extra: { ...(context.extra ?? {}), transient, retried: transient },
    },
    transient ? 'warning' : 'error',
  );
  return transient ? UNAVAILABLE : DENIED;
}

/**
 * Verify that a given user is allowed to access a specific player's data.
 *
 * Access is granted if:
 *   1. The user IS the player (self-access), OR
 *   2. The user is a coach staffing ANY team the player is an active member of
 *      (multi-team-safe via `public.verify_coach_owns_player` RPC).
 *
 * The old per-file `verifyPlayerAccess` helpers incorrectly picked the
 * "first team in the coach's org" via `.limit(1)`, which silently denied
 * access for coaches staffing 2+ teams. This helper replaces them with a
 * single source of truth.
 *
 * Pass a custom supabase client (e.g. from a test) to inject mocks.
 */
export async function verifyPlayerAccess(
  playerId: string,
  userId: string,
  supabase?: SupabaseClient,
): Promise<VerifyResult> {
  const sb = supabase ?? (await createClient());

  // 1. Self-access check (cheapest; covers player viewing own data).
  const { data: ownPlayer, error: selfError } = await probeWithRetry(() =>
    sb
      .from('golf_players')
      .select('id')
      .eq('id', playerId)
      .eq('user_id', userId)
      .maybeSingle(),
  );

  if (selfError) {
    return reportProbeFailure('verifyPlayerAccess.self failed', selfError, {
      action: 'auth.verifyPlayerAccess',
      playerId,
      userId,
    });
  }
  if (ownPlayer) return { allowed: true, reason: 'self' };

  // 2. Coach-access check via RPC that inspects golf_team_coach_staff joins.
  const { data: isCoach, error: coachError } = await probeWithRetry(() =>
    sb.rpc('verify_coach_owns_player', { p_player_id: playerId, p_user_id: userId }),
  );

  if (coachError) {
    return reportProbeFailure('verifyPlayerAccess.coach failed', coachError, {
      action: 'auth.verifyPlayerAccess',
      playerId,
      userId,
    });
  }

  return { allowed: !!isCoach, reason: isCoach ? 'coach' : 'denied' };
}

/**
 * Verify that a user staffs the given team.
 *
 * Uses `public.coach_id_for_team` RPC which returns the matched coach.id
 * from `golf_team_coach_staff` (or null if the user does not staff the team).
 * Returning the coach.id lets callers attribute writes without a second
 * `golf_coaches` lookup — that lookup is ambiguous for multi-org users with
 * more than one coach profile.
 */
export async function verifyTeamAccess(
  teamId: string,
  userId: string,
  supabase?: SupabaseClient,
): Promise<VerifyResult> {
  const sb = supabase ?? (await createClient());

  const { data: coachId, error } = await probeWithRetry(() =>
    sb.rpc('coach_id_for_team', { p_team_id: teamId, p_user_id: userId }),
  );

  if (error) {
    return reportProbeFailure('verifyTeamAccess failed', error, {
      action: 'auth.verifyTeamAccess',
      metadata: { teamId, userId },
    });
  }

  if (typeof coachId === 'string' && coachId.length > 0) {
    return { allowed: true, reason: 'coach', coachId };
  }
  return DENIED;
}

/**
 * Verify that the user may write to a specific insight by resolving the
 * insight's team_id and confirming the user staffs that team via
 * `golf_team_coach_staff`.
 *
 * Used by singleton dismiss/resolve/acknowledge handlers to add a defensive
 * server-side ownership filter on top of RLS — without this filter the
 * handlers key only on `.eq('id', insightId)` and rely entirely on the RLS
 * policy. Mirrors the bulk handler pattern but uses the canonical multi-org
 * -safe path (coach_id resolved via golf_team_coach_staff, not via a
 * `golf_coaches WHERE user_id = ?` lookup).
 *
 * Returns the insight's team_id on success so callers can scope the UPDATE
 * by `.eq('team_id', teamId)` and treat zero affected rows as 404.
 */
export interface VerifyInsightResult {
  allowed: boolean;
  reason?: 'coach' | 'not-found' | 'denied' | 'unavailable';
  teamId?: string;
  coachId?: string;
}

/**
 * The user-facing message for a refused insight access check.
 *
 * Exists so the five singleton handlers that share this gate cannot drift
 * apart, and so `'unavailable'` stops being reported as `'Not authorized'`.
 * That mattered twice over: the coach was told they lacked permission when
 * the real problem was a database blip they could simply retry, AND the
 * returned string is what the action observer files as the incident — so an
 * availability failure was landing in the Bridge as an access denial, a class
 * `observeActionSoftFailure` deliberately tiers DOWN to a handled warning.
 * A distinct string keeps an outage visible at 'error'.
 */
export function insightAccessDenialMessage(reason: VerifyInsightResult['reason']): string {
  switch (reason) {
    case 'not-found':
      return 'Insight not found';
    case 'unavailable':
      return 'Temporarily unavailable. Please try again.';
    default:
      return 'Not authorized';
  }
}

export async function verifyInsightAccess(
  insightId: string,
  userId: string,
  supabase?: SupabaseClient,
): Promise<VerifyInsightResult> {
  const sb = supabase ?? (await createClient());

  const { data: insight, error: lookupError } = await probeWithRetry(() =>
    sb
      .from('golf_coach_insights')
      .select('id, team_id')
      .eq('id', insightId)
      .maybeSingle<{ id: string; team_id: string | null }>(),
  );

  if (lookupError) {
    return reportProbeFailure('verifyInsightAccess.lookup failed', lookupError, {
      action: 'auth.verifyInsightAccess',
      metadata: { insightId, userId },
    });
  }

  if (!insight) {
    return { allowed: false, reason: 'not-found' };
  }

  if (!insight.team_id) {
    // Pre-canonical insights with no team_id can't be verified through the
    // canonical helper. Fail closed — these should not be writable through
    // the new handler path.
    return DENIED;
  }

  const team = await verifyTeamAccess(insight.team_id, userId, sb);
  if (!team.allowed) {
    // Propagate WHY: a delegated transport failure must not be relabelled as
    // a denial one level up (that is the bug this file just fixed).
    return { allowed: false, reason: team.reason === 'unavailable' ? 'unavailable' : 'denied' };
  }

  return {
    allowed: true,
    reason: 'coach',
    teamId: insight.team_id,
    coachId: team.coachId,
  };
}
