/**
 * Standing refresh queue (Clubhouse A+ rows 105 and 121): a saved round marks its player's teams dirty, and the Standing dirty
 * pass (`/api/cron/v3/standing-refresh-dirty`) refreshes those teams' season Standing a few minutes later.
 *
 * The round save never refreshes Standing itself: three team-wide upserts inside round-submit's after() race the crons into 40P01
 * deadlocks (see the note above the progress drivers in round-submit.ts). A mark is one small upsert on its own row.
 *
 * SQL: supabase/migrations/20261024150000_golf_standing_refresh_queue.sql (held). Until it is applied every RPC here answers
 * "function missing", which is not an error: the mark resolves `not_applied` and the dirty pass does nothing.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

/** A team must be quiet this long after its last mark before the dirty pass refreshes it (one refresh per burst of saves). */
export const STANDING_DIRTY_QUIET_SECONDS = 180;
/** …but never waits longer than this from its first mark, so a team saving every few minutes still refreshes. */
export const STANDING_DIRTY_MAX_WAIT_SECONDS = 1800;

/**
 * The RPC is not there yet (its held migration is not applied): PostgREST's PGRST202, "no function with this name and these
 * arguments in the schema cache". Only that: a 42883 or 42P01 comes from INSIDE a function that does exist (a body calling
 * something missing) and is a real failure, never "not applied". The loader's table read keeps its own PGRST205 / 42P01 check.
 */
export function isStandingQueueMissing(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === 'PGRST202';
}

/** What a held-migration RPC answers: PostgREST's `{ data, error }`, with `data` typed by the caller. */
export type HeldRpcResult = { data: unknown; error: { message?: string; code?: string | null } | null };

/**
 * Call an RPC from a held migration (not in the generated Database types until the owner applies it and regenerates). One typed
 * escape hatch instead of an `as any` at each call site; the callers already handle a missing function via isStandingQueueMissing.
 */
export function callHeldStandingRpc(client: object, fn: string, args: Record<string, unknown>): PromiseLike<HeldRpcResult> {
  return (client as { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<HeldRpcResult> }).rpc(fn, args);
}

/** Another refresh holds the season RPC's advisory lock and this caller's lock_timeout ran out (55P03, lock_not_available). */
export function isStandingRefreshBusy(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '55P03';
}

export type MarkStandingDirtyResult = { status: 'marked'; teams: number } | { status: 'not_applied' } | { status: 'failed' };

/**
 * Mark every team the player is active on as needing a Standing refresh. Never throws and never fails the caller: a missing function
 * is `not_applied` (quiet), any other failure is logged as a warning and resolves `failed`; the nightly run still covers the team.
 */
export async function markTeamStandingDirty(playerId: string): Promise<MarkStandingDirtyResult> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await callHeldStandingRpc(supabase, 'mark_team_standing_dirty', { p_player_id: playerId });
    if (error) {
      if (isStandingQueueMissing(error)) return { status: 'not_applied' };
      await logServerError(
        `Standing dirty mark failed: ${error.message ?? 'unknown'}`,
        { action: 'standing.markDirty', featureArea: 'coachhelm', playerId, extra: { code: error.code } },
        'warning',
      );
      return { status: 'failed' };
    }
    return { status: 'marked', teams: typeof data === 'number' ? data : Number(data) || 0 };
  } catch (err) {
    await logServerError(
      `Standing dirty mark threw: ${describeError(err)}`,
      { action: 'standing.markDirty', featureArea: 'coachhelm', playerId },
      'warning',
    ).catch(() => undefined);
    return { status: 'failed' };
  }
}
