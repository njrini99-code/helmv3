/**
 * Loads the corrections W is computed from (Slice 6a, flag
 * `coachhelm_corrections_v1`). Called only by `loadCoachWeightsForPlayer` and
 * `loadCoachWeightsForPlayers` (v3/ranking/score.ts) when the flag is on; the
 * arithmetic lives in the pure `coach-weights.ts`.
 *
 * Batched: one read per table for a whole roster (`.in()` chunked at
 * ID_CHUNK_SIZE), and every coach's FULL correction history, paged past the
 * 1000-row PostgREST cap with `fetchAllRowsResult`. W is path-dependent
 * (clamped at every step), so a truncated history would drift.
 *
 * Whose corrections: the player's primary coach (active team membership ->
 * `golf_team_coach_staff.is_primary`), the same coach the outcome-based
 * weights are keyed on, so both sources of W describe one person. A player
 * active on several teams resolves to the first team by id, so the pick is
 * deterministic.
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
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { logServerError } from '@/lib/server-error-logger';
import { computeCoachWeights, type CorrectionWeights, type WeightCorrection } from './coach-weights';
import { CORRECTIONS_TABLE, isMissingTableError, type CorrectionRow } from './types';

type Sb = SupabaseClient<Database>;
type ReadError = { code?: string | null; message?: string };

type CorrectionWithFamily = Pick<
  CorrectionRow,
  'id' | 'insight_id' | 'author_user_id' | 'author_role' | 'kind' | 'created_at'
> & { insight: { insight_type: string | null } | null };

/** The primary coach a player's reads are weighted for. */
export interface PrimaryCoach {
  /** golf_coaches.id (the outcome-weight key). */
  coachId: string;
  /** auth user id (the corrections author key). */
  coachUserId: string;
}

/** Per player: the primary coach and that coach's W from corrections. */
export interface PlayerCorrectionWeights extends PrimaryCoach {
  weights: CorrectionWeights;
}

class CorrectionsReadError extends Error {
  constructor(
    readonly step: string,
    readonly error: ReadError,
  ) {
    super(`${step}: ${error.message ?? 'read failed'}`);
  }
}

function uniq(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))].sort();
}

/**
 * Player -> primary coach, three batched reads (memberships, primary staff,
 * coach users). Throws CorrectionsReadError on a read error; the public
 * loaders catch it.
 */
export async function resolvePrimaryCoaches(
  sb: Sb,
  playerIds: readonly string[],
): Promise<Map<string, PrimaryCoach>> {
  const out = new Map<string, PrimaryCoach>();
  const players = uniq(playerIds);
  if (players.length === 0) return out;

  const teamByPlayer = new Map<string, string>();
  for (const ids of chunkIds(players)) {
    const { data, error } = await fetchAllRowsResult((from, to) =>
      sb
        .from('golf_team_members')
        .select('id, player_id, team_id')
        .in('player_id', ids)
        .eq('status', 'active')
        .order('id', { ascending: true })
        .range(from, to),
    );
    if (error) throw new CorrectionsReadError('memberships', error);
    for (const m of data ?? []) {
      if (!m.player_id || !m.team_id) continue;
      const prev = teamByPlayer.get(m.player_id);
      if (prev === undefined || m.team_id < prev) teamByPlayer.set(m.player_id, m.team_id);
    }
  }
  const teams = uniq([...teamByPlayer.values()]);
  if (teams.length === 0) return out;

  const coachByTeam = new Map<string, string>();
  for (const ids of chunkIds(teams)) {
    const { data, error } = await fetchAllRowsResult((from, to) =>
      sb
        .from('golf_team_coach_staff')
        .select('id, team_id, coach_id')
        .in('team_id', ids)
        .eq('is_primary', true)
        .order('id', { ascending: true })
        .range(from, to),
    );
    if (error) throw new CorrectionsReadError('primary staff', error);
    for (const s of data ?? []) {
      if (s.team_id && s.coach_id && !coachByTeam.has(s.team_id)) coachByTeam.set(s.team_id, s.coach_id);
    }
  }
  const coachIds = uniq([...coachByTeam.values()]);
  if (coachIds.length === 0) return out;

  const userByCoach = new Map<string, string>();
  for (const ids of chunkIds(coachIds)) {
    const { data, error } = await fetchAllRowsResult((from, to) =>
      sb.from('golf_coaches').select('id, user_id').in('id', ids).order('id', { ascending: true }).range(from, to),
    );
    if (error) throw new CorrectionsReadError('coaches', error);
    for (const c of data ?? []) {
      if (c.id && c.user_id) userByCoach.set(c.id, c.user_id);
    }
  }

  for (const [playerId, teamId] of teamByPlayer) {
    const coachId = coachByTeam.get(teamId);
    const coachUserId = coachId ? userByCoach.get(coachId) : undefined;
    if (coachId && coachUserId) out.set(playerId, { coachId, coachUserId });
  }
  return out;
}

/** Every coach-role correction by these authors, the full history, paged. */
async function readCorrections(sb: Sb, coachUserIds: readonly string[]): Promise<WeightCorrection[]> {
  const rows: WeightCorrection[] = [];
  for (const ids of chunkIds(uniq(coachUserIds))) {
    const { data, error } = (await fetchAllRowsResult((from, to) =>
      fromUntyped(sb, CORRECTIONS_TABLE)
        .select(
          'id, insight_id, author_user_id, author_role, kind, created_at, insight:golf_coach_insights!inner(insight_type)',
        )
        .in('author_user_id', ids)
        .eq('author_role', 'coach')
        .order('id', { ascending: true })
        .range(from, to),
    )) as { data: CorrectionWithFamily[] | null; error: ReadError | null };
    if (error) throw new CorrectionsReadError('corrections', error);
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
  }
  return rows;
}

async function logLoadFailure(err: unknown, playerCount: number): Promise<void> {
  const readError = err instanceof CorrectionsReadError ? err : null;
  await logServerError(
    readError
      ? 'loadCorrectionWeightsForPlayers: corrections read failed'
      : 'loadCorrectionWeightsForPlayers: unexpected failure',
    {
      action: 'coachhelm.corrections.loadWeights',
      feature: 'coachhelm_ai_engine',
      featureArea: 'coachhelm_corrections',
      extra: { playerCount, step: readError?.step ?? null },
      ...(readError
        ? { errorCode: readError.error.code ?? undefined }
        : { errorDetails: err instanceof Error ? err.message : String(err) }),
    },
    'warning',
  ).catch(() => undefined);
}

/**
 * W for many players at once (the coach team feed and the roster cards):
 * each player's primary coach, that coach's W. Players with no primary coach
 * are absent from the map (neutral). Never throws: a missing table returns an
 * empty map silently; any other failure logs one warning and returns an
 * empty map, so ranking degrades to neutral instead of failing a feed.
 */
export async function loadCorrectionWeightsForPlayers(
  sb: Sb,
  playerIds: readonly string[],
): Promise<Map<string, PlayerCorrectionWeights>> {
  const out = new Map<string, PlayerCorrectionWeights>();
  const players = uniq(playerIds);
  if (players.length === 0) return out;
  try {
    const coaches = await resolvePrimaryCoaches(sb, players);
    if (coaches.size === 0) return out;

    const coachUserIds = uniq([...coaches.values()].map((c) => c.coachUserId));
    const corrections = await readCorrections(sb, coachUserIds);
    const byCoach = new Map<string, CorrectionWeights>();
    for (const userId of coachUserIds) byCoach.set(userId, computeCoachWeights(corrections, userId));

    for (const [playerId, coach] of coaches) {
      out.set(playerId, { ...coach, weights: byCoach.get(coach.coachUserId) ?? {} });
    }
    return out;
  } catch (err) {
    if (err instanceof CorrectionsReadError && isMissingTableError(err.error)) return new Map();
    await logLoadFailure(err, players.length);
    return new Map();
  }
}

/** W for one player (the per-player feeds). Same rules as the batch. */
export async function loadCorrectionWeightsForPlayer(
  sb: Sb,
  playerId: string,
): Promise<CorrectionWeights> {
  const map = await loadCorrectionWeightsForPlayers(sb, [playerId]);
  return map.get(playerId)?.weights ?? {};
}

/**
 * One page of the corrections on a set of insight ids, with the author, the kind and the team, for the Clubhouse Track record. It lives here because
 * the table is not in the generated types yet and this file already holds the one sanctioned untyped read of it (any-ratchet).
 */
export function selectCorrectionsForInsights(sb: SupabaseClient<Database>, insightIds: string[], from: number, to: number) {
  return fromUntyped(sb, CORRECTIONS_TABLE)
    .select('insight_id, author_user_id, author_role, kind, created_at, team_id')
    .in('insight_id', insightIds)
    .order('id', { ascending: true })
    .range(from, to);
}
