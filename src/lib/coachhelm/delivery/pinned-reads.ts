/**
 * Reads a live focus area came from, for the CoachHelm Slice 0 fold
 * (`src/app/golf/actions/insight-delivery-reads.ts` `carriesUserState`): a
 * read someone turned into a focus is never folded away. Shared by the
 * delivery actions (`insight-delivery.ts`) and the coach chat tool
 * (`v3/chat/read-tools.ts`). The caller passes its own client, already
 * scoped by RLS to what the viewer may read.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { logBestEffortMiss } from '@/lib/coachhelm/best-effort-miss';
import { chunkIds } from '@/lib/supabase/chunk-ids';

/** A focus that is still in play: the Clubhouse loader's `assigned` statuses. */
export const LIVE_FOCUS_STATUSES = ['proposed', 'active', 'in_progress', 'paused'] as const;

/**
 * The `from_insight_id` of every live focus area of these players. Best
 * effort: a failed read logs one warning and pins nothing, which only means a
 * pinned read could fold as it would have before this rule existed.
 */
export async function loadPinnedReadIds(
  supabase: SupabaseClient<Database> | SupabaseClient,
  playerIds: readonly string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  const ids = Array.from(new Set(playerIds.filter(Boolean)));
  const client = supabase as SupabaseClient<Database>;
  for (const chunk of chunkIds(ids)) {
    const { data, error } = await client
      .from('golf_player_focus_areas')
      .select('from_insight_id')
      .in('player_id', chunk)
      .in('status', [...LIVE_FOCUS_STATUSES])
      .not('from_insight_id', 'is', null);
    if (error) {
      await logBestEffortMiss('loadPinnedReadIds failed (folding without pins)', error.message, {
        action: 'coachhelm.delivery.loadPinnedReadIds',
        featureArea: 'insights',
      }).catch(() => undefined);
      return new Set();
    }
    for (const row of data ?? []) if (row.from_insight_id) out.add(row.from_insight_id);
  }
  return out;
}
