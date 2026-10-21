'use server';

/**
 * CoachHelm corrections (Slice 6a, flag `coachhelm_corrections_v1`, off).
 *
 * Records one coach or player answer to a read in `golf_coachhelm_corrections`
 * (04-output-specs §1.4; 03 §7.2): "Not this" (with an optional reason chip),
 * "Wrong cause" (with an optional alternative), "Already on it", "Show later"
 * and "Good read". The rows feed the coach weight W in ranking
 * (v3/corrections/coach-weights.ts) and the precision counters
 * (v3/corrections/precision-counters.ts).
 *
 * The author is the session user. The player, the team and the author's role
 * are derived from the insight row and the caller's own coach or player row,
 * never from the client. A player may record only "Not this" and "Good read"
 * on their own read. RLS enforces the same rules (migration 20261020121000).
 *
 * Flag off, or the held table missing (42P01 / PGRST205): returns
 * `{ status: 'not_available' }` and writes nothing. Nothing here changes what
 * a coach or player sees until a surface renders the chips.
 */

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerError } from '@/lib/server-error-logger';
import { isCorrectionsEnabled } from '@/lib/coachhelm/v3/corrections/flag';
import {
  parseCorrectionInput,
  type CorrectionInput,
  type CorrectionResult,
} from '@/lib/coachhelm/v3/corrections/input';
import {
  CORRECTIONS_TABLE,
  PLAYER_CORRECTION_KINDS,
  isMissingTableError,
  type CorrectionAuthorRole,
} from '@/lib/coachhelm/v3/corrections/types';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

const ACTION = 'recordCoachHelmCorrection';

/** Who the caller is to this player, from three RLS-scoped reads. */
interface CallerTeams {
  /** Teams the caller coaches that the player is active on (sorted). */
  coachTeams: string[];
  /** Teams the player is active on (sorted). */
  playerTeams: string[];
}

/**
 * The player's active teams and, of those, the ones the caller coaches.
 * Sorted, so the choice of team is deterministic when there are several.
 * Returns null when a read fails, so the action reports a failure instead of
 * treating the caller as a stranger.
 */
async function callerTeamsForPlayer(
  supabase: ServerClient,
  userId: string,
  playerId: string,
): Promise<CallerTeams | null> {
  const [coachRes, membershipRes] = await Promise.all([
    supabase.from('golf_coaches').select('id').eq('user_id', userId).maybeSingle(),
    supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', playerId)
      .eq('status', 'active'),
  ]);
  if (coachRes.error || membershipRes.error) return null;
  const playerTeams = [...new Set((membershipRes.data ?? []).map((m) => m.team_id))]
    .filter((t): t is string => Boolean(t))
    .sort();
  const coachId = coachRes.data?.id;
  if (!coachId) return { coachTeams: [], playerTeams };

  const { data: staff, error: staffErr } = await supabase
    .from('golf_team_coach_staff')
    .select('team_id')
    .eq('coach_id', coachId);
  if (staffErr) return null;
  const staffTeams = new Set((staff ?? []).map((s) => s.team_id).filter(Boolean));
  return { coachTeams: playerTeams.filter((t) => staffTeams.has(t)), playerTeams };
}

/**
 * The player's newest completed, non-test round: the checkpoint anchor. The
 * anchor is optional on the row, so a failed read records no anchor rather
 * than failing the correction.
 */
async function newestRoundId(supabase: ServerClient, playerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('golf_rounds')
    .select('id')
    .eq('player_id', playerId)
    .eq('is_test', false)
    .eq('status', 'completed')
    .order('round_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data?.id ?? null;
}

async function failedLookup(userId: string, what: string): Promise<CorrectionResult> {
  await logServerError(
    `${ACTION}: ${what}`,
    { action: ACTION, feature: 'coachhelm_ai_engine', featureArea: 'coachhelm_corrections', userId },
    'warning',
  );
  return { status: 'failed', error: 'Could not record this correction.' };
}

async function recordCoachHelmCorrectionImpl(input: CorrectionInput): Promise<CorrectionResult> {
  if (!isCorrectionsEnabled()) return { status: 'not_available', reason: 'flag_off' };

  const parsed = parseCorrectionInput(input);
  if (!parsed.ok) return { status: 'invalid', error: parsed.error };
  const value = parsed.value;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'forbidden', error: 'Not authenticated' };

  // RLS-scoped: a caller who cannot see the read cannot correct it.
  const { data: insight, error: insightErr } = await supabase
    .from('golf_coach_insights')
    .select('id, player_id, team_id')
    .eq('id', value.insightId)
    .maybeSingle();
  if (insightErr) {
    await logServerError(
      `${ACTION}: insight lookup failed`,
      {
        action: ACTION,
        feature: 'coachhelm_ai_engine',
        featureArea: 'coachhelm_corrections',
        userId: user.id,
        errorCode: insightErr.code,
      },
      'warning',
    );
    return { status: 'failed', error: 'Could not load this read.' };
  }
  if (!insight?.player_id) return { status: 'forbidden', error: 'Forbidden' };
  const playerId = insight.player_id;

  let authorRole: CorrectionAuthorRole | null = null;
  let teamId: string | null = null;

  const teams = await callerTeamsForPlayer(supabase, user.id, playerId);
  if (!teams) return failedLookup(user.id, 'team lookup failed');
  const { coachTeams, playerTeams } = teams;
  if (coachTeams.length > 0) {
    authorRole = 'coach';
    teamId = insight.team_id && coachTeams.includes(insight.team_id) ? insight.team_id : (coachTeams[0] ?? null);
  } else {
    const { data: player, error: playerErr } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (playerErr) return failedLookup(user.id, 'player lookup failed');
    if (player?.id === playerId) {
      authorRole = 'player';
      // RLS only accepts a team the player is active on (or none).
      teamId = insight.team_id && playerTeams.includes(insight.team_id) ? insight.team_id : null;
    }
  }

  if (!authorRole) return { status: 'forbidden', error: 'Forbidden' };
  if (authorRole === 'player' && !PLAYER_CORRECTION_KINDS.has(value.kind)) {
    return { status: 'forbidden', error: 'Only coaches can make this correction.' };
  }

  const checkpointRoundId = await newestRoundId(supabase, playerId).catch(() => null);

  const row = {
    insight_id: value.insightId,
    player_id: playerId,
    team_id: teamId,
    author_user_id: user.id,
    author_role: authorRole,
    kind: value.kind,
    reason: value.reason,
    alternative_cause_label: value.alternativeCauseLabel,
    free_text: value.freeText,
    checkpoint_round_id: checkpointRoundId,
  };

  const { data: inserted, error: insertErr } = (await fromUntyped(supabase, CORRECTIONS_TABLE)
    .insert(row)
    .select('id')
    .single()) as { data: { id: string } | null; error: { code?: string; message?: string } | null };

  if (insertErr || !inserted?.id) {
    if (isMissingTableError(insertErr)) return { status: 'not_available', reason: 'table_missing' };
    await logServerError(
      `${ACTION}: insert failed`,
      {
        action: ACTION,
        feature: 'coachhelm_ai_engine',
        featureArea: 'coachhelm_corrections',
        userId: user.id,
        playerId,
        errorCode: insertErr?.code,
        metadata: { kind: value.kind, author_role: authorRole },
      },
      'error',
    );
    return { status: 'failed', error: 'Could not save the correction.' };
  }

  return { status: 'recorded', id: inserted.id };
}

const observedRecordCoachHelmCorrection = withAdminObserved(
  'recordCoachHelmCorrection',
  { sport: 'golf', feature: 'coachhelm_ai_engine', demoSafe: true },
  recordCoachHelmCorrectionImpl,
);

export async function recordCoachHelmCorrection(input: CorrectionInput): Promise<CorrectionResult> {
  return observedRecordCoachHelmCorrection(input);
}
