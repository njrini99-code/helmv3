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

const WINDOW_DAYS = 90;

export interface ComputeResult {
  player_id: string;
  dimensions_computed: number;
  dimensions_null: number;
  rounds_basis: number;
  errors: number;
}

export async function computeGenomeForPlayer(player_id: string): Promise<ComputeResult> {
  const supabase = createAdminClient();
  const result: ComputeResult = {
    player_id,
    dimensions_computed: 0,
    dimensions_null: 0,
    rounds_basis: 0,
    errors: 0,
  };

  // --- Load context ---
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);
  const { data: rounds } = await supabase
    .from('golf_rounds')
    .select('id, round_date, round_type, total_score, score_to_par')
    .eq('player_id', player_id)
    .eq('status', 'completed')
    .gte('round_date', since);
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
    const [{ data: holes }, { data: shotRows }] = await Promise.all([
      supabase
        .from('golf_holes')
        .select('round_id, hole_number, par, score')
        .in('round_id', roundIds)
        .not('score', 'is', null)
        .limit(50000), // lift PostgREST 1000-row default cap
      fromUntyped(supabase, 'golf_shots')
        .select(
          'round_id, hole_number, shot_type, club_type, lie_before, lie_after, distance_to_hole_before, distance_to_hole_after, miss_direction, is_penalty',
        )
        .in('round_id', roundIds)
        .limit(50000) as { data: GenomeShot[] | null; error: unknown }, // lift 1000-row cap
    ]);
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
        `genome: ${dim.id} threw for ${player_id}: ${err instanceof Error ? err.message : String(err)}`,
        { action: 'v3.genome.compute' },
      );
      result.errors += 1;
      res = { value: null, confidence: null };
    }
    vector[dim.id] = res;
    if (res.value === null) result.dimensions_null += 1;
    else result.dimensions_computed += 1;
  }

  // --- Upsert ---
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
  }

  return result;
}
