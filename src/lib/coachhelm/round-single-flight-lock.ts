/**
 * Per-round single-flight lock, taken BEFORE an expensive LLM call so a
 * concurrent second request for the same round waits for or reads the
 * first call's result instead of making a second billable call.
 *
 * Extracted from round-recap.ts (Package 8, migration `20260923100000`)
 * when the round-review narrative feature (same day) needed to reuse the
 * identical claim/expire/reclaim/release semantics for a second, unrelated
 * resource. `server-only` matters here specifically because the two
 * helpers this module wraps (claim/release) must NEVER be exported from a
 * `'use server'` action file — every export of a `'use server'` file
 * becomes a client-callable server action, which would ship an
 * unauthenticated claim/release endpoint (a Review Gate blocking rule:
 * "a server action without an auth check"). This module is a plain
 * library file with no directive, imported by 'use server' action files
 * but never itself one.
 *
 * DB objects: `public.golf_round_recap_locks` /
 * `public.claim_round_recap_lock` / `public.release_round_recap_lock` —
 * see migration `20260923100000_round_recap_single_flight_lock.sql` for
 * the full design rationale (lease table vs. advisory lock, why
 * (round_id, revision, kind), TTL sizing left to each caller).
 */

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { delay } from '@/lib/utils/transient-error';

/**
 * The resource discriminator in the lock's primary key. Matches the
 * migration's `golf_round_recap_locks_kind_check` CHECK constraint exactly
 * — add a value here AND in that CHECK together, never one without the
 * other, or a caller's claim will pass the app-layer type check and then
 * fail the RPC.
 */
export type RoundLockKind = 'recap' | 'round_review_narrative';

export type RoundLockOutcome<T> =
  | { outcome: 'winner'; release: () => Promise<void> }
  | { outcome: 'resolved'; value: T }
  | { outcome: 'fail-closed' };

export interface AcquireRoundLockOptions<T> {
  roundId: string;
  /** Constant today for every caller — see each caller's own
   *  `*_LOCK_REVISION` constant comment for why the column exists ahead of
   *  a present need. */
  revision: number;
  kind: RoundLockKind;
  ttlSeconds: number;
  /** How long a loser polls for the winner's result before trying one
   *  reclaim and failing closed. */
  waitMs: number;
  pollIntervalMs: number;
  userId: string;
  /**
   * Polls for the winner's persisted result. Returns the value once it is
   * visible, or `null` to keep waiting. Each `kind` polls its OWN storage
   * (e.g. `golf_rounds.ai_recap` for `'recap'`, `golf_round_reviews
   * .ai_narrative` for `'round_review_narrative'`) — this is exactly the
   * bug a shared, hardcoded poll target would reintroduce: a narrative
   * waiter that polled the recap's column could "resolve" by reading and
   * caching the RECAP's text as if it were the narrative.
   */
  pollForResult: () => Promise<{ value: T | null; error?: { message: string; code?: string } }>;
  /** `logServerError` `action` PREFIX — a stage suffix (`.claim`,
   *  `.release`, `.reclaim`, `.waitPoll`) is appended so each failure
   *  point stays distinguishable in the error feed, matching
   *  round-recap.ts's original per-stage naming. */
  logActionPrefix: string;
  logFeatureArea: string;
}

/**
 * Attempts to claim `public.claim_round_recap_lock`. Returns the holder
 * token on success, or `null` when a live, unexpired lease for this exact
 * (round_id, revision, kind) is already held by someone else (not an
 * error — the normal "lost the race" case).
 */
async function claimRoundLock(
  admin: ReturnType<typeof createAdminClient>,
  roundId: string,
  revision: number,
  kind: RoundLockKind,
  ttlSeconds: number,
): Promise<{ holder_token: string } | null> {
  // golf_round_recap_locks and its functions are new (Package 8's
  // migration) and may not be reflected in the generated Database type in
  // every environment until `npm run db:types` runs against a DB that has
  // it applied — cast, matching round-recap.ts's existing
  // `(supabase as any).rpc(...)` / `(admin as any).from(...)` pattern.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc('claim_round_recap_lock', {
    p_round_id: roundId,
    p_revision: revision,
    p_kind: kind,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) throw new Error(error.message);
  // The function RETURNS TABLE — PostgREST returns an array. Zero rows
  // means someone else holds a live, unexpired lease; this call did not
  // claim it (not thrown — the caller decides what "didn't claim" means).
  const row = Array.isArray(data) ? data[0] : data;
  return row?.holder_token ? { holder_token: row.holder_token as string } : null;
}

/**
 * Releases a held lock. Best-effort: a release failure is logged and
 * swallowed, never thrown — the lease's own TTL is the backstop, so a
 * failed release only delays (never permanently blocks) the next claim.
 */
async function releaseRoundLock(
  admin: ReturnType<typeof createAdminClient>,
  roundId: string,
  revision: number,
  kind: RoundLockKind,
  holderToken: string,
  logActionPrefix: string,
  logFeatureArea: string,
): Promise<void> {
  const action = `${logActionPrefix}.release`;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).rpc('release_round_recap_lock', {
      p_round_id: roundId,
      p_revision: revision,
      p_kind: kind,
      p_holder_token: holderToken,
    });
    if (error) {
      await logServerError(
        `Round lock (${kind}) release failed (harmless — the lease expires on its own): ${error.message}`,
        { action, featureArea: logFeatureArea, roundId, errorCode: error.code, skipSentry: true },
        'warning',
      );
    }
  } catch (err) {
    await logServerError(
      `Round lock (${kind}) release threw (harmless — the lease expires on its own): ${describeError(err)}`,
      { action, featureArea: logFeatureArea, roundId, skipSentry: true },
      'warning',
    );
  }
}

/**
 * Claims the single-flight lock, or waits briefly for a concurrent
 * winner's result, or fails closed. Never calls or triggers an LLM call
 * itself — it only decides whether THIS caller is allowed to.
 */
export async function acquireRoundLockOrWait<T>(
  options: AcquireRoundLockOptions<T>,
): Promise<RoundLockOutcome<T>> {
  const {
    roundId, revision, kind, ttlSeconds, waitMs, pollIntervalMs, userId, pollForResult, logActionPrefix, logFeatureArea,
  } = options;
  const admin = createAdminClient();

  try {
    const claimed = await claimRoundLock(admin, roundId, revision, kind, ttlSeconds);
    if (claimed) {
      return {
        outcome: 'winner',
        release: () =>
          releaseRoundLock(admin, roundId, revision, kind, claimed.holder_token, logActionPrefix, logFeatureArea),
      };
    }
  } catch (err) {
    await logServerError(
      `Round lock (${kind}) claim threw — failing closed, no LLM call: ${describeError(err)}`,
      { action: `${logActionPrefix}.claim`, featureArea: logFeatureArea, roundId, userId, skipSentry: true },
      'warning',
    );
    return { outcome: 'fail-closed' };
  }

  // Someone else holds a live lease. Wait briefly for their result rather
  // than starting a second billable LLM call.
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await delay(pollIntervalMs);
    const { value, error } = await pollForResult();
    if (error) {
      await logServerError(
        `Round lock (${kind}) waiter's poll read failed — failing closed, no LLM call: ${error.message}`,
        {
          action: `${logActionPrefix}.waitPoll`,
          featureArea: logFeatureArea,
          roundId,
          userId,
          errorCode: error.code,
          skipSentry: true,
        },
        'warning',
      );
      return { outcome: 'fail-closed' };
    }
    if (value !== null) {
      return { outcome: 'resolved', value };
    }
  }

  // Wait exhausted with no result. Try reclaiming once more — covers a
  // holder that crashed mid-wait (its lease has since expired) — before
  // concluding the holder is still genuinely working and failing closed.
  try {
    const claimed = await claimRoundLock(admin, roundId, revision, kind, ttlSeconds);
    if (claimed) {
      return {
        outcome: 'winner',
        release: () =>
          releaseRoundLock(admin, roundId, revision, kind, claimed.holder_token, logActionPrefix, logFeatureArea),
      };
    }
  } catch (err) {
    await logServerError(
      `Round lock (${kind}) reclaim threw after wait — failing closed, no LLM call: ${describeError(err)}`,
      { action: `${logActionPrefix}.reclaim`, featureArea: logFeatureArea, roundId, userId, skipSentry: true },
      'warning',
    );
    return { outcome: 'fail-closed' };
  }

  // Still held by a live, unexpired lease — the winner is genuinely still
  // working. Fail closed rather than double-calling the LLM.
  return { outcome: 'fail-closed' };
}
