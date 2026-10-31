import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { deriveRoundTotal } from '@/lib/golf/round-total';
import { chLogServer } from '../lib/track-server';
import { historyHoleIds, toReviewHistory, type ChHistoryRound, type ChHistoryRoundRow, type ChReviewHistory } from './round-history-shape';
import { loadTeamZone, SEASON_DEFAULT_TZ, seasonStartDate } from './season';
import type { ChPlayHole } from './stats-extra';

type Supabase = Awaited<ReturnType<typeof createClient>>;

/*
 * P-7: the review's stage 3: the player's light list of rounds (as the Rounds library reads it) and the holes of the few
 * the history needs, then `toReviewHistory`. The list and the team's zone need only the player, so they are started
 * beside the round's parts (one wave); the holes follow once the list is in. A failure returns null and is logged; the
 * review still shows the round's own figures and says nothing about an error (P-7 4.8).
 */

const LIST_COLUMNS = 'id, course_id, course_name, tees_played, tee_id, round_date, holes_played, total_score, front_nine, back_nine, total_putts';
const HOLE_COLUMNS = 'round_id, hole_number, par, score, putts, gir, fairway_hit';

type HoleRow = { round_id: string; hole_number: number; par: number | null; score: number | null; putts: number | null; gir: boolean | null; fairway_hit: boolean | null };

const log = (what: string, err: unknown) => chLogServer('rounds.review', what, err);

/** What the history needs from the review's own read: whose rounds, whose (coach) team they were posted for, the zone's team, the round. */
export type ChReviewHistoryInput = { playerId: string; coachTeamId: string | null; zoneTeamId: string | null; round: ChHistoryRound };

/**
 * The route's streamed read (P-7 4.8): the history for a review already drawn. It never rejects: a failure is null, logged, and the
 * review says nothing about it.
 */
export async function loadReviewHistory(input: ChReviewHistoryInput): Promise<ChReviewHistory | null> {
  try {
    const supabase = await createClient();
    return await startReviewHistory(supabase, input)(input.round);
  } catch (err) {
    log('history', err);
    return null;
  }
}

/** Sends the list and zone reads now; the returned function finishes the history once the round's own figures are known. */
export function startReviewHistory(
  supabase: Supabase,
  input: { playerId: string; coachTeamId: string | null; zoneTeamId: string | null },
): (round: ChHistoryRound) => Promise<ChReviewHistory | null> {
  const zoneRead = input.zoneTeamId ? loadTeamZone(supabase, input.zoneTeamId, 'rounds.review') : Promise.resolve(SEASON_DEFAULT_TZ);
  const listRead = fetchAllRowsResult<ChHistoryRoundRow>(
    (from, to) => {
      let q = supabase.from('golf_rounds').select(LIST_COLUMNS).eq('player_id', input.playerId).eq('is_test', false).eq('status', 'completed');
      // A coach reads the rounds the player posted for this team, as the coach's other reads do.
      if (input.coachTeamId) q = q.eq('team_id', input.coachTeamId);
      return q.order('round_date', { ascending: false }).order('id', { ascending: false }).range(from, to);
    },
    undefined,
    { table: 'golf_rounds', action: 'clubhouse.rounds.review.history', feature: 'round_tracking', sport: 'golf' },
  );
  // Held as settled values: the review may return before it asks for the history, and a read nobody awaits must not reject.
  const zone = zoneRead.then((tz) => ({ tz }), (err: unknown) => ({ err }));
  const listed = listRead.then((res) => ({ res }), (err: unknown) => ({ err }));
  return async (round) => {
    try {
      const l = await listed;
      if ('err' in l) throw l.err;
      const listRes = l.res;
      if (listRes.error) {
        log('history-list', listRes.error);
        return null;
      }
      // The record chips compare this round's canonical total (the review draws it) with the others', so the others use the same
      // total: front plus back where both are stored, as the library and the course page do (round-total.ts: ~5% drift by one).
      const list = (listRes.data ?? []).map((r) => ({ ...r, total_score: deriveRoundTotal(r).total }));
      const ids = historyHoleIds(round, list);
      const holes = new Map<string, ChPlayHole[]>();
      for (const chunk of chunkIds(ids)) {
        const res = await fetchAllRowsResult<HoleRow>(
          (from, to) => supabase.from('golf_holes').select(HOLE_COLUMNS).in('round_id', chunk).order('round_id').order('hole_number').range(from, to),
          undefined,
          { table: 'golf_holes', action: 'clubhouse.rounds.review.history', feature: 'round_tracking', sport: 'golf' },
        );
        if (res.error) {
          log('history-holes', res.error);
          return null;
        }
        for (const h of res.data ?? []) {
          if (h.par == null) continue;
          const arr = holes.get(h.round_id) ?? [];
          arr.push({ n: h.hole_number, par: h.par, score: h.score, putts: h.putts, gir: h.gir, fairway: h.fairway_hit });
          holes.set(h.round_id, arr);
        }
      }
      const z = await zone;
      if ('err' in z) throw z.err;
      return toReviewHistory({ round, list, holes, seasonStart: seasonStartDate(new Date(), z.tz) });
    } catch (err) {
      log('history', err);
      return null;
    }
  };
}
