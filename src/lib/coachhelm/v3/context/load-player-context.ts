/**
 * A1 loader (repair-plan addendum §13, A1's second half — the DB-backed
 * counterpart to `types.ts`/`normalize-shot.ts`/`build-hole-sequence.ts`,
 * which stay pure and never read a table).
 *
 * `loadPlayerContext(scope, deps)` is the only place in this package that
 * touches `golf_rounds`/`golf_holes`/`golf_shots`. It returns normalized
 * `ShotFact[]`, authoritative `HoleContext[]` (only holes with a non-null
 * score — see `HoleContext.total_strokes`'s doc comment in `types.ts`), and
 * a coverage summary a caller can use to explain what was excluded and why.
 *
 * Scoping and cutoff — the two boxes A1 originally left deferred:
 *   - `scope.player_id` is the ONLY scope column. `golf_rounds.team_id` is
 *     read (for nothing) but never filtered on — two players sharing a team
 *     must never see each other's rounds through this loader. See the
 *     "does not use team_id to scope" test.
 *   - `window_start`/`window_end` bound `golf_rounds.round_date`.
 *   - `analysis_cutoff` bounds each HOLE's and SHOT's own `created_at` —
 *     `golf_holes`/`golf_shots` carry no separate "observed at" timestamp,
 *     so `created_at` (when the row was recorded) is the closest available
 *     proxy for `ShotFact.observed_at`/the addendum's "observed after the
 *     cutoff" rule. A `null` created_at (a legacy row from before the
 *     column existed) is treated as available rather than excluded —
 *     excluding it would silently shrink historical coverage over a data
 *     gap that has nothing to do with when the shot was actually played.
 *     Rounds themselves are NOT cutoff-filtered: a round's own `created_at`
 *     says when the round record was opened, not when any individual hole
 *     or shot inside it was recorded, and hole/shot-level filtering already
 *     enforces the "nothing observed after cutoff" rule at the granularity
 *     that actually matters.
 *
 * DB dependency is INJECTED via `deps.supabase` — this module never calls
 * `createAdminClient()` itself. A test passes a fake client; a real caller
 * (a cron job, a future generator adapter) passes its own admin client. See
 * `load-player-context.test.ts` for the fake client shape.
 *
 * Every Supabase error is thrown (via `fetchAllRows`), never swallowed into
 * an empty result — an RLS denial or a transient failure must not look like
 * "this player has no rounds."
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { fromUntyped } from '@/lib/supabase/untyped';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { buildHoleSequence } from './build-hole-sequence';
import { normalizeShot, type RawShotInput } from './normalize-shot';
import type { AnalysisScope, HoleContext, ShotFact } from './types';

export interface PlayerContextDeps {
  /** Injected — never constructed inside this module. See the module doc
   *  comment. Typed loosely enough to accept a fake test client. */
  supabase: SupabaseClient<Database>;
}

export interface PlayerContextCoverage {
  /** Holes present in the returned `holes` (and contributing to `shots`). */
  holesIncluded: number;
  /** Holes seen from `golf_holes` but excluded, keyed by reason. Absent key
   *  means zero — this is never pre-seeded with zeroed reasons. */
  holesExcludedByReason: Record<string, number>;
  /** Of the included holes, how many `buildHoleSequence` reports as
   *  incomplete — a diagnostic count. Incomplete holes are still returned
   *  in `holes`/`shots`, never dropped; this is how a caller learns that a
   *  cutoff, or a real ingest gap, cut a sequence short without silently
   *  losing the rest of the hole's shots. */
  partialSequenceCount: number;
}

export interface PlayerContextResult {
  shots: ShotFact[];
  holes: HoleContext[];
  coverage: PlayerContextCoverage;
}

interface RoundRow {
  id: string;
  course_id: string | null;
}

interface HoleRow {
  round_id: string;
  hole_number: number | null;
  par: number | null;
  score: number | null;
  penalty_strokes: number | null;
  putts: number | null;
  gir: boolean | null;
  created_at: string | null;
}

/** `golf_shots` columns this loader selects — the full row `normalizeShot`
 *  needs, plus `created_at` (the `observed_at`/cutoff source; not part of
 *  `RawShotInput` since that type is pure-core and carries no DB-specific
 *  provenance column). */
interface ShotRow {
  round_id: string;
  hole_number: number | null;
  shot_number: number | null;
  shot_type: string | null;
  club_type: string | null;
  distance_to_hole_before: number | null;
  distance_unit_before: string | null;
  distance_to_hole_after: number | null;
  distance_unit_after: string | null;
  lie_before: string | null;
  lie_after: string | null;
  result: string | null;
  is_penalty: boolean | null;
  putt_made: boolean | null;
  created_at: string | null;
}

const HOLE_COLUMNS =
  'round_id, hole_number, par, score, penalty_strokes, putts, gir, created_at';
const SHOT_COLUMNS =
  'round_id, hole_number, shot_number, shot_type, club_type, ' +
  'distance_to_hole_before, distance_unit_before, distance_to_hole_after, ' +
  'distance_unit_after, lie_before, lie_after, result, is_penalty, putt_made, created_at';

/** A `null` created_at is a legacy row predating the column — see the
 *  module doc comment for why that reads as "available", not "excluded". */
function isAtOrBeforeCutoff(createdAt: string | null, cutoff: string): boolean {
  return createdAt === null || createdAt <= cutoff;
}

function bump(counts: Record<string, number>, reason: string): void {
  counts[reason] = (counts[reason] ?? 0) + 1;
}

export async function loadPlayerContext(
  scope: AnalysisScope,
  deps: PlayerContextDeps,
): Promise<PlayerContextResult> {
  const { supabase } = deps;

  // --- Rounds: the player/window-scoped id list ---------------------------
  let roundsQuery = fromUntyped(supabase, 'golf_rounds')
    .select('id, course_id')
    .eq('player_id', scope.player_id);
  if (scope.window_start) roundsQuery = roundsQuery.gte('round_date', scope.window_start);
  if (scope.window_end) roundsQuery = roundsQuery.lte('round_date', scope.window_end);

  const rounds = await fetchAllRows<RoundRow>((from, to) =>
    roundsQuery.order('id', { ascending: true }).range(from, to),
  );

  const holesExcludedByReason: Record<string, number> = {};

  if (rounds.length === 0) {
    return { shots: [], holes: [], coverage: { holesIncluded: 0, holesExcludedByReason, partialSequenceCount: 0 } };
  }

  const courseByRound = new Map<string, string | null>();
  for (const r of rounds) courseByRound.set(r.id, r.course_id ?? null);
  const roundIds = [...courseByRound.keys()];

  // --- Holes: chunk the round-id list (PostgREST URL cap), paginate each
  // chunk (the 1000-row response cap) --------------------------------------
  const holeRows: HoleRow[] = [];
  for (const idChunk of chunkIds(roundIds)) {
    const rows = await fetchAllRows<HoleRow>((from, to) =>
      fromUntyped(supabase, 'golf_holes')
        .select(HOLE_COLUMNS)
        .in('round_id', idChunk)
        .order('id', { ascending: true })
        .range(from, to),
    );
    holeRows.push(...rows);
  }

  const holes: HoleContext[] = [];
  for (const h of holeRows) {
    // Mirrors hole-diagnosis.ts's ground-truth filter: a HoleContext only
    // ever represents a hole with a real recorded score.
    if (h.score === null) {
      bump(holesExcludedByReason, 'null_score');
      continue;
    }
    // Defensive — hole_number/par are NOT NULL in golf_holes, but a raw
    // query result is never trusted over the type it's cast to.
    if (typeof h.par !== 'number' || h.hole_number === null) {
      bump(holesExcludedByReason, 'missing_par_or_hole_number');
      continue;
    }
    if (!isAtOrBeforeCutoff(h.created_at, scope.analysis_cutoff)) {
      bump(holesExcludedByReason, 'after_cutoff');
      continue;
    }
    holes.push({
      round_id: h.round_id,
      course_id: courseByRound.get(h.round_id) ?? null,
      hole_number: h.hole_number,
      par: h.par,
      total_strokes: h.score,
      penalty_strokes: h.penalty_strokes,
      putts: h.putts,
      gir: h.gir,
    });
  }

  // --- Shots: same chunk/paginate, then normalize + cutoff ----------------
  const shotRows: ShotRow[] = [];
  for (const idChunk of chunkIds(roundIds)) {
    const rows = await fetchAllRows<ShotRow>((from, to) =>
      fromUntyped(supabase, 'golf_shots')
        .select(SHOT_COLUMNS)
        .in('round_id', idChunk)
        .order('id', { ascending: true })
        .range(from, to),
    );
    shotRows.push(...rows);
  }

  const shots: ShotFact[] = [];
  for (const s of shotRows) {
    // A shot recorded after the cutoff is excluded outright (not just its
    // hole) — this can turn an otherwise-complete hole into a partial
    // sequence, which is exactly what `partialSequenceCount` below surfaces.
    if (!isAtOrBeforeCutoff(s.created_at, scope.analysis_cutoff)) continue;
    const raw: RawShotInput = {
      round_id: s.round_id,
      hole_number: s.hole_number,
      shot_number: s.shot_number,
      shot_type: s.shot_type,
      club_type: s.club_type,
      distance_to_hole_before: s.distance_to_hole_before,
      distance_unit_before: s.distance_unit_before,
      distance_to_hole_after: s.distance_to_hole_after,
      distance_unit_after: s.distance_unit_after,
      lie_before: s.lie_before,
      lie_after: s.lie_after,
      result: s.result,
      is_penalty: s.is_penalty,
      putt_made: s.putt_made,
      // `created_at` is the closest available proxy for "observed" (see
      // module doc comment); a null one (legacy row, kept above) falls back
      // to the cutoff instant itself — the shot IS included, so it needs
      // SOME ISO timestamp, and the cutoff is the most conservative honest
      // value available when the real one was never recorded.
      observed_at: s.created_at ?? scope.analysis_cutoff,
    };
    shots.push(normalizeShot(raw));
  }

  // --- Coverage: partial-sequence diagnostic ------------------------------
  let partialSequenceCount = 0;
  for (const hole of holes) {
    if (!buildHoleSequence(shots, hole).complete) partialSequenceCount += 1;
  }

  return {
    shots,
    holes,
    coverage: {
      holesIncluded: holes.length,
      holesExcludedByReason,
      partialSequenceCount,
    },
  };
}
