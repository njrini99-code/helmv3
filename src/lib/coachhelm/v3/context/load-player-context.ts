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
 *   - Player scoping here rests SOLELY on the query's `.eq('player_id',
 *     scope.player_id')` filter — there is no separate authorization check
 *     inside this module. `deps.supabase` is caller-supplied and may be an
 *     admin client (no RLS at all) or a session-scoped client (RLS as an
 *     independent second layer); either way, whoever calls
 *     `loadPlayerContext` is responsible for only ever passing the
 *     `scope.player_id` the caller is actually authorized to read. See
 *     "filters rows by scope.player_id" in `load-player-context.test.ts`.
 *   - Rounds are further scoped to `status = 'completed'`, matching every
 *     sibling reader (`shot-source.ts`, `causality/attribute.ts`,
 *     `chat/read-tools.ts`, `goals/window-metric.ts`) — an in-progress
 *     round's holes/shots are still being written and are not settled
 *     evidence yet.
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
 *   - A shot's `updated_at` is checked too, separately from `created_at`: a
 *     shot edited strictly AFTER the cutoff is excluded with reason
 *     `edited_after_cutoff` — its current value isn't what was known as of
 *     the cutoff, even though the row itself existed earlier.
 *     `golf_holes` has no `updated_at` column, so this check applies to
 *     shots only. A shot whose owning hole was itself excluded (any
 *     reason) is also excluded, with reason `hole_excluded` — a direct
 *     shot consumer (e.g. `metrics/distance-profile.ts`) must not keep
 *     evidence from a hole this loader has already disowned. Cutoff and
 *     recorded timestamps are compared as instants (`Date.parse`), never
 *     as raw ISO strings.
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
  /** Shots seen from `golf_shots` but excluded, keyed by reason:
   *  `after_cutoff` (the shot's own `created_at` is after the cutoff),
   *  `edited_after_cutoff` (the shot's `updated_at` is after the cutoff —
   *  its current value isn't what was known as of the cutoff, even if it
   *  was first recorded earlier), or `hole_excluded` (the owning hole was
   *  itself excluded — see `holesExcludedByReason` — and A2 and other
   *  direct shot consumers must not silently keep evidence from a hole
   *  the loader has already disowned). Absent key means zero. */
  shotsExcludedByReason: Record<string, number>;
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
  yardage: number | null;
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
  miss_direction: string | null;
  created_at: string | null;
  updated_at: string | null;
}

const HOLE_COLUMNS =
  'round_id, hole_number, par, score, penalty_strokes, putts, gir, yardage, created_at';
const SHOT_COLUMNS =
  'round_id, hole_number, shot_number, shot_type, club_type, ' +
  'distance_to_hole_before, distance_unit_before, distance_to_hole_after, ' +
  'distance_unit_after, lie_before, lie_after, result, is_penalty, putt_made, ' +
  'miss_direction, created_at, updated_at';

/** A `null` created_at is a legacy row predating the column — see the
 *  module doc comment for why that reads as "available", not "excluded".
 *  Both sides are parsed to instants (`Date.parse`), never compared as raw
 *  ISO strings — a naive string comparison only agrees with instant order
 *  for timestamps sharing one format/precision/offset, which production
 *  rows are not guaranteed to. */
function isAtOrBeforeCutoff(createdAt: string | null, cutoff: string): boolean {
  return createdAt === null || Date.parse(createdAt) <= Date.parse(cutoff);
}

/** True when a row was edited strictly after the cutoff — its CURRENT
 *  value is not what was known as of `cutoff`, even if it was first
 *  created before. `null` (never edited, or the column predates this row)
 *  is never treated as "edited after". */
function wasEditedAfterCutoff(updatedAt: string | null, cutoff: string): boolean {
  return updatedAt !== null && Date.parse(updatedAt) > Date.parse(cutoff);
}

function holeKey(roundId: string, holeNumber: number | null): string | null {
  return holeNumber === null ? null : `${roundId}:${holeNumber}`;
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
    .eq('player_id', scope.player_id)
    .eq('status', 'completed');
  if (scope.window_start) roundsQuery = roundsQuery.gte('round_date', scope.window_start);
  if (scope.window_end) roundsQuery = roundsQuery.lte('round_date', scope.window_end);

  const rounds = await fetchAllRows<RoundRow>((from, to) =>
    roundsQuery.order('id', { ascending: true }).range(from, to),
  );

  const holesExcludedByReason: Record<string, number> = {};
  const shotsExcludedByReason: Record<string, number> = {};

  if (rounds.length === 0) {
    return {
      shots: [],
      holes: [],
      coverage: { holesIncluded: 0, holesExcludedByReason, shotsExcludedByReason, partialSequenceCount: 0 },
    };
  }

  const courseByRound = new Map<string, string | null>();
  for (const r of rounds) courseByRound.set(r.id, r.course_id ?? null);
  const roundIds = [...courseByRound.keys()];
  // Hoisted — both the holes and shots queries chunk the same round-id
  // list (PostgREST URL cap), so compute the chunking once.
  const roundIdChunks = chunkIds(roundIds);

  // --- Holes: paginate each chunk (the 1000-row response cap) -------------
  const holeRows: HoleRow[] = [];
  for (const idChunk of roundIdChunks) {
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
  // Every hole_number-bearing row that got excluded below, so the shots
  // loop can disown a shot whose owning hole never made it into `holes`
  // (review item C) — a hole with a null hole_number can't be keyed and
  // falls out of this tracking, same as it already falls out of `holes`.
  const excludedHoleKeys = new Set<string>();
  for (const h of holeRows) {
    // Mirrors hole-diagnosis.ts's ground-truth filter: a HoleContext only
    // ever represents a hole with a real recorded score.
    if (h.score === null) {
      bump(holesExcludedByReason, 'null_score');
      const key = holeKey(h.round_id, h.hole_number);
      if (key !== null) excludedHoleKeys.add(key);
      continue;
    }
    // Defensive — hole_number/par are NOT NULL in golf_holes, but a raw
    // query result is never trusted over the type it's cast to.
    if (typeof h.par !== 'number' || h.hole_number === null) {
      bump(holesExcludedByReason, 'missing_par_or_hole_number');
      const key = holeKey(h.round_id, h.hole_number);
      if (key !== null) excludedHoleKeys.add(key);
      continue;
    }
    if (!isAtOrBeforeCutoff(h.created_at, scope.analysis_cutoff)) {
      bump(holesExcludedByReason, 'after_cutoff');
      excludedHoleKeys.add(holeKey(h.round_id, h.hole_number)!);
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
      yardage: h.yardage,
    });
  }

  // --- Shots: same chunks, paginate, then normalize + cutoff --------------
  const shotRows: ShotRow[] = [];
  for (const idChunk of roundIdChunks) {
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
    if (!isAtOrBeforeCutoff(s.created_at, scope.analysis_cutoff)) {
      bump(shotsExcludedByReason, 'after_cutoff');
      continue;
    }
    // Edited after the cutoff: its CURRENT value isn't what was known as
    // of `cutoff`, even though it was first created before it. `golf_holes`
    // has no `updated_at` column, so this check applies to shots only.
    if (wasEditedAfterCutoff(s.updated_at, scope.analysis_cutoff)) {
      bump(shotsExcludedByReason, 'edited_after_cutoff');
      continue;
    }
    // The owning hole was itself excluded (null_score / missing par or
    // hole_number / after_cutoff) — A2 and other direct shot consumers
    // must not keep evidence from a hole the loader has already disowned.
    const key = holeKey(s.round_id, s.hole_number);
    if (key !== null && excludedHoleKeys.has(key)) {
      bump(shotsExcludedByReason, 'hole_excluded');
      continue;
    }
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
      miss_direction: s.miss_direction,
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
  // Grouped once so each hole's `buildHoleSequence` call filters a small
  // per-hole bucket instead of rescanning every shot in the whole result.
  const shotsByHoleKey = new Map<string, ShotFact[]>();
  for (const shot of shots) {
    const key = holeKey(shot.round_id, shot.hole_number);
    if (key === null) continue;
    const bucket = shotsByHoleKey.get(key);
    if (bucket) bucket.push(shot);
    else shotsByHoleKey.set(key, [shot]);
  }

  let partialSequenceCount = 0;
  for (const hole of holes) {
    const key = holeKey(hole.round_id, hole.hole_number)!;
    const holeShots = shotsByHoleKey.get(key) ?? [];
    if (!buildHoleSequence(holeShots, hole).complete) partialSequenceCount += 1;
  }

  return {
    shots,
    holes,
    coverage: {
      holesIncluded: holes.length,
      holesExcludedByReason,
      shotsExcludedByReason,
      partialSequenceCount,
    },
  };
}
