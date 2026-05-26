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

type Sb = SupabaseClient<Database>;

export interface LoadedGenome {
  player_id: string;
  vector: GenomeVector;
  computed_at: string | null;
  rounds_basis: number;
}

/** Loads one player's genome. Returns null if no row exists yet. */
export async function loadGenome(sb: Sb, player_id: string): Promise<LoadedGenome | null> {
  const { data } = await sb
    .from('golf_player_genome')
    .select('player_id, vector, computed_at, rounds_basis')
    .eq('player_id', player_id)
    .maybeSingle();
  if (!data) return null;
  return {
    player_id: data.player_id,
    vector: (data.vector as unknown as GenomeVector) ?? {},
    computed_at: data.computed_at,
    rounds_basis: data.rounds_basis,
  };
}

/** Batch loader for the compare page. */
export async function loadGenomes(sb: Sb, player_ids: string[]): Promise<LoadedGenome[]> {
  if (player_ids.length === 0) return [];
  const { data } = await sb
    .from('golf_player_genome')
    .select('player_id, vector, computed_at, rounds_basis')
    .in('player_id', player_ids);
  return (data ?? []).map((d) => ({
    player_id: d.player_id,
    vector: (d.vector as unknown as GenomeVector) ?? {},
    computed_at: d.computed_at,
    rounds_basis: d.rounds_basis,
  }));
}
