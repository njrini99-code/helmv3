import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A coach's pick reasons for one qualifier (D-35).
 *
 * `golf_qualifier_selections.coach_reasoning` is the coach's note. Migration
 * `20260929200000_golf_qualifier_db_hardening.sql` (held; the owner applies
 * it) takes SELECT on that column away from every signed-in user and adds the
 * coach-gated `golf_qualifier_selection_reasons(p_qualifier_id)` in its place,
 * because column grants can't tell a coach from a player.
 *
 * Readers call this instead of selecting the column, so they work on both
 * sides of the apply: the function first, then the column when the function
 * fails. Before the apply the function doesn't exist (PGRST202) and the column
 * answers; after it, the column is refused, so a failing function still ends
 * in an error, never in a silent empty map. Once the migration is applied the
 * fallback can go.
 *
 * Returns player_id → reasoning. A player (or anyone who isn't a coach of the
 * qualifier's team) gets an empty map from the function.
 */
export async function readQualifierSelectionReasons(
  supabase: SupabaseClient,
  qualifierId: string,
): Promise<{ reasons: Map<string, string | null>; error: { message: string; code?: string } | null }> {
  const viaFunction = (await supabase.rpc('golf_qualifier_selection_reasons' as never, { p_qualifier_id: qualifierId } as never)) as {
    data: Array<{ player_id: string; coach_reasoning: string | null }> | null;
    error: { message: string; code?: string } | null;
  };
  if (!viaFunction.error) return { reasons: toMap(viaFunction.data), error: null };

  // Not applied yet: the column is still readable, under the table's own RLS.
  const viaColumn = await supabase.from('golf_qualifier_selections').select('player_id, coach_reasoning').eq('qualifier_id', qualifierId);
  if (viaColumn.error) return { reasons: new Map(), error: viaFunction.error };
  return { reasons: toMap(viaColumn.data as Array<{ player_id: string; coach_reasoning: string | null }> | null), error: null };
}

function toMap(rows: Array<{ player_id: string; coach_reasoning: string | null }> | null): Map<string, string | null> {
  return new Map((rows ?? []).map((r) => [r.player_id, r.coach_reasoning]));
}
