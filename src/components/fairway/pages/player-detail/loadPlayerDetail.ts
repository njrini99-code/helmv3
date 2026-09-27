import 'server-only';

/**
 * Server loader for the coach player detail page.
 *
 * Every read runs in ONE parallel batch on the request's own (RLS-scoped)
 * client, after page.tsx has confirmed the player is on the coach's team. Each
 * read settles on its own: a failure is logged and becomes `{ ok: false }`,
 * which the model renders as "couldn't load", never as "nothing yet".
 *
 * Deliberately a plain server module, NOT 'use server': it is called from a
 * server component, never from the browser.
 *
 * Goals are read with the user client (RLS: a coach sees assigned and shared
 * goals), not `loadActiveGoals`, which uses the admin client and would expose
 * a player's private goals.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { ROUND_STATS_CACHE_COLUMNS, type RoundStatsCacheRow } from '@/lib/golf/countable-round-stats';
import { loadGenome } from '@/lib/coachhelm/v3/genome/loader';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import {
  buildPlayerDetailModel,
  type RawFocusArea,
  type RawGoal,
  type RawInsight,
  type RawRound,
  type Settled,
} from './buildPlayerDetailModel';
import type { PlayerDetailModel } from './types';

type Sb = SupabaseClient<Database>;

async function settle<T>(label: string, playerId: string, work: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (err) {
    await logServerError(`[player detail] ${label} read failed: ${describeError(err)}`, {
      action: `playerDetail.${label}`,
      featureArea: 'roster',
      playerId,
    }).catch(() => undefined);
    return { ok: false };
  }
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? ([] as unknown)) as T;
}

export async function loadPlayerDetail(
  supabase: Sb,
  playerId: string,
  firstName: string,
  now: Date = new Date(),
): Promise<PlayerDetailModel> {
  const [rounds, roundStats, genome, insights, focusAreas, goals] = await Promise.all([
    settle('rounds', playerId, async () =>
      unwrap(
        await fetchAllRowsResult((from, to) =>
          supabase
            .from('golf_rounds')
            .select('id, round_date, course_name, total_score, score_to_par, front_nine, back_nine, holes_played, total_putts, round_type, status')
            .eq('player_id', playerId)
            .eq('status', 'completed')
            .order('round_date', { ascending: false })
            .order('id', { ascending: true })
            .range(from, to),
        ),
      ) as RawRound[],
    ),
    settle('roundStats', playerId, async () =>
      unwrap(
        await fetchAllRowsResult<RoundStatsCacheRow>((from, to) =>
          supabase
            .from('golf_round_stats_cache')
            .select(ROUND_STATS_CACHE_COLUMNS)
            .eq('player_id', playerId)
            .order('round_id', { ascending: true })
            .range(from, to),
        ),
      ),
    ),
    settle('genome', playerId, async () => {
      const g = await loadGenome(supabase, playerId);
      return g ? { vector: g.vector, rounds_basis: g.rounds_basis } : null;
    }),
    settle('insights', playerId, async () =>
      unwrap(
        await applyInsightVisibility(
          supabase
            .from('golf_coach_insights')
            .select('id, title, priority, created_at')
            .eq('player_id', playerId)
            .eq('dismissed', false),
        )
          .order('created_at', { ascending: false })
          .limit(20),
      ) as RawInsight[],
    ),
    settle('focusAreas', playerId, async () =>
      unwrap(
        await supabase
          .from('golf_player_focus_areas')
          .select('id, title, status, baseline_value, current_value, target_value')
          .eq('player_id', playerId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(6),
      ) as RawFocusArea[],
    ),
    settle('goals', playerId, async () =>
      unwrap(
        await supabase
          .from('golf_goals')
          .select('id, title, state, baseline_value, current_value, target_value, ends_at')
          .eq('player_id', playerId)
          .eq('state', 'active')
          .order('ends_at', { ascending: true })
          .limit(6),
      ) as RawGoal[],
    ),
  ]);

  return buildPlayerDetailModel({
    firstName,
    seasonYear: now.getUTCFullYear(),
    rounds,
    roundStats,
    genome,
    insights,
    focusAreas,
    goals,
  });
}
