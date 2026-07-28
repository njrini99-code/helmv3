/**
 * v3 Player Genome — orchestrator (W33-pt1).
 *
 * Loads one player's context, runs every registered dimension over it,
 * and upserts the resulting vector. Designed to be called nightly from
 * a cron route (W33-pt2) or one-off via an API endpoint.
 *
 * Idempotent: re-running over the same data yields the same vector
 * (modulo computed_at). Failure-isolated per-dimension: a thrown
 * exception in one dim records {value:null, confidence:null} for that
 * key and continues — never poisons the rest of the vector.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { logServerError } from '@/lib/server-error-logger';
import { GENOME_DIMENSIONS } from './registry';
import type {
  DimensionResult,
  GenomeContext,
  GenomeHoleScore,
  GenomeRound,
  GenomeShot,
  GenomeVector,
} from './types';
import type { Json } from '@/lib/types/database';
import { describeError } from '@/lib/utils/describe-error';

const WINDOW_DAYS = 90;

/**
 * Why a null dimension is null — stored on the persisted vector so the slot is
 * explicitly LABELLED rather than a bare null the UI has to guess at (P2-21
 * "Label unavailable dimensions explicitly").
 */
const UNAVAILABLE_LABEL = 'Needs more rounds';

export interface ComputeResult {
  player_id: string;
  dimensions_computed: number;
  dimensions_null: number;
  rounds_basis: number;
  errors: number;
  /** Whether a vector was actually written. False when skipped (see below). */
  persisted: boolean;
  /**
   * Why the upsert was skipped, if it was. Distinguishes the two guarded cases
   * (P2-21): a zero-valid-dimension profile (would be an all-null vector) and a
   * source-load failure (must NOT clobber the last good vector).
   */
  skipped_reason: 'none' | 'no_valid_dimensions' | 'source_failure';
}

export async function computeGenomeForPlayer(player_id: string): Promise<ComputeResult> {
  const supabase = createAdminClient();
  const result: ComputeResult = {
    player_id,
    dimensions_computed: 0,
    dimensions_null: 0,
    rounds_basis: 0,
    errors: 0,
    persisted: false,
    skipped_reason: 'none',
  };

  // --- Load context ---
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);
  const { data: rounds, error: roundsErr } = await supabase
    .from('golf_rounds')
    .select('id, round_date, round_type, total_score, score_to_par')
    .eq('player_id', player_id)
    .eq('status', 'completed')
    .gte('round_date', since);

  // SOURCE FAILURE (rounds load) — never overwrite the last good vector with a
  // vector computed from a partial/empty context. Abort before any upsert.
  if (roundsErr) {
    await logServerError(
      `genome: rounds load failed for ${player_id}: ${roundsErr.message}`,
      { action: 'v3.genome.compute' },
    );
    result.errors += 1;
    result.skipped_reason = 'source_failure';
    return result;
  }

  const roundIds = (rounds ?? []).map((r) => r.id);
  const roundMetadata: GenomeRound[] = (rounds ?? []).map((r) => ({
    id: r.id,
    round_date: r.round_date,
    round_type: r.round_type,
    total_score: r.total_score,
    score_to_par: r.score_to_par,
  }));
  result.rounds_basis = roundIds.length;

  let hole_scores: GenomeHoleScore[] = [];
  let shots: GenomeShot[] = [];

  if (roundIds.length > 0) {
    const [{ data: holes, error: holesErr }, { data: shotRows, error: shotsErr }] = await Promise.all([
      fetchAllRowsResult((from, to) => supabase
        .from('golf_holes')
        .select('round_id, hole_number, par, score')
        .in('round_id', roundIds)
        .not('score', 'is', null)
        .order('id', { ascending: true })
        .range(from, to)), // paginate past PostgREST 1000-row cap
      fetchAllRowsResult<GenomeShot>((from, to) => fromUntyped(supabase, 'golf_shots')
        .select(
          'round_id, hole_number, shot_type, club_type, lie_before, lie_after, distance_to_hole_before, distance_to_hole_after, distance_unit_after, miss_direction, is_penalty',
        )
        .in('round_id', roundIds)
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: GenomeShot[] | null; error: { message: string } | null }>),
    ]);

    // SOURCE FAILURE (hole/shot load) — same rule: a half-loaded context would
    // make valid dims compute from missing data, so abort before the upsert and
    // leave the last good vector intact (P2-21).
    if (holesErr || shotsErr) {
      await logServerError(
        `genome: detail load failed for ${player_id}: ${holesErr?.message ?? shotsErr?.message ?? 'unknown'}`,
        { action: 'v3.genome.compute' },
      );
      result.errors += 1;
      result.skipped_reason = 'source_failure';
      return result;
    }

    hole_scores = (holes ?? [])
      .filter((h): h is { round_id: string; hole_number: number; par: number; score: number } =>
        h.score !== null && typeof h.par === 'number',
      )
      .map((h) => ({
        round_id: h.round_id,
        hole_number: h.hole_number,
        par: h.par,
        score: h.score,
      }));
    shots = shotRows ?? [];
  }

  const ctx: GenomeContext = {
    player_id,
    recent_rounds_count: roundIds.length,
    rounds: roundMetadata,
    hole_scores,
    shots,
  };

  // --- Run each dimension; collect into vector ---
  const vector: GenomeVector = {};
  for (const dim of GENOME_DIMENSIONS) {
    let res: DimensionResult;
    try {
      // Honor per-dim min_rounds override before calling compute.
      const min = dim.min_rounds ?? 8;
      if (roundIds.length < min) {
        res = { value: null, confidence: null };
      } else {
        res = dim.compute(ctx);
      }
    } catch (err) {
      await logServerError(
        `genome: ${dim.id} threw for ${player_id}: ${describeError(err)}`,
        { action: 'v3.genome.compute' },
      );
      result.errors += 1;
      res = { value: null, confidence: null };
    }
    if (res.value === null) {
      // Label the empty slot explicitly so the stored vector self-documents why
      // the dimension is unavailable, instead of a bare null (P2-21).
      vector[dim.id] = { ...res, label: res.label ?? UNAVAILABLE_LABEL };
      result.dimensions_null += 1;
    } else {
      vector[dim.id] = res;
      result.dimensions_computed += 1;
    }
  }

  // NO VALID DIMENSIONS — persisting here would write an all-null vector (e.g. a
  // zero-round player), which is exactly the trust-eroding state P2-21 calls out.
  // Skip the upsert: leave any existing row untouched and create nothing new.
  if (result.dimensions_computed === 0) {
    result.skipped_reason = 'no_valid_dimensions';
    return result;
  }

  // --- Upsert (only profiles with ≥1 valid dimension) ---
  const { error: upsertErr } = await supabase
    .from('golf_player_genome')
    .upsert(
      {
        player_id,
        vector: vector as unknown as Json,
        rounds_basis: roundIds.length,
        computed_at: new Date().toISOString(),
      },
      { onConflict: 'player_id' },
    );
  if (upsertErr) {
    await logServerError(`genome upsert failed for ${player_id}: ${upsertErr.message}`, {
      action: 'v3.genome.upsert',
    });
    result.errors += 1;
    return result;
  }

  result.persisted = true;
  return result;
}
