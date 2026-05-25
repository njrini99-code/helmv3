/**
 * v3 composite — load recent Tier-1 insights for synthesis (W28).
 *
 * Reads from golf_coach_insights filtered to the active lifecycle states
 * the synthesis runner wants to consider. Default window: last 30 days
 * (matches v2 upsertInsight's dedup window).
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import type { EvidenceInsight } from './types';

const DEFAULT_WINDOW_DAYS = 30;

export async function loadRecentInsightsForPlayer(
  playerId: string,
  windowDays = DEFAULT_WINDOW_DAYS,
): Promise<EvidenceInsight[]> {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - windowDays * 86400_000).toISOString();

  const { data, error } = await fromUntyped(supabase, 'golf_coach_insights')
    .select('id, insight_type, category, signature, player_id, evidence, engine_version, created_at')
    .eq('player_id', playerId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false }) as {
      data: EvidenceInsight[] | null;
      error: { message: string } | null;
    };

  if (error || !data) return [];
  // Exclude composite rows so we don't synthesize composites of composites.
  return data.filter((row) => !row.signature.startsWith('v3:composite:'));
}
