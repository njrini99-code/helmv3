/**
 * v3 engine shot-source helper.
 *
 * Centralized read of `golf_shots` for v3 generators that operate at
 * shot level (ApproachMiss, TeeStrategy, future composite rules).
 *
 * IMPORTANT — 3-bucket club model:
 *   golf_shots.club_type is one of: 'driver' | 'non_driver' | 'putter'.
 *   No per-iron / per-wedge distinction at the data layer (master plan
 *   Part V.1.5). Generators must NOT assume "long iron" vs "wedge" —
 *   bucket by APPROACH DISTANCE instead.
 *
 * Default window: 90 days, completed rounds only.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';

export type ApproachBucket = '50_125ft' | '125_175ft' | '175_plus_ft';

export interface ApproachShot {
  round_id: string;
  hole_number: number | null;
  shot_number: number | null;
  distance_to_hole_before: number; // yards
  distance_to_hole_after: number;  // unit per distance_unit_after; treat as feet for proximity
  lie_before: string | null;
  is_penalty: boolean;
  miss_direction: string | null;
}

export interface TeeShot {
  round_id: string;
  hole_number: number | null;
  /** 'driver' | 'non_driver' */
  club_type: string;
  lie_after: string | null;
  is_penalty: boolean;
}

/** Bucket a yards-to-hole value into v3 approach metric buckets. */
export function bucketApproachDistance(yards: number): ApproachBucket | null {
  if (yards >= 50 && yards < 125) return '50_125ft';
  if (yards >= 125 && yards < 175) return '125_175ft';
  if (yards >= 175) return '175_plus_ft';
  return null;
}

const DEFAULT_WINDOW_DAYS = 90;

/**
 * Load this player's approach shots in the last N days. Joined to
 * completed rounds only. Returns the raw shots — generators bucket
 * + aggregate themselves.
 */
export async function loadApproachShots(
  playerId: string,
  windowDays = DEFAULT_WINDOW_DAYS,
): Promise<ApproachShot[]> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString().slice(0, 10);

  // First get round_ids for this player in the window (completed only)
  const { data: rounds, error: rErr } = await supabase
    .from('golf_rounds')
    .select('id')
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .gte('round_date', since);
  if (rErr || !rounds || rounds.length === 0) return [];
  const roundIds = rounds.map((r) => r.id);

  const { data, error } = await fromUntyped(supabase, 'golf_shots')
    .select(
      'round_id, hole_number, shot_number, distance_to_hole_before, distance_to_hole_after, lie_before, is_penalty, miss_direction',
    )
    .eq('shot_type', 'approach')
    .in('round_id', roundIds) as {
      data: ApproachShot[] | null;
      error: { message: string } | null;
    };
  if (error || !data) return [];
  return data.filter(
    (s) =>
      typeof s.distance_to_hole_before === 'number' &&
      typeof s.distance_to_hole_after === 'number',
  );
}

/**
 * Load this player's tee shots in the last N days. Per 3-bucket model
 * club_type is 'driver' or 'non_driver'. Combine with hole outcome to
 * detect driver-vs-layback strategy patterns.
 */
export async function loadTeeShots(
  playerId: string,
  windowDays = DEFAULT_WINDOW_DAYS,
): Promise<TeeShot[]> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString().slice(0, 10);

  const { data: rounds, error: rErr } = await supabase
    .from('golf_rounds')
    .select('id')
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .gte('round_date', since);
  if (rErr || !rounds || rounds.length === 0) return [];
  const roundIds = rounds.map((r) => r.id);

  const { data, error } = await fromUntyped(supabase, 'golf_shots')
    .select('round_id, hole_number, club_type, lie_after, is_penalty')
    .eq('shot_type', 'tee')
    .in('round_id', roundIds) as {
      data: TeeShot[] | null;
      error: { message: string } | null;
    };
  if (error || !data) return [];
  return data.filter((s) => s.club_type === 'driver' || s.club_type === 'non_driver');
}
