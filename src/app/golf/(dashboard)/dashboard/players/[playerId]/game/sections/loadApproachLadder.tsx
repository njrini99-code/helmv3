/**
 * Coach-only approach distance ladder for the Game Fingerprint (streamed).
 *
 * Approach shots only: the starting lie is neither the tee nor the green,
 * filtered in the query itself. That keeps drives out of the "dead zone"
 * reading (spec §4.3; the live 275-300y "dead zone" was driving). SG here is
 * shot-level against the stats-cache expected-strokes table, the same one
 * behind the waterfall (OD-12), so the two instruments cannot disagree about
 * what "average" means.
 *
 * Uses the page's session-scoped client (RLS applies). Best-effort: any
 * failure logs and renders nothing, never taking down the page.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import type { ShotData } from '@/lib/coachhelm/v2/shot-analysis/shot-level-sg';
import { buildStatsCacheSgBaseline } from '@/lib/coachhelm/v2/shot-analysis/stats-cache-baseline';
import { buildYardageCurve } from '@/lib/coachhelm/v2/shot-analysis/yardage-curves';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { ApproachLadder } from '@/components/fairway/pages/player-game/fingerprint/instruments';
import {
  LADDER_MAX_YARDS,
  LADDER_MIN_YARDS,
  type ApproachLadderData,
} from '@/components/fairway/pages/player-game/fingerprint/approach-ladder-model';

export const APPROACH_LADDER_WINDOW_DAYS = 90;

export async function loadApproachLadder(
  playerId: string,
  supabase: SupabaseClient<Database>,
  windowDays: number = APPROACH_LADDER_WINDOW_DAYS,
): Promise<ApproachLadderData | null> {
  try {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
    const { data: rounds, error: roundsError } = await supabase
      .from('golf_rounds')
      .select('id')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .gte('round_date', since);
    if (roundsError) throw roundsError;
    const roundIds = (rounds ?? []).map((r) => r.id);
    if (roundIds.length === 0) return { bands: [], shots: 0, rounds: 0, windowDays };

    const shots: ShotData[] = [];
    for (const chunk of chunkIds(roundIds)) {
      const { data, error } = await fetchAllRowsResult((from, to) =>
        supabase
          .from('golf_shots')
          .select('id, round_id, hole_number, shot_number, lie_before, lie_after, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, club_type, result')
          .in('round_id', chunk)
          .not('lie_before', 'in', '(tee,green)')
          .not('distance_to_hole_before', 'is', null)
          .order('id', { ascending: true })
          .range(from, to),
      );
      if (error) throw error;
      for (const s of data ?? []) {
        if (!s.lie_before || s.distance_to_hole_before == null) continue;
        // Same unit handling as getPlayerShotContext: yards off the green, and
        // feet kept for a green finish (shot-level-sg expects feet there).
        const before = s.distance_unit_before === 'feet' ? s.distance_to_hole_before / 3 : s.distance_to_hole_before;
        const lieAfter = s.lie_after ?? 'fairway';
        const rawAfter = s.distance_to_hole_after ?? 0;
        const after = lieAfter === 'green' ? rawAfter : s.distance_unit_after === 'feet' ? rawAfter / 3 : rawAfter;
        shots.push({
          id: s.id,
          roundId: s.round_id,
          holeNumber: s.hole_number,
          shotNumber: s.shot_number,
          lieBefore: s.lie_before,
          distanceBefore: before,
          lieAfter,
          distanceAfter: after,
          club: s.club_type ?? undefined,
          result: s.result ?? undefined,
        });
      }
    }

    const inRange = shots.filter((s) => s.distanceBefore >= LADDER_MIN_YARDS && s.distanceBefore < LADDER_MAX_YARDS);
    const curve = buildYardageCurve(inRange, buildStatsCacheSgBaseline(), 25, playerId);
    return {
      bands: curve.buckets.map((b) => ({
        start: b.rangeStart,
        end: b.rangeEnd,
        shots: b.shotCount,
        avgSg: b.avgSG,
        leaveFeet: b.avgProximity,
        greenPct: b.greenHitRate * 100,
      })),
      shots: inRange.length,
      rounds: new Set(inRange.map((s) => s.roundId)).size,
      windowDays,
    };
  } catch (err) {
    void logServerError(
      `[player game page] approach ladder load failed for ${playerId}: ${describeError(err)}`,
      { action: 'players.gamePage.approachLadder', featureArea: 'coachhelm' },
      'warning',
    );
    return null;
  }
}

/** Async server slot, rendered inside a Suspense boundary so it streams. */
export async function ApproachLadderSlot({
  playerId,
  supabase,
}: {
  playerId: string;
  supabase: SupabaseClient<Database>;
}) {
  const data = await loadApproachLadder(playerId, supabase);
  return data ? <ApproachLadder data={data} /> : null;
}

/** Fallback while the ladder streams: same rhythm as the real rows. */
export function ApproachLadderSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex h-12 items-center gap-3">
          <span className="h-3 w-14 rounded-full bg-skeleton" />
          <span className="h-3 flex-1 rounded-full bg-skeleton" />
          <span className="h-3 w-10 rounded-full bg-skeleton" />
        </div>
      ))}
    </div>
  );
}
