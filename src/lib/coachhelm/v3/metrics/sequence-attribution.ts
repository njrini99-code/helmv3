/**
 * Per-hole sequence attribution — pure core (addendum §13, work package A4,
 * slice 1). Depends on A1 (`context/build-hole-sequence.ts`) and the
 * canonical, DB-synced strokes-gained engine in
 * `src/lib/utils/golf-stats-calculator-shots.ts` (`getExpectedStrokes`,
 * kept in sync with `public.sg_expected_strokes()`). No new baseline is
 * invented here.
 *
 * `src/lib/golf/strokes-gained.ts` looks similar (same anchor values today)
 * but is quarantined dead code — see the warning in
 * `src/components/golf/coachhelm/round-review/shot-strokes-gained.ts` — and
 * MUST NOT be imported for real computation.
 *
 * `attributeSequence` partitions a hole's validated shot sequence into
 * non-overlapping "events" — a `SequenceEvent` per penalty shot, per named
 * addendum §7.3 family (tee → next shot, missed-green → recovery chain,
 * first putt, putting sequence after the first), and a residual `'other'`
 * event for every shot that doesn't fall into one of those (a
 * green-in-regulation approach, a lay-up, …). Every shot on a complete hole
 * belongs to EXACTLY one event — see `sequence-attribution.test.ts`'s
 * no-double-count check — so summing every event's `measuredContribution`
 * telescopes to `expectedStrokesAtStart - hole.total_strokes` (addendum
 * §7.2's conservation requirement) whenever every event resolves one.
 *
 * This telescoping assumes a shot's `lie_after` matches the NEXT shot's own
 * `lie_before` (continuity of physical state across the gap between two
 * recorded rows). That continuity is assumed, not independently validated
 * here — a data-entry error that disagrees between the two rows would not
 * be caught by this module.
 *
 * Two kinds of output, kept in separate fields per the addendum's explicit
 * warning against conflating them (§7.2, §7.4):
 *
 *   - `measuredContribution` — a strokes-gained-style number computed from
 *     the canonical baseline. `null` when the group's starting or ending
 *     (lie, distance) does not resolve against it (`baselineGap` says why).
 *     Never guessed from a partial state.
 *   - `heuristicScore` — populated ONLY when `measuredContribution` is
 *     null: the group's own ending leave distance in feet, restated as a
 *     plain fact, not a fabricated stroke-equivalent. The addendum
 *     specifically calls out "large leave × coefficient" as an example of a
 *     diagnostic-only field that must never appear on a strokes-saved axis
 *     (§7.2) — this module goes further and does not invent even that
 *     coefficient; it reports the raw distance and lets a later slice
 *     (hypothesis-policy.ts, A5) decide what a "large" leave means.
 *
 * This module deliberately does NOT replicate
 * `calculateStrokesGainedForShot`'s fallback estimation of a missing
 * after-distance (~3ft for an unmeasured putt miss, ~20ft for an
 * unmeasured green-hit proximity) — a missing distance here is always
 * reported as a `baselineGap`, never a guessed number, consistent with the
 * anti-false-precision stance above.
 *
 * A hole `buildHoleSequence` reports incomplete is fully SUPPRESSED here —
 * no events, no total — per this slice's assignment ("never do complete-
 * hole attribution on a partial sequence"). `lostStrokesVsPar` is reported
 * regardless: it reads only `HoleContext.total_strokes`/`par`, which are
 * authoritative independent of shot-sequence validity (mirrors the
 * addendum's own fixture-matrix line: "Missing shot with completed
 * scorecard → par total may remain valid; full sequence attribution
 * unavailable", §14.1).
 *
 * `attributeSequence` operates on ONE hole. Rolling per-hole events up into
 * a scope-wide aggregate (numerator/denominator/status/interval across
 * every hole in an `AnalysisScope`) is PLANNED for a later slice (slice 2),
 * not built yet — this module is intentionally not wired into
 * `v2/orchestrator.ts` or any composite. Slice 2 should consume the shared
 * `MetricResult` type landing via #1990's `metrics/types.ts`; that type
 * does not exist on `main` yet and nothing in this module depends on it.
 */

import { getExpectedStrokes, isGreenHit } from '@/lib/utils/golf-stats-calculator-shots';
import { buildHoleSequence } from '../context/build-hole-sequence';
import type { AnalysisScope, HoleContext, ShotFact } from '../context/types';

const FEET_PER_YARD = 3;

/** Outcomes that mean "the ball found the green" — mirrors
 *  `engine/shot-source.ts`'s own reached-green check (`result === 'green' |
 *  'hole' | 'gir'`, or `lie_after === 'green'` as a fallback) so this module
 *  does not re-derive a second, possibly-drifting definition of the same
 *  fact. */
const GREEN_FINDING_RESULTS = new Set(['green', 'hole', 'gir']);

export type SequenceEventKind =
  | 'tee_to_next'
  | 'approach_to_recovery'
  | 'first_putt_to_next_putt'
  | 'putting_sequence'
  | 'penalty'
  | 'other';

/** Why an event's `measuredContribution` came back `null`. `missing_lie` —
 *  neither the shot's own `lie_before`/`lie_after` nor (on the after side)
 *  `result` says what the lie was. `missing_distance` — the distance itself
 *  was never recorded. An UNMAPPED lie string (`'water'`, `'recovery'`,
 *  `'other'`, anything `getExpectedStrokes` doesn't recognize) is NOT a gap
 *  — it resolves through the fairway table, matching
 *  `public.sg_expected_strokes()`'s ELSE branch. */
export type BaselineGapReason = 'missing_lie' | 'missing_distance';

export interface SequenceEvent {
  kind: SequenceEventKind;
  /** `shot_number`s this event covers, in hole order. A `shot_number`
   *  missing from the sequence (should not happen on a `complete` hole —
   *  `buildHoleSequence` rejects that) is simply omitted rather than
   *  coerced. */
  shotNumbers: number[];
  isPenalty: boolean;
  /** See the module doc comment. */
  measuredContribution: number | null;
  /** See the module doc comment. Populated only when `measuredContribution`
   *  is null. */
  heuristicScore: number | null;
  /** Present iff `measuredContribution` is null. */
  baselineGap: BaselineGapReason | null;
}

export interface SequenceAttributionResult {
  scope: AnalysisScope;
  round_id: string;
  hole_number: number;
  status: 'suppressed' | 'attributed';
  /** `buildHoleSequence`'s reasons — non-empty only when `status` is
   *  `'suppressed'`. */
  reasons: string[];
  events: SequenceEvent[];
  /** Sum of every event's `measuredContribution`, ONLY when every event in
   *  `events` resolved one. `null` when suppressed OR any event's
   *  `measuredContribution` is null — never a partial sum silently passed
   *  off as the whole hole's contribution. */
  totalMeasuredContribution: number | null;
  /** Always available, even when suppressed: `hole.total_strokes -
   *  hole.par`. A plain descriptive fact, independent of the SG baseline —
   *  the fallback the addendum's fixture matrix names for a hole whose
   *  shot-level attribution is unavailable. */
  lostStrokesVsPar: number;
  /** Count of events by `baselineGap` reason. Empty when every event
   *  resolved, or when suppressed. */
  exclusions: Partial<Record<BaselineGapReason, number>>;
}

type EndpointResolution = { readonly ok: true; readonly value: number } | {
  readonly ok: false;
  readonly gap: BaselineGapReason;
};

/**
 * Resolve one (lie, distance-in-feet) state to an expected-strokes value via
 * the canonical engine.
 *
 * Order matters: a missing DISTANCE is checked first (nothing can be
 * computed without one, regardless of lie), then a recorded ZERO distance
 * short-circuits to `0` outright — `getExpectedStrokes` cannot do this
 * itself, because the fairway/rough/sand tables have no `0` anchor and
 * would instead clamp to their smallest anchor (e.g. a "holed from the
 * fairway" chip-in would otherwise look like a 20-yard fairway shot). Only
 * once both of those are ruled out is a missing LIE treated as a gap: the
 * canonical `getExpectedStrokes(null, ...)` returns `0` for a null lie
 * (its own defensive default for a same-row estimate), which this module
 * must not inherit — a 400-yard shot with no recorded lie is missing data,
 * not "already holed".
 */
function resolveEndpoint(lie: string | null, distanceFeet: number | null): EndpointResolution {
  if (distanceFeet === null) return { ok: false, gap: 'missing_distance' };
  if (distanceFeet === 0) return { ok: true, value: 0 };
  if (lie === null) return { ok: false, gap: 'missing_lie' };
  if (lie === 'green') {
    // On the green, pass distanceFeet straight through — no feet→yards
    // round trip. `distanceYards` is unused by getExpectedStrokes' green
    // branch, so 0 is a fine placeholder.
    return { ok: true, value: getExpectedStrokes('green', 0, distanceFeet) };
  }
  return { ok: true, value: getExpectedStrokes(lie, distanceFeet / FEET_PER_YARD) };
}

function failureReason(resolution: EndpointResolution): BaselineGapReason | null {
  return resolution.ok ? null : resolution.gap;
}

/** The lie a shot ENDED in, deriving from `result` when `lie_after` itself
 *  is not recorded — mirrors `calculateStrokesGainedForShot`'s own
 *  `lie_after || (isGreenHit(result) ? 'green' : result)` derivation, so
 *  this module doesn't report a spurious `missing_lie` gap in a case the
 *  canonical engine would have resolved from `result` alone. */
function endingLie(shot: ShotFact): string | null {
  return shot.lie_after ?? (isGreenHit(shot.result) ? 'green' : shot.result);
}

/**
 * A shot that is a genuine attempt at the green: a normal approach, or a
 * par-3 tee shot (the tee shot IS the green attempt on a par 3 — addendum
 * §4.4/§6.1; `hole.par` decides this, never `shot_type` alone).
 *
 * Explicitly excludes a shot the ingest layer tagged `intent: 'layup'`.
 * A1 never INFERS a lay-up from distance/outcome (that inference is A2's
 * job, done with denominators and eligibility rules) — but an EXPLICIT
 * lay-up tag is not an inference, and treating a deliberate lay-up's
 * fairway finish as a "missed green" needing "recovery" would conflate two
 * different named families (`layup → weak next approach` is its own row in
 * §7.3, distinct from `missed green → poor recovery leave`).
 */
function isGreenAttempt(shot: ShotFact, hole: HoleContext): boolean {
  if (shot.is_penalty) return false;
  if (shot.intent === 'layup') return false;
  if (shot.shot_type === 'approach') return true;
  return shot.shot_type === 'tee' && hole.par === 3;
}

/** Did this shot miss the green (or fail to hole out)? Mirrors
 *  `engine/shot-source.ts`'s own reached-green definition (`result` in
 *  {`green`,`hole`,`gir`}, or `lie_after === 'green'` as a fallback), plus
 *  `putt_made` for a hole-out that isn't reflected in `result`. Used both to
 *  trigger a recovery chain and to decide when one ends. */
function missedGreen(shot: ShotFact): boolean {
  if (shot.putt_made === true) return false;
  if (shot.result !== null && GREEN_FINDING_RESULTS.has(shot.result)) return false;
  if ((shot.lie_after ?? '').toLowerCase() === 'green') return false;
  return true;
}

function buildEvent(kind: SequenceEventKind, group: readonly ShotFact[]): SequenceEvent {
  const first = group[0]!;
  const last = group[group.length - 1]!;
  const before = resolveEndpoint(first.lie_before, first.distance_to_hole_before_feet);
  const after = resolveEndpoint(endingLie(last), last.distance_to_hole_after_feet);

  let measuredContribution: number | null = null;
  let baselineGap: BaselineGapReason | null = null;
  let heuristicScore: number | null = null;
  if (before.ok && after.ok) {
    measuredContribution = before.value - after.value - group.length;
  } else {
    // Report whichever endpoint failed; when both did, the BEFORE endpoint's
    // reason wins (it's the one that blocks computing anything at all).
    baselineGap = failureReason(before) ?? failureReason(after);
    heuristicScore = last.distance_to_hole_after_feet;
  }

  return {
    kind,
    shotNumbers: group.map((s) => s.shot_number).filter((n): n is number => n !== null),
    isPenalty: group.some((s) => s.is_penalty),
    measuredContribution,
    heuristicScore,
    baselineGap,
  };
}

export function attributeSequence(
  facts: readonly ShotFact[],
  hole: HoleContext,
  scope: AnalysisScope,
): SequenceAttributionResult {
  const lostStrokesVsPar = hole.total_strokes - hole.par;
  const sequence = buildHoleSequence([...facts], hole);

  if (!sequence.complete) {
    return {
      scope,
      round_id: hole.round_id,
      hole_number: hole.hole_number,
      status: 'suppressed',
      reasons: sequence.reasons,
      events: [],
      totalMeasuredContribution: null,
      lostStrokesVsPar,
      exclusions: {},
    };
  }

  const shots = sequence.shots;
  const events: SequenceEvent[] = [];
  let firstPuttSeen = false;
  let i = 0;
  while (i < shots.length) {
    const shot = shots[i]!;

    if (shot.is_penalty) {
      events.push(buildEvent('penalty', [shot]));
      i += 1;
      continue;
    }

    // View 1: tee -> next shot. Par 4/5 tee shots only — a par-3 tee shot
    // is the green attempt itself (view 2 below), never this family.
    if (shot.shot_type === 'tee' && hole.par !== 3) {
      events.push(buildEvent('tee_to_next', [shot]));
      i += 1;
      continue;
    }

    // View 2: missed green -> recovery, CHAINED. Absorbs every consecutive
    // non-penalty follow-up shot ("repeated failed recovery", addendum
    // §7.3) until one reaches the green (inclusive — that shot resolved the
    // miss) or a penalty intervenes (exclusive — a penalty always stays its
    // own explicit event, never folded into this chain; the hole is
    // guaranteed to terminate by holing out, so the loop below cannot run
    // past the end of a complete sequence without hitting either stop
    // condition). Only triggered by an approach or a par-3 tee shot; a
    // drive that finishes greenside followed by chip attempts is not
    // covered here and falls through to individual `'other'` events.
    if (isGreenAttempt(shot, hole) && missedGreen(shot)) {
      const chain: ShotFact[] = [shot];
      let j = i + 1;
      while (j < shots.length) {
        const candidate = shots[j]!;
        if (candidate.is_penalty) break;
        chain.push(candidate);
        if (!missedGreen(candidate)) break;
        j += 1;
      }
      events.push(buildEvent('approach_to_recovery', chain));
      i += chain.length;
      continue;
    }

    if (shot.shot_type === 'putting') {
      // View 3a: the first putt encountered on the hole, always its own
      // singleton event — a hole-out on the first putt still gets this
      // kind, so first-putt performance is always identifiable even when
      // there is no second putt.
      if (!firstPuttSeen) {
        firstPuttSeen = true;
        events.push(buildEvent('first_putt_to_next_putt', [shot]));
        i += 1;
        continue;
      }
      // View 3b: putting_sequence — every putt after the first, chained as
      // one group. Covers a clean 2-putt's second putt alone, and a
      // 3-putt's (or worse) second-and-every-later putt together, instead
      // of dropping the third putt into `'other'`.
      const chain: ShotFact[] = [shot];
      let j = i + 1;
      while (j < shots.length && shots[j]!.shot_type === 'putting' && !shots[j]!.is_penalty) {
        chain.push(shots[j]!);
        j += 1;
      }
      events.push(buildEvent('putting_sequence', chain));
      i += chain.length;
      continue;
    }

    // Every other shot (green-in-regulation approach, a lay-up, an
    // around-green shot with no earlier miss, …) — still gets its own
    // explicit event so nothing is dropped from the partition.
    events.push(buildEvent('other', [shot]));
    i += 1;
  }

  const exclusions: Partial<Record<BaselineGapReason, number>> = {};
  let total: number | null = 0;
  for (const event of events) {
    if (event.measuredContribution === null) {
      total = null;
      if (event.baselineGap) {
        exclusions[event.baselineGap] = (exclusions[event.baselineGap] ?? 0) + 1;
      }
    } else if (total !== null) {
      total += event.measuredContribution;
    }
  }

  return {
    scope,
    round_id: hole.round_id,
    hole_number: hole.hole_number,
    status: 'attributed',
    reasons: [],
    events,
    totalMeasuredContribution: total,
    lostStrokesVsPar,
    exclusions,
  };
}
