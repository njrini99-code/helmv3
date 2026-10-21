/**
 * The team rounds a same-day field is built from (Slice 7b): one team's
 * completed, non-test, countable rounds from `since` on, with their course.
 * Read only with `coachhelm_team_pattern_v1` on. A failed read returns null
 * and the caller keeps its read without the field context; it never throws.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { isCountableRound } from '@/lib/golf/round-countable';
import { logServerEvent } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import type { FieldRoundInput } from './field';

interface Row {
  id: string;
  player_id: string;
  team_id: string | null;
  course_id: string | null;
  round_date: string | null;
  score_to_par: number | null;
  holes_played: number | null;
  total_score: number | null;
  front_nine: number | null;
  back_nine: number | null;
  total_putts: number | null;
}

export async function loadTeamFieldRounds(
  supabase: SupabaseClient,
  teamId: string,
  since: string,
): Promise<FieldRoundInput[] | null> {
  try {
    const res = await fetchAllRowsResult<Row>(
      (from, to) =>
        supabase
          .from('golf_rounds')
          .select('id, player_id, team_id, course_id, round_date, score_to_par, holes_played, total_score, front_nine, back_nine, total_putts')
          .eq('team_id', teamId)
          .eq('status', 'completed')
          .eq('is_test', false)
          .gte('round_date', since)
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
    );
    if (res.error) throw new Error(res.error.message);
    const out: FieldRoundInput[] = [];
    for (const r of res.data ?? []) {
      if (!r.round_date || !isCountableRound(r)) continue;
      out.push({
        round_id: r.id,
        player_id: r.player_id,
        team_id: r.team_id,
        date: r.round_date.slice(0, 10),
        course_id: r.course_id,
        score_to_par: r.score_to_par,
        holes: r.holes_played ?? 18,
      });
    }
    return out;
  } catch (err) {
    try {
      await logServerEvent(
        'coachhelm.fieldDay: team rounds read failed; reads keep no field context',
        { action: 'coachhelm.v3.fieldDay.load', featureArea: 'coachhelm', extra: { error: describeError(err) } },
        'warning',
      );
    } catch {
      // Logging never fails a generator run.
    }
    return null;
  }
}
