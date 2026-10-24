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

const MIGRATION_NOT_APPLIED_CODES = new Set(['PGRST202', 'PGRST205', '42883', '42P01']);

/** The RPC or table is not there yet (its held migration is not applied): PostgREST's and Postgres's "does not exist" shapes. */
export function isStandingQueueMissing(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code && MIGRATION_NOT_APPLIED_CODES.has(error.code)) return true;
  const message = (error.message ?? '').toLowerCase();
  return message.includes('could not find the function') || (message.includes('does not exist') && (message.includes('function') || message.includes('relation')));
}

export type MarkStandingDirtyResult = { status: 'marked'; teams: number } | { status: 'not_applied' } | { status: 'failed' };

/**
 * Mark every team the player is active on as needing a Standing refresh. Never throws and never fails the caller: a missing function
 * is `not_applied` (quiet), any other failure is logged as a warning and resolves `failed`; the nightly run still covers the team.
 */
export async function markTeamStandingDirty(playerId: string): Promise<MarkStandingDirtyResult> {
  try {
    const supabase = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the held migration's RPC is not in the generated types yet
    const { data, error } = await (supabase as any).rpc('mark_team_standing_dirty', { p_player_id: playerId });
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
