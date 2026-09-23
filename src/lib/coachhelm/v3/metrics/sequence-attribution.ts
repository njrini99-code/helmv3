/**
 * Per-hole sequence attribution — pure core (addendum §13, work package A4,
 * slice 1). Depends on A1 (`context/build-hole-sequence.ts`) and the
 * existing, audited PGA-Tour strokes-gained baseline
 * (`src/lib/golf/strokes-gained.ts`'s `getExpectedStrokes` /
 * `PGA_BASELINE_DATA`, DB-synced with `public.sg_expected_strokes()` — see
 * that file's header). No new baseline is invented here.
 *
 * `attributeSequence` partitions a hole's validated shot sequence into
 * non-overlapping "events" — a `SequenceEvent` per penalty shot, per named
 * addendum §7.3 family (tee → next shot, missed-green → recovery, first
 * putt → next putt), and a residual `'other'` event for every shot that
 * doesn't fall into one of those (a green-in-regulation approach, a lay-up,
 * a hole-out putt with no earlier miss, …). Every shot on a complete hole
 * belongs to EXACTLY one event — see `sequence-attribution.test.ts`'s
 * no-double-count check — so summing every event's `measuredContribution`
 * telescopes to `expectedStrokesAtStart - hole.total_strokes` (addendum
 * §7.2's conservation requirement) whenever every event resolves one.
 *
 * Two kinds of output, kept in separate fields per the addendum's explicit
 * warning against conflating them (§7.2, §7.4):
 *
 *   - `measuredContribution` — a strokes-gained-style number computed from
 *     the audited baseline. `null` when the group's starting or ending
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
 * a scope-wide, `MetricResult`-shaped aggregate (numerator/denominator/
 * status/interval across every hole in an `AnalysisScope`) is a later
 * slice's job — this module is intentionally not wired into
 * `v2/orchestrator.ts` or any composite (slice 2).
 */

import { getExpectedStrokes, type LieType } from '@/lib/golf/strokes-gained';
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
  | 'penalty'
  | 'other';

export type BaselineGapReason = 'unresolved_lie' | 'missing_distance';

export interface SequenceEvent {
  kind: SequenceEventKind;
  /** `shot_number`s this event covers, in hole order (1 for every kind
   *  except `approach_to_recovery` and a 2-putt `first_putt_to_next_putt`,
   *  which cover 2). A `shot_number` missing from the sequence (should not
   *  happen on a `complete` hole — `buildHoleSequence` rejects that) is
   *  simply omitted rather than coerced. */
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

/** `golf_shots` lie strings this module can resolve to a strokes-gained
 *  `LieType`. `'fringe'` counts as `'fairway'` (mirrors
 *  `approach-plausibility.ts`'s `APPROACH_LIES` — "a fairway-lie attempt
 *  that catches the fringe was still an approach into the green"); `'sand'`
 *  and `'bunker'` are the same lie under two spellings. Anything else
 *  (`'other'`, `'hole'`, `null`, an unrecognized string) resolves to `null`
 *  — never guessed. */
function toLieType(lie: string | null): LieType | null {
  switch ((lie ?? '').toLowerCase()) {
    case 'tee':
      return 'tee';
    case 'fairway':
    case 'fringe':
      return 'fairway';
    case 'rough':
      return 'rough';
    case 'sand':
    case 'bunker':
      return 'sand';
    case 'green':
      return 'green';
    default:
      return null;
  }
}

/**
 * Expected strokes to hole out from a normalized (feet) shot state. `0` feet
 * is always "holed" (expected strokes `0`) regardless of the recorded lie
 * string — a chip-in's `lie_after` is often `'hole'`, which `toLieType`
 * does not recognize, and this check runs before that lookup so a genuine
 * zero-distance state is never excluded for want of a lie label.
 *
 * `getExpectedStrokes` takes YARDS for every lie, including `'green'` (it
 * converts internally when `lie === 'green'`) — `ShotFact` distances are
 * canonicalized to FEET (A1), so this always converts back to yards before
 * calling it.
 */
function expectedStrokesFeet(lie: string | null, distanceFeet: number | null): number | null {
  if (distanceFeet === null) return null;
  if (distanceFeet === 0) return 0;
  const lieType = toLieType(lie);
  if (lieType === null) return null;
  return getExpectedStrokes(lieType, distanceFeet / FEET_PER_YARD);
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

/** Did this green-attempt shot miss? Mirrors `engine/shot-source.ts`'s own
 *  reached-green definition (`result` in {`green`,`hole`,`gir`}, or
 *  `lie_after === 'green'` as a fallback when `result` doesn't say). */
function missedGreen(shot: ShotFact): boolean {
  if (shot.putt_made === true) return false;
  if (shot.result !== null && GREEN_FINDING_RESULTS.has(shot.result)) return false;
  if ((shot.lie_after ?? '').toLowerCase() === 'green') return false;
  return true;
}

function buildEvent(kind: SequenceEventKind, group: readonly ShotFact[]): SequenceEvent {
  const first = group[0]!;
  const last = group[group.length - 1]!;
  const before = expectedStrokesFeet(first.lie_before, first.distance_to_hole_before_feet);
  const after = expectedStrokesFeet(last.lie_after, last.distance_to_hole_after_feet);
  const measuredContribution =
    before !== null && after !== null ? before - after - group.length : null;

  let baselineGap: BaselineGapReason | null = null;
  let heuristicScore: number | null = null;
  if (measuredContribution === null) {
    // Diagnose which endpoint failed to resolve, preferring to name a
    // missing measurement over an unresolved lie when both are absent (a
    // `null` distance is the more specific data-quality problem).
    const beforeMissingDistance = first.distance_to_hole_before_feet === null;
    const afterMissingDistance = last.distance_to_hole_after_feet === null;
    baselineGap =
      beforeMissingDistance || afterMissingDistance ? 'missing_distance' : 'unresolved_lie';
    heuristicScore = last.distance_to_hole_after_feet;
  }

  return {
    kind,
    shotNumbers: group
      .map((s) => s.shot_number)
      .filter((n): n is number => n !== null),
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
    const next = shots[i + 1];

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

    // View 2: missed green -> recovery. Pairs the miss with the very next
    // shot, structurally — never on an intent tag, which is 'unknown' for
    // almost every real shot (A1 doc comment, types.ts). Does not pair
    // across a penalty: a penalty stays its own explicit event (never
    // charged twice), so the miss stands alone when the next shot is one.
    if (isGreenAttempt(shot, hole) && missedGreen(shot)) {
      if (next && !next.is_penalty) {
        events.push(buildEvent('approach_to_recovery', [shot, next]));
        i += 2;
        continue;
      }
      events.push(buildEvent('other', [shot]));
      i += 1;
      continue;
    }

    // View 3: first putt -> next putt. Only the FIRST putt encountered on
    // the hole; a hole-out on the first putt still gets this kind (a
    // single-shot group) so first-putt performance is always identifiable,
    // matching addendum §7.3's family even when there is no three-putt.
    if (shot.shot_type === 'putting' && !firstPuttSeen) {
      firstPuttSeen = true;
      if (next && next.shot_type === 'putting' && !next.is_penalty) {
        events.push(buildEvent('first_putt_to_next_putt', [shot, next]));
        i += 2;
        continue;
      }
      events.push(buildEvent('first_putt_to_next_putt', [shot]));
      i += 1;
      continue;
    }

    // Every other shot (green-in-regulation approach, a lay-up, a later
    // putt, an around-green shot with no earlier miss, …) — still gets its
    // own explicit event so nothing is dropped from the partition.
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
