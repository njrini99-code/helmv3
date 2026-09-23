import 'server-only';

/**
 * The `golf_rounds` read side of `follow-up-eligibility.ts` (see that
 * module's doc for the full concept). Split out as its own `server-only`
 * file — mirroring `due-for-review.ts` (pure) vs. `practice-log-loader.ts`
 * (server-only loader) — so the pure classification stays importable from a
 * client component (`DueForReviewPanel`) without pulling a DB client in.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fromUntyped } from '@/lib/supabase/untyped';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

export interface FollowUpRoundCountInput {
  id: string;
  player_id: string;
  /** Accept/active start — `null` (still `proposed`) means no window to
   *  count rounds against; such areas are simply left out of the result map. */
  started_at: string | null;
}

/**
 * Batch-loads a completed-round count per focus area, counting only rounds
 * on or after that area's own `started_at` date (matches
 * `loadWindowRoundsByPlayer`'s `round_date >= startDate` string-comparison
 * convention in progress-drivers.ts — `golf_rounds.round_date` is a plain
 * date, no timezone conversion needed). One query per player-id chunk
 * (`chunkIds`), each paged past PostgREST's 1000-row cap
 * (`fetchAllRowsResult`) — per CLAUDE.md's pagination/URL-size rules.
 *
 * Returns `null` — not an empty Map — on any read failure, so a caller never
 * confuses "the read failed" with "zero rounds played" (same contract as
 * `loadFocusAreaPracticeLogData`'s `null`-means-unknown convention). Areas
 * with no `started_at` are simply absent from the returned map.
 */
export async function loadFollowUpRoundCounts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  areas: readonly FollowUpRoundCountInput[],
): Promise<Map<string, number> | null> {
  const out = new Map<string, number>();
  const started = areas.filter(
    (a): a is FollowUpRoundCountInput & { started_at: string } => Boolean(a.started_at),
  );
  if (started.length === 0) return out;

  const playerIds = [...new Set(started.map((a) => a.player_id))];
  const earliestStartDate = started.reduce((min, a) => {
    const d = a.started_at.slice(0, 10);
    return d < min ? d : min;
  }, started[0]!.started_at.slice(0, 10));

  type RoundRow = { player_id: string; round_date: string | null; status: string | null };
  const rounds: RoundRow[] = [];
  try {
    for (const batch of chunkIds(playerIds)) {
      const { data, error } = await fetchAllRowsResult<RoundRow>((from, to) =>
        fromUntyped(supabase, 'golf_rounds')
          .select('player_id, round_date, status')
          .in('player_id', batch)
          .eq('status', 'completed')
          .gte('round_date', earliestStartDate)
          .order('id', { ascending: true })
          .range(from, to),
      );
      if (error) throw error;
      rounds.push(...(data ?? []));
    }
  } catch (error) {
    await logServerError(
      `[follow-up-eligibility] golf_rounds batch read failed — round counts will render as absent, not as a false "0 rounds": ${describeError(error)}`,
      { action: 'followUpEligibility.loadFollowUpRoundCounts', featureArea: 'development' },
      'warning',
    );
    return null;
  }

  for (const area of started) {
    const startDate = area.started_at.slice(0, 10);
    const count = rounds.filter(
      (r) => r.player_id === area.player_id && r.status === 'completed' && r.round_date && r.round_date >= startDate,
    ).length;
    out.set(area.id, count);
  }
  return out;
}
