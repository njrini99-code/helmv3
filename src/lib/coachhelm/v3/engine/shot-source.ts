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

/**
 * Richer tee-shot shape used by TeeStrategyGenerator. Adds the per-hole
 * fields needed to compare driver-vs-layback fairway% + shot distance.
 */
export interface TeeStrategyShot {
  round_id: string;
  hole_number: number | null;
  /** 'driver' | 'non_driver' */
  club_type: 'driver' | 'non_driver';
  /** From golf_holes.par — pre-filtered to par 4/5 only (par-3 tees excluded). */
  par: number;
  /** True when the player's tee shot ended in the fairway. Authoritative
   *  source is golf_holes.fairway_hit; falls back to lie_after = 'fairway'
   *  when the hole-level flag isn't recorded. */
  fairway_hit: boolean;
  /** Yards traveled. Prefer recorded shot_distance; fall back to
   *  hole.yardage - distance_to_hole_after when shot_distance is null. */
  shot_distance: number | null;
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

/**
 * Load this player's tee shots joined to per-hole context, scoped to
 * par-4/5 only (par-3 tees are irrelevant for driver-vs-layback). Used
 * by TeeStrategyGenerator to compare driver-vs-non_driver fairway% +
 * distance gap. See docs/superpowers/plans/2026-04-22-insight-quality/
 * 00-design-contract.md (group B3) for the original v2 contract this
 * loader implements at v3.
 */
export async function loadTeeShotsForStrategy(
  playerId: string,
  windowDays = DEFAULT_WINDOW_DAYS,
): Promise<TeeStrategyShot[]> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString().slice(0, 10);

  interface JoinedRow {
    round_id: string;
    hole_number: number | null;
    club_type: string | null;
    lie_after: string | null;
    shot_distance: number | null;
    distance_to_hole_after: number | null;
    is_penalty: boolean | null;
    golf_rounds: {
      player_id: string | null;
      round_date: string | null;
      status: string | null;
    } | null;
    golf_holes: {
      par: number | null;
      yardage: number | null;
      fairway_hit: boolean | null;
    } | null;
  }

  const { data, error } = await fromUntyped(supabase, 'golf_shots')
    .select(
      `
      round_id, hole_number, club_type, lie_after, shot_distance,
      distance_to_hole_after, is_penalty,
      golf_rounds!inner ( player_id, round_date, status ),
      golf_holes!inner ( par, yardage, fairway_hit )
    `,
    )
    .eq('shot_type', 'tee')
    .eq('golf_rounds.player_id', playerId)
    .eq('golf_rounds.status', 'completed')
    .gte('golf_rounds.round_date', since) as {
      data: JoinedRow[] | null;
      error: { message: string } | null;
    };
  if (error || !data) return [];

  const out: TeeStrategyShot[] = [];
  for (const r of data) {
    const hole = r.golf_holes;
    const round = r.golf_rounds;
    if (!hole || !round) continue;
    // Par-3 tees excluded — layback decision doesn't apply.
    if (hole.par !== 4 && hole.par !== 5) continue;
    if (r.club_type !== 'driver' && r.club_type !== 'non_driver') continue;

    // Prefer the authoritative hole-level fairway_hit flag; only fall
    // back to lie_after when the flag wasn't recorded.
    const fairway =
      hole.fairway_hit === true
        ? true
        : hole.fairway_hit === false
          ? false
          : r.lie_after === 'fairway';

    // Prefer the recorded shot_distance; derive from yardage when null.
    let dist: number | null = r.shot_distance ?? null;
    if (
      dist === null &&
      typeof hole.yardage === 'number' &&
      typeof r.distance_to_hole_after === 'number'
    ) {
      const derived = hole.yardage - r.distance_to_hole_after;
      dist = derived > 0 ? derived : null;
    }

    out.push({
      round_id: r.round_id,
      hole_number: r.hole_number,
      club_type: r.club_type,
      par: hole.par,
      fairway_hit: fairway,
      shot_distance: dist,
      is_penalty: !!r.is_penalty,
    });
  }
  return out;
}
