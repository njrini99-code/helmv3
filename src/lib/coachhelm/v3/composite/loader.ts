/**
 * v3 composite — load recent Tier-1 insights for synthesis (W28).
 *
 * Reads from golf_coach_insights filtered to the active lifecycle states
 * the synthesis runner wants to consider. Default window: last 30 days
 * (matches v2 upsertInsight's dedup window).
 */

import {
  V3_ENGINE_FILTER,
  VISIBLE_LIFECYCLE_STATES,
} from '@/lib/coachhelm/v3/insight-visibility';
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

  // Synthesis INPUT must be product-visible v3 evidence (rescore item 5):
  // composing composites from tentative, retracted (archived), dismissed, or
  // retired-v2 rows would launder invisible claims back into a visible card.
  // Same contract as the delivery read paths (insight-visibility module).
  const { data, error } = await fromUntyped(supabase, 'golf_coach_insights')
    .select('id, insight_type, category, signature, player_id, evidence, engine_version, created_at')
    .eq('player_id', playerId)
    .gte('created_at', cutoff)
    .or(V3_ENGINE_FILTER)
    .in('lifecycle_state', [...VISIBLE_LIFECYCLE_STATES])
    .neq('status', 'dismissed')
    .order('created_at', { ascending: false }) as {
      data: EvidenceInsight[] | null;
      error: { message: string } | null;
    };

  if (error) throw new Error(`loadRecentInsightsForPlayer failed: ${error.message}`);
  if (!data) return [];
  // Exclude composite rows so we don't synthesize composites of composites.
  // Guard against null signatures: legacy rows (pre-W21/W28) wrote insights
  // with no signature. Sentry was firing
  //   "synthesizeForPlayer: load failed … Cannot read properties of null (reading 'startsWith')"
  // every time a player had any legacy row in the 30-day window.
  return data.filter((row) => !row.signature?.startsWith('v3:composite:'));
}
