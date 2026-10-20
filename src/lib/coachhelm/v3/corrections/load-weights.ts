/**
 * Loads the corrections W is computed from (Slice 6a, flag
 * `coachhelm_corrections_v1`). Called only by `loadCoachWeightsForPlayer`
 * (v3/ranking/score.ts) when the flag is on; the arithmetic lives in the pure
 * `coach-weights.ts`.
 *
 * Whose corrections: the player's primary coach (active team membership ->
 * `golf_team_coach_staff.is_primary`), the same coach the outcome-based
 * weights are keyed on, so both sources of W describe one person.
 *
 * Under RLS (04 §1.4: "author reads own; coach reads own team's") a coach on
 * the player's staff reads those rows and a player reads none of them, so a
 * player's own surfaces rank with a neutral W: a coach's private judgement
 * does not reorder what the player sees. That is a consequence of the policy,
 * kept on purpose (coach-first, 00 open question 4).
 *
 * Never throws. The table is HELD (20261020121000): a missing table
 * (42P01 / PGRST205) is "not available" and returns {} silently; any other
 * failure is logged as a warning and also returns {}, so ranking degrades to
 * neutral weights instead of failing a feed.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';
import { computeCoachWeights, type CorrectionWeights, type WeightCorrection } from './coach-weights';
import { CORRECTIONS_TABLE, isMissingTableError, type CorrectionRow } from './types';

type Sb = SupabaseClient<Database>;

/** Newest corrections read per coach. A coach reaching this is years away. */
export const CORRECTIONS_READ_CAP = 1000;

type CorrectionWithFamily = Pick<
  CorrectionRow,
  'insight_id' | 'author_user_id' | 'author_role' | 'kind' | 'created_at'
> & { insight: { insight_type: string | null } | null };

async function resolvePrimaryCoachUserId(sb: Sb, playerId: string): Promise<string | null> {
  const { data: membership } = await sb
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (!membership?.team_id) return null;

  const { data: staff } = await sb
    .from('golf_team_coach_staff')
    .select('coach_id')
    .eq('team_id', membership.team_id)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle();
  if (!staff?.coach_id) return null;

  const { data: coach } = await sb
    .from('golf_coaches')
    .select('user_id')
    .eq('id', staff.coach_id)
    .maybeSingle();
  return coach?.user_id ?? null;
}

export async function loadCorrectionWeightsForPlayer(
  sb: Sb,
  playerId: string,
): Promise<CorrectionWeights> {
  try {
    const coachUserId = await resolvePrimaryCoachUserId(sb, playerId);
    if (!coachUserId) return {};

    const { data, error } = (await fromUntyped(sb, CORRECTIONS_TABLE)
      .select(
        'insight_id, author_user_id, author_role, kind, created_at, insight:golf_coach_insights!inner(insight_type)',
      )
      .eq('author_user_id', coachUserId)
      .eq('author_role', 'coach')
      .order('created_at', { ascending: false })
      .limit(CORRECTIONS_READ_CAP)) as {
      data: CorrectionWithFamily[] | null;
      error: { code?: string; message?: string } | null;
    };

    if (error) {
      if (isMissingTableError(error)) return {};
      await logServerError(
        'loadCorrectionWeightsForPlayer: corrections read failed',
        {
          action: 'coachhelm.corrections.loadWeights',
          feature: 'coachhelm_ai_engine',
          featureArea: 'coachhelm_corrections',
          playerId,
          errorCode: error.code,
        },
        'warning',
      );
      return {};
    }

    const rows: WeightCorrection[] = [];
    for (const r of data ?? []) {
      const family = r.insight?.insight_type;
      if (!family) continue;
      rows.push({
        insight_id: r.insight_id,
        author_user_id: r.author_user_id,
        author_role: r.author_role,
        kind: r.kind,
        created_at: r.created_at,
        family,
      });
    }
    return computeCoachWeights(rows, coachUserId);
  } catch (err) {
    await logServerError(
      'loadCorrectionWeightsForPlayer: unexpected failure',
      {
        action: 'coachhelm.corrections.loadWeights',
        feature: 'coachhelm_ai_engine',
        featureArea: 'coachhelm_corrections',
        playerId,
        errorDetails: err instanceof Error ? err.message : String(err),
      },
      'warning',
    ).catch(() => undefined);
    return {};
  }
}
