/**
 * Phase C foundational helper (Phase C0) — per-hole diagnosis primitives.
 *
 * Every Phase C engine (par-type, course-mgmt, pressure, warmup) imports
 * this module to decompose a player's recent holes into outcome classes
 * (`classifyHole`) and proximate causes (`proximateCause`). Those two pure
 * functions, plus the `loadCompletedHoles` reader, define the SEMANTICS the
 * Phase C decompositions must reconcile against ground truth — keep them
 * byte-stable with how the consumers read them:
 *
 *   - C1 par-type buckets holes by `score - par` (the same thresholds as
 *     `classifyHole`).
 *   - C3 course-mgmt switches on `proximateCause(h)` with the precedence
 *     penalty > three_putt > missed_gir_no_scramble > clean.
 *
 * Window: 90 days, completed rounds only, `total_score IS NOT NULL`. Returns
 * one `DiagnosisHole` per hole that has a non-null score. Reads through
 * `createAdminClient` + `fromUntyped` and MUST paginate the `golf_holes`
 * fetch past the PostgREST 1000-row cap — a high-volume player exceeds 1000
 * holes in 90 days and a bare fetch silently truncates (the same bug fixed
 * across `shot-source.ts`). Returns `[]` on failure so engines no-op cleanly.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';

export interface DiagnosisHole {
  round_id: string;
  hole_number: number;
  par: number;
  score: number;
  putts: number;
  penalty_strokes: number;
  gir: boolean;
  up_and_down: boolean;
}

const DEFAULT_WINDOW_DAYS = 90;

/** Raw `golf_holes` row shape this loader selects. */
interface HoleRow {
  round_id: string;
  hole_number: number | null;
  par: number | null;
  score: number | null;
  putts: number | null;
  penalty_strokes: number | null;
  gir: boolean | null;
}

/**
 * Load every completed hole for the player in the window, normalized into
 * `DiagnosisHole`s with the canonical penalty source and the engine's
 * derived up-and-down flag.
 *
 * Field derivations (verified against the DB + the engine):
 *   - `penalty_strokes` = canonical `golf_holes.penalty_strokes` (authoritative
 *     count of `is_penalty` shots; NOT a drifted round-level column).
 *   - `gir` = `golf_holes.gir` (false when null/missing).
 *   - `up_and_down` is DERIVED as `gir === false && (score - par) <= 0` — the
 *     same scramble/up-and-down rule the stats engine uses
 *     (`golf-stats-calculator-shots.ts`). We derive rather than read the
 *     `golf_holes.up_and_down` COLUMN to decouple from column-population drift:
 *     the column is sparsely populated, and reading it directly would make the
 *     scramble signal depend on whether an ingest path happened to back-fill it.
 *     Deriving is byte-identical to the column wherever the column IS set
 *     (0 disagreements across 3068 holes, verified 2026-06-08), so the change is
 *     purely about robustness, not a different answer. (The null rows are 100%
 *     GIR holes, so reading the column would actually have agreed too — the
 *     prior "would mis-classify scramble holes" justification was inaccurate.)
 */
/**
 * Effectively-unbounded window for cache-coherent callers (regrade VAL-P1/P2):
 * generators whose headline value is the LIFETIME cache scalar must decompose
 * over the same lifetime hole set, not a silent 90-day subset — mixed
 * denominators printed "you average 4.47 on 66 par 4s" where the 66 holes'
 * true average was 4.455.
 */
export const LIFETIME_WINDOW_DAYS = 3650;

export async function loadCompletedHoles(
  playerId: string,
  windowDays = DEFAULT_WINDOW_DAYS,
): Promise<DiagnosisHole[]> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString().slice(0, 10);

  // Completed rounds with a recorded total in the window (matches the Phase C
  // ground-truth filter). total_score guards against in-progress / abandoned
  // rounds that flipped to 'completed' without a final tally.
  const { data: rounds, error: rErr } = await supabase
    .from('golf_rounds')
    .select('id')
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .not('total_score', 'is', null)
    .gte('round_date', since);
  if (rErr) throw new Error(`hole-diagnosis rounds query failed: ${rErr.message}`);
  if (!rounds || rounds.length === 0) return [];
  const roundIds = rounds.map((r) => r.id);

  const { data, error } = await fetchAllRowsResult<HoleRow>((from, to) =>
    fromUntyped(supabase, 'golf_holes')
      .select('round_id, hole_number, par, score, putts, penalty_strokes, gir')
      .in('round_id', roundIds)
      .not('score', 'is', null)
      .order('id', { ascending: true })
      .range(from, to)); // paginate past PostgREST 1000-row cap
  if (error) throw new Error(`hole-diagnosis holes query failed: ${error.message}`);
  if (!data) return [];

  const out: DiagnosisHole[] = [];
  for (const r of data) {
    if (r.score === null || typeof r.par !== 'number' || r.hole_number === null) continue;
    const par = r.par;
    const score = r.score;
    const gir = r.gir === true;
    out.push({
      round_id: r.round_id,
      hole_number: r.hole_number,
      par,
      score,
      putts: r.putts ?? 0,
      penalty_strokes: r.penalty_strokes ?? 0,
      gir,
      // Engine scramble/up-and-down rule (golf-stats-calculator-shots.ts):
      // missed the green but still made par or better.
      up_and_down: !gir && score - par <= 0,
    });
  }
  return out;
}

/**
 * Classify a hole by score relative to par. Thresholds match C1's par-type
 * decomposition exactly (`over <= -1` birdie-or-better, `=== 0` par,
 * `=== 1` bogey, `>= 2` double-plus).
 */
export function classifyHole(
  h: DiagnosisHole,
): 'birdie_or_better' | 'par' | 'bogey' | 'double_plus' {
  const over = h.score - h.par;
  if (over < 0) return 'birdie_or_better';
  if (over === 0) return 'par';
  if (over === 1) return 'bogey';
  return 'double_plus';
}

/**
 * Name the single proximate cause that most directly explains the hole's
 * outcome. Precedence (matches C3's switch in course-mgmt.ts):
 *   1. penalty       — any penalty stroke on the hole.
 *   2. three_putt    — 3 putts or more (and no penalty).
 *   3. missed_gir_no_scramble — missed the green AND failed to get up-and-down.
 *   4. clean         — hit the green, or scrambled, with no penalty / 3-putt.
 *
 * The order is intentional: a penalty + 3-putt hole is attributed to the
 * penalty (the upstream, higher-leverage error), never double-counted.
 */
export function proximateCause(
  h: DiagnosisHole,
): 'penalty' | 'three_putt' | 'missed_gir_no_scramble' | 'clean' {
  if (h.penalty_strokes > 0) return 'penalty';
  if (h.putts >= 3) return 'three_putt';
  if (!h.gir && !h.up_and_down) return 'missed_gir_no_scramble';
  return 'clean';
}
