/**
 * v3 genome loader (W34).
 *
 * Server-side helpers for loading one or more players' genomes.
 * RLS gates what the client can read; these helpers stay tolerant of
 * "no row yet" (the orchestrator may not have run for new players).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { GenomeVector } from './types';
import { retireOutdatedDimensions } from './dimension-validity';

type Sb = SupabaseClient<Database>;

export interface LoadedGenome {
  player_id: string;
  vector: GenomeVector;
  computed_at: string | null;
  rounds_basis: number;
}

/**
 * True when a (possibly retired) vector has no dimension with a real value.
 *
 * Two different ways a row ends up here, same UI treatment either way:
 *
 *   1. A REFUSAL MARKER (#1503) — `computeGenomeForPlayer` now writes a row
 *      even when every dimension refused, so `selectGenomeRefreshChunk` stops
 *      reading a structurally-uncomputable player as never-computed and
 *      re-queuing them every night. See orchestrator.ts. That marker's
 *      `computed_at` is real (needed for the selector) but there is nothing
 *      in it to show — it must read exactly like "no row yet" here.
 *   2. Every dimension the row ever had has since been RETIRED
 *      (dimension-validity.ts) — the row predates every dimension it carries,
 *      so post-retirement there is equally nothing left to show.
 *
 * Vacuously true for `{}` (no keys at all), which is correct: nothing to show
 * either way.
 */
function isUncomputed(vector: GenomeVector): boolean {
  return Object.values(vector).every((d) => d?.value == null);
}

/**
 * Loads one player's genome. Returns null if no row exists yet — OR if the
 * row exists but has nothing computed (see isUncomputed above); the two are
 * indistinguishable to any coach/player-facing caller and must stay that way.
 *
 * "No row exists yet" is a real state here — the genome page renders a
 * Compute-now prompt for it. That is exactly why the error could not keep
 * being discarded: a FAILED read also produced null, so a database blip told a
 * coach this player had never been analysed and invited them to recompute a
 * genome that already exists.
 *
 * Throwing matches the sibling loaders in this tree (standing/loader.ts,
 * goals/loader.ts), which both already do this.
 */
export async function loadGenome(sb: Sb, player_id: string): Promise<LoadedGenome | null> {
  const { data, error } = await sb
    .from('golf_player_genome')
    .select('player_id, vector, computed_at, rounds_basis')
    .eq('player_id', player_id)
    .maybeSingle();
  if (error) {
    throw new Error(`loadGenome(${player_id}): ${error.message}`);
  }
  if (!data) return null;
  // Retire any dimension whose formula was corrected after this row was
  // written — a value the engine would no longer produce must not reach a
  // coach as if it were current. See ./dimension-validity.ts.
  const vector = retireOutdatedDimensions(
    (data.vector as unknown as GenomeVector) ?? {},
    data.computed_at,
  );
  if (isUncomputed(vector)) return null;
  return {
    player_id: data.player_id,
    vector,
    computed_at: data.computed_at,
    rounds_basis: data.rounds_basis,
  };
}

/**
 * Batch loader for the compare page. Same reasoning as loadGenome — an empty
 * array here means "compare these players and none of them has a genome",
 * which is a conclusion, not an outage. A player with only a refusal marker
 * or a fully-retired vector (see isUncomputed above) is dropped from the
 * result for the same reason loadGenome returns null for one: nothing to show.
 */
export async function loadGenomes(sb: Sb, player_ids: string[]): Promise<LoadedGenome[]> {
  if (player_ids.length === 0) return [];
  const { data, error } = await sb
    .from('golf_player_genome')
    .select('player_id, vector, computed_at, rounds_basis')
    .in('player_id', player_ids);
  if (error) {
    throw new Error(`loadGenomes(${player_ids.length} players): ${error.message}`);
  }
  return (data ?? [])
    .map((d) => ({
      player_id: d.player_id,
      // Same retirement as loadGenome — the compare page must not be the one
      // surface that still shows a corrected-away reading.
      vector: retireOutdatedDimensions((d.vector as unknown as GenomeVector) ?? {}, d.computed_at),
      computed_at: d.computed_at,
      rounds_basis: d.rounds_basis,
    }))
    .filter((g) => !isUncomputed(g.vector));
}
