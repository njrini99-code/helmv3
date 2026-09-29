/**
 * Round provenance for v3 insight rows (audit row 22).
 *
 * Every v3 generator already stamps `window_start` / `window_end`; this loads
 * the player's completed, non-test rounds inside that window so the row
 * carries the ids behind its claim. Memoised briefly per (player, window):
 * one engine pass runs ~10 generators for the same player and window.
 * Failure-silent: provenance is additive, so an error returns null and the
 * row ships without it rather than not at all.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const SOURCE_ROUND_IDS_CAP = 200;
const MEMO_TTL_MS = 60_000;
const memo = new Map<string, { at: number; ids: string[] }>();

/** Calendar-date bounds (YYYY-MM-DD) for an ISO window; null when unusable. */
export function windowDateBounds(
  windowStart: string | null | undefined,
  windowEnd: string | null | undefined,
): { from: string; to: string } | null {
  const s = windowStart ? Date.parse(windowStart) : NaN;
  const e = windowEnd ? Date.parse(windowEnd) : NaN;
  if (!Number.isFinite(s) || !Number.isFinite(e) || s > e) return null;
  return { from: new Date(s).toISOString().slice(0, 10), to: new Date(e).toISOString().slice(0, 10) };
}

export async function loadSourceRoundIds(
  supabase: SupabaseClient,
  playerId: string,
  windowStart: string | null | undefined,
  windowEnd: string | null | undefined,
): Promise<string[] | null> {
  const bounds = windowDateBounds(windowStart, windowEnd);
  if (!bounds) return null;
  const key = `${playerId}|${bounds.from}|${bounds.to}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < MEMO_TTL_MS) return hit.ids;
  try {
    const { data, error } = await supabase
      .from('golf_rounds')
      .select('id')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .eq('is_test', false)
      .gte('round_date', bounds.from)
      .lte('round_date', bounds.to)
      .order('round_date', { ascending: false })
      .limit(SOURCE_ROUND_IDS_CAP);
    if (error) return null;
    const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
    memo.set(key, { at: Date.now(), ids });
    return ids;
  } catch {
    return null;
  }
}
