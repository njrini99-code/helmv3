/**
 * Reads a live focus area came from, for the Slice 0 fold
 * (`insight-delivery-reads.ts` `carriesUserState`): a read someone turned
 * into a focus is never folded away. Not in `insight-delivery.ts` because
 * that file is 'use server', where every export must be an async action, and
 * the coach chat tool needs the same lookup.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { logBestEffortMiss } from '@/lib/coachhelm/best-effort-miss';

/** A focus that is still in play: the Clubhouse loader's `assigned` statuses. */
export const LIVE_FOCUS_STATUSES = ['proposed', 'active', 'in_progress', 'paused'] as const;

/** Player ids per `.in()` request, well inside the PostgREST URL limit. */
const CHUNK = 100;

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
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await (supabase as SupabaseClient<Database>)
      .from('golf_player_focus_areas')
      .select('from_insight_id')
      .in('player_id', ids.slice(i, i + CHUNK))
      .in('status', [...LIVE_FOCUS_STATUSES])
      .not('from_insight_id', 'is', null);
    if (error) {
      await logBestEffortMiss('loadPinnedReadIds failed (folding without pins)', error.message, {
        action: 'insight-delivery.loadPinnedReadIds',
        featureArea: 'insights',
      }).catch(() => undefined);
      return new Set();
    }
    for (const row of data ?? []) if (row.from_insight_id) out.add(row.from_insight_id);
  }
  return out;
}
