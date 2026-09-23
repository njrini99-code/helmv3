/**
 * A9 slice 1 (repair-plan addendum §14.12): wires `evaluation/
 * comparable-opportunities.ts`'s pure core into the attribution path for the
 * metrics that need shot-level matching. `causality/attribute.ts` measures a
 * ROUND-LEVEL average and has no natural per-shot "opportunity" concept for
 * `approach_proximity_{50_125,125_175,175_plus}ft` — they've sat
 * `intentional-null` (`reason: 'needs-shot-level-join'`) in
 * `metric-sources.ts` since W22's `ApproachMissGenerator`, permanently
 * skipped by the causality-attribute cron.
 *
 * Gated behind `coachhelm_comparable_opportunity_attribution` (default off
 * everywhere, `config/feature-flags.yml`) — off, `computeComparableAttribution`
 * is never called and these metrics behave exactly as before this slice.
 *
 * NEVER SIMULATES AN EXPOSURE (addendum rule): `computeComparableOpportunities`
 * requires `interventionAt` be "the actual recorded instant the intervention
 * took effect ... never a page view, a cron scan, or any other
 * non-intervention event" (see that module's own doc comment).
 * `causality/attribute.ts`'s round-level path uses `golf_coach_insights.
 * created_at` as an admitted "surfaced_at proxy" (its own comment says so).
 * This module does NOT: `firstRealExposureAt` below reads the insight's
 * FIRST real `golf_insight_exposure` row (`shown_at` — the actual recorded
 * moment a coach was shown this insight, written by
 * `effectiveness/event-ledger.ts`'s `recordInsightExposure`) and this module
 * returns `{ ok: false, reason: 'no-exposure-record' }` for an insight with
 * zero exposure rows, rather than estimating one from `created_at` the way
 * the round-level path does.
 *
 * NEVER FEEDS THE LEARNING LOOP (this slice): every row this module writes
 * carries `lift: null` unconditionally — `nextWeight`/`updateCoachWeight`
 * (`api/cron/v3/causality-attribute/route.ts`) are never called for a
 * `comparable_opportunities_v1` row. Whether/how this signal should ever move
 * a coach weight is an explicit, separate decision (A9 slice 3, a decision
 * doc, not code) — not something this slice decides by writing a non-null
 * number into a column the pure core's own contract says must never be named
 * `lift` (see `comparable-opportunities.ts`'s "NAMING" note).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { fromUntyped } from '@/lib/supabase/untyped';
import { loadPlayerContext } from '@/lib/coachhelm/v3/context/load-player-context';
import type { ShotFact } from '@/lib/coachhelm/v3/context/types';
import { PRE_WINDOW_DAYS, POST_WINDOW_DAYS } from './attribute';
import {
  computeComparableOpportunities,
  COMPARABLE_OPPORTUNITIES_METHOD_VERSION,
  type MatchingSpec,
  type OutcomeSpec,
} from '@/lib/coachhelm/v3/evaluation/comparable-opportunities';

type Sb = SupabaseClient<Database>;

/** Mirrors `engine/shot-source.ts`'s `bucketApproachDistance` (the canonical
 *  50/125/175-YARD band boundaries every other approach-distance consumer in
 *  this codebase uses — `distance-profile.ts`, `approach-miss.ts`) converted
 *  to FEET, since `MatchingSpec.distanceBand` matches against `ShotFact.
 *  distance_to_hole_before_feet`. Not re-derived from that function directly
 *  because `MatchingSpec.distanceBand` needs static bounds, not a classifier
 *  function — duplicating the three numbers (not the definition: there is
 *  only one canonical yard-band system) is the same trade already made for
 *  `reachedGreen`/`isOnGreen` below. */
const FEET_PER_YARD = 3;

interface ShotLevelAttributionSpec {
  spec: MatchingSpec;
  outcome: OutcomeSpec;
}

/** Same predicate as `generators/approach-miss.ts`'s exported `reachedGreen`
 *  and `metrics/distance-profile.ts`'s local `isOnGreen` — duplicated a
 *  third time rather than importing either: both take a narrower/older shot
 *  type than this module's plain `ShotFact`, and this is already an
 *  established, intentional duplication pattern for this exact predicate in
 *  this codebase (see `distance-profile.ts`'s own "Same predicate as ..."
 *  comment). Result is the canonical signal; `lie_after` is a corroborating
 *  fallback for older rows where only the lie was recorded. */
function reachedGreen(shot: ShotFact): boolean {
  const r = (shot.result ?? '').toLowerCase();
  if (r === 'green' || r === 'hole' || r === 'gir') return true;
  return (shot.lie_after ?? '').toLowerCase() === 'green';
}

/**
 * Proximity outcome for one distance band: the mean `distance_to_hole_
 * after_feet` over approach shots in this band that FOUND THE GREEN — a shot
 * that missed the green has no "proximity to the pin" reading at all, so
 * `valueOf` returns `null` for it (dropped from the denominator entirely,
 * per `comparable-opportunities.ts`'s own `missing_value` exclusion — never
 * silently counted as a zero or averaged in as a miss). Mirrors
 * `approach-miss.ts`'s `proximity_when_hit_feet` / `distance-profile.ts`'s
 * `approach_on_green_proximity_feet`: the SAME quantity those already
 * measure for insight generation, so a before/after comparison here is about
 * the metric the original insight was actually surfaced on, not a
 * lookalike.
 */
function proximityOutcome(minFt: number, maxFt: number, label: string): ShotLevelAttributionSpec {
  return {
    spec: {
      distanceBand: { label, minFt, maxFt },
      // Provenance string only — this module never validates or interprets
      // it (see `MatchingSpec`'s own doc comment). Ties back to the single
      // canonical band system named above.
      distanceBandVersion: 'engine/shot-source.bucketApproachDistance_yards_50_125_175',
      lie: null,
      shotRole: 'approach',
      // No external Tour/LPGA standard is being matched against here — this
      // module compares a player's own baseline to their own follow-up, not
      // to a benchmark. `MatchingSpec.benchmarkVersion` is required by the
      // pure core's type regardless, so this states that honestly rather
      // than inventing a benchmark name.
      benchmarkVersion: 'none',
    },
    outcome: {
      kind: 'mean',
      unit: 'feet',
      valueOf: (shot) => (reachedGreen(shot) ? shot.distance_to_hole_after_feet : null),
    },
  };
}

/** Keyed by the v3 `MetricId` string — see `metrics/registry.ts`. Typed as a
 *  plain string map, not `Record<MetricId, ...>`, because the lookup domain
 *  is `golf_coach_insights.evidence.metric`: an untrusted string from JSON,
 *  the same reason `lookupMetricSource` (`metric-sources.ts`) takes `string`
 *  rather than `MetricId`. */
const SHOT_LEVEL_METRICS: Record<string, ShotLevelAttributionSpec> = {
  approach_proximity_50_125ft: proximityOutcome(50 * FEET_PER_YARD, 125 * FEET_PER_YARD, '50_125ft'),
  approach_proximity_125_175ft: proximityOutcome(125 * FEET_PER_YARD, 175 * FEET_PER_YARD, '125_175ft'),
  approach_proximity_175_plus_ft: proximityOutcome(175 * FEET_PER_YARD, Infinity, '175_plus_ft'),
};

/** Whether `metricId` has a shot-level `MatchingSpec`/`OutcomeSpec` this
 *  module can attempt — the cron's pre-filter and main loop both need this
 *  same answer without duplicating the metric list. */
export function isShotLevelAttributionMetric(metricId: string): boolean {
  return metricId in SHOT_LEVEL_METRICS;
}

export interface ComparableAttributionInput {
  insight_id: string;
  player_id: string;
  target_metric_id: string;
}

export type ComparableAttributionSkip =
  | { ok: false; reason: 'unsupported-metric' }
  | { ok: false; reason: 'no-exposure-record' }
  /**
   * The follow-up window (`interventionAt` + `POST_WINDOW_DAYS`) has not
   * fully elapsed yet as of now. Unlike the round-level path, this
   * module's window is anchored to a REAL, variable `shown_at` rather than
   * the cron's own `MIN_AGE_DAYS` candidate-age cutoff, so the cron
   * admitting a candidate (created >=21d ago) does NOT guarantee its
   * follow-up window has closed — an insight first shown to a coach only
   * a few days ago has a follow-up window still wide open. Measuring
   * early would truncate the follow-up side to whatever thin slice of
   * data exists so far and — because a write is a permanent, idempotent
   * row (PK on `insight_id`) — that truncated measurement could never be
   * redone once the window actually closes. Retried next run, exactly
   * like `no-exposure-record`, never a permanent skip.
   */
  | { ok: false; reason: 'follow-up-window-open' }
  | { ok: false; reason: 'insufficient-evidence' };

export interface ComparableAttributionRow {
  insight_id: string;
  /** The REAL recorded exposure instant used as `interventionAt` — never a
   *  `created_at` proxy. Persisted as `golf_insight_outcome_attribution.
   *  surfaced_at` so the column still means "when the intervention took
   *  effect," just backed by a stronger source for these rows. */
  intervention_at: string;
  target_metric_id: string;
  baseline_value: number;
  post_value: number;
  delta: number;
  n_rounds_before: number;
  n_rounds_after: number;
  method_version: typeof COMPARABLE_OPPORTUNITIES_METHOD_VERSION;
}

export type ComparableAttributionResult =
  | { ok: true; row: ComparableAttributionRow }
  | ComparableAttributionSkip;

/**
 * DB-backed: reads the insight's first real exposure, loads shot/hole
 * context for the combined baseline+follow-up window, and runs the pure
 * `computeComparableOpportunities` core. Returns a row to write, or a typed
 * skip reason; a caller (the cron) counts each skip reason in its own
 * summary the same way `computeAttribution`'s `AttributionSkip` already
 * works. A genuine DB error (the exposure lookup failing) THROWS rather
 * than being read as `no-exposure-record` — the cron's own per-candidate
 * try/catch (`cron.v3.causality.compute`) already absorbs and logs that,
 * the same way it does for `computeAttribution`'s own DB calls.
 */
export async function computeComparableAttribution(
  sb: Sb,
  input: ComparableAttributionInput,
): Promise<ComparableAttributionResult> {
  const shotLevel = SHOT_LEVEL_METRICS[input.target_metric_id];
  if (!shotLevel) return { ok: false, reason: 'unsupported-metric' };

  // The addendum rule: only a REAL recorded exposure counts. First exposure
  // = earliest `shown_at` on record for this insight. Zero rows → skip,
  // never estimate one from `created_at`.
  const { data: exposure, error: exposureError } = await sb
    .from('golf_insight_exposure')
    .select('shown_at')
    .eq('insight_id', input.insight_id)
    .order('shown_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  // A transient/infra failure must not read as "no exposure yet" — that
  // would silently and permanently misclassify a real DB error as the
  // addendum's legitimate not-shown-yet case. Throw and let the cron's own
  // per-candidate try/catch (cron.v3.causality.compute) log it, same as any
  // other DB failure in this loop.
  if (exposureError) {
    throw new Error(
      `comparable-attribute exposure lookup ${input.insight_id}: ${exposureError.message}`,
    );
  }
  if (!exposure) return { ok: false, reason: 'no-exposure-record' };
  const interventionAt = exposure.shown_at;

  const interventionMs = new Date(interventionAt).getTime();
  const baselineWindow = {
    start: new Date(interventionMs - PRE_WINDOW_DAYS * 86_400_000).toISOString(),
    end: interventionAt,
  };
  const followUpWindow = {
    start: interventionAt,
    end: new Date(interventionMs + POST_WINDOW_DAYS * 86_400_000).toISOString(),
  };
  const nowIso = new Date().toISOString();

  // The cron's own candidate-age filter (`created_at <= now - MIN_AGE_DAYS`,
  // MIN_AGE_DAYS === attribute.ts's POST_WINDOW_DAYS) guarantees the
  // ROUND-LEVEL path's post window has fully elapsed. It does NOT guarantee
  // this path's has: `interventionAt` is the real, independently-timed
  // `shown_at`, which can land long after `created_at` — an insight created
  // 30 days ago but first shown to a coach 3 days ago still has 18 days left
  // on its follow-up window. Measuring now would only see those 3 days, and
  // because the write is a permanent, idempotent row (PK on `insight_id`),
  // that truncated measurement could never be corrected later. See
  // `ComparableAttributionSkip`'s `'follow-up-window-open'` doc comment.
  if (new Date(followUpWindow.end).getTime() > new Date(nowIso).getTime()) {
    return { ok: false, reason: 'follow-up-window-open' };
  }

  // One `loadPlayerContext` call covering BOTH windows — `computeSide`
  // (inside `computeComparableOpportunities`) re-filters down to the exact
  // baseline/follow-up sub-window via `interventionAt`, so overlapping the
  // fetch here is correct, not redundant-and-wasteful in a way that matters
  // (a single player's shot volume over ~5 weeks is small).
  const { shots, holes } = await loadPlayerContext(
    {
      player_id: input.player_id,
      window_start: baselineWindow.start.slice(0, 10),
      window_end: followUpWindow.end.slice(0, 10),
      analysis_cutoff: nowIso,
    },
    { supabase: sb },
  );

  const result = computeComparableOpportunities({
    facts: shots,
    holes,
    player_id: input.player_id,
    analysis_cutoff: nowIso,
    interventionAt,
    baselineWindow,
    followUpWindow,
    spec: shotLevel.spec,
    outcome: shotLevel.outcome,
    // Slice 2 candidate: detect a second insight surfaced before the
    // follow-up window closes. Slice 1 always reports `false` — WRONG in the
    // "more confident than warranted" direction would be worse than this
    // slice's actual behavior (which never even reaches a coach yet — see
    // the file header's "NEVER FEEDS THE LEARNING LOOP" note), so this is a
    // real known gap for slice 2, not a silent shortcut.
    multipleInterventions: false,
    metricId: input.target_metric_id,
  });

  if (
    result.status === 'insufficient_evidence' ||
    result.observedChange === null ||
    result.baseline.value === null ||
    result.followUp.value === null
  ) {
    return { ok: false, reason: 'insufficient-evidence' };
  }

  return {
    ok: true,
    row: {
      insight_id: input.insight_id,
      intervention_at: interventionAt,
      target_metric_id: input.target_metric_id,
      baseline_value: result.baseline.value,
      post_value: result.followUp.value,
      delta: result.observedChange,
      n_rounds_before: result.baseline.distinctRounds,
      n_rounds_after: result.followUp.distinctRounds,
      method_version: COMPARABLE_OPPORTUNITIES_METHOD_VERSION,
    },
  };
}

/**
 * Duplicated from `api/cron/v3/causality-attribute/route.ts`'s own
 * (unexported) copy rather than imported from a route file — see that
 * file's doc comment for the PGRST204/42703 rationale. Both call sites
 * guard the SAME still-unapplied migration (20260922230000): `method_
 * version` is prepared but not yet applied to production, and only the
 * owner applies a migration (AGENTS.md).
 */
function isUnknownColumnError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST204' || error.code === '42703') return true;
  const message = (error.message ?? '').toLowerCase();
  return message.includes('could not find') && message.includes('column');
}

export interface WriteComparableAttributionResult {
  written: boolean;
  /** Mirrors the cron's own `method_version_column_missing` — true when the
   *  insert had to drop `method_version` because migration 20260922230000
   *  isn't applied yet. The row still writes (pre-N10 shape: no method_
   *  version at all, same as a legacy v1 round-level row). */
  methodVersionColumnMissing: boolean;
  error?: string;
}

/**
 * Writes a `ComparableAttributionRow` to `golf_insight_outcome_attribution`.
 * `lift` is ALWAYS `null` — see the file header's "NEVER FEEDS THE LEARNING
 * LOOP" note; this function has no parameter that could set it otherwise.
 */
export async function writeComparableAttribution(
  sb: Sb,
  row: ComparableAttributionRow,
): Promise<WriteComparableAttributionResult> {
  const attributionRow = {
    insight_id: row.insight_id,
    surfaced_at: row.intervention_at,
    target_metric_id: row.target_metric_id,
    baseline_value: row.baseline_value,
    post_value: row.post_value,
    delta: row.delta,
    n_rounds_before: row.n_rounds_before,
    n_rounds_after: row.n_rounds_after,
    lift: null,
  };
  let { error } = await fromUntyped(sb, 'golf_insight_outcome_attribution').insert({
    ...attributionRow,
    method_version: row.method_version,
  });
  let methodVersionColumnMissing = false;
  if (error && isUnknownColumnError(error)) {
    methodVersionColumnMissing = true;
    ({ error } = await fromUntyped(sb, 'golf_insight_outcome_attribution').insert(attributionRow));
  }
  if (error) return { written: false, methodVersionColumnMissing, error: error.message as string };
  return { written: true, methodVersionColumnMissing };
}
