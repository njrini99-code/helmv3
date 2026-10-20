/**
 * Root-cause diagnosis — pure core (no DB, no clock).
 *
 * Ported from PR #2073 (CoachHelm supercharge Slice 2) and run only behind
 * `coachhelm_root_cause_diagnosis` (`generator-base.ts`). With the flag on,
 * every LEAK row gets one of three honest cause states instead of the
 * templated "{metric} is off its benchmark. Likely cause inferred from the
 * aggregate" sentence; strength/neutral rows get no cause at all:
 *
 *   1. COUNTED (`cause.state = 'observed_sequence'`, diagnosis
 *      `causality_level: 'observed_sequence'`). The player's recorded shots
 *      contain the metric's failure often enough and one shot-by-shot path
 *      leads it — "approach missed short → chip to 6–20 ft → 2 putts — 7 of
 *      12 missed greens from 125–175 yd across 4 rounds". Built on the A1 hole
 *      sequence (`buildHoleSequence`), the A4 per-hole attribution
 *      (`attributeSequence`) and the A4 rollup (`computeSequenceAttribution`,
 *      whose per-kind `status` must be `'supported'`). A TEMPORAL fact
 *      ("preceded by"), never a causal claim.
 *
 *   2. LIKELY FROM TOTALS (`cause.state = 'inferred_hypothesis'`, diagnosis
 *      `causality_level: 'inferred_hypothesis'`). No counted path, but the
 *      context narrowing found the failures concentrated in one par × length
 *      slice, and that association clears the corroboration gate below. Both
 *      arms are printed with their counts.
 *
 *   3. NOT TRACED (`cause.state = 'not_traced'`, diagnosis
 *      `causality_level: 'inferred_hypothesis'`). Neither; the sentence says
 *      exactly why: a count-down to the floor, a data gap naming the one
 *      missing field, no leading path, no shot path for this metric, no
 *      stamped window, or a failed read.
 *
 * FLOORS for (1), all must hold: the event kind's rollup row (or, for
 * hole-level families, `sequence_hole_coverage`) is `'supported'`; the quoted
 * failing population has >= SEQUENCE_MIN_EVENTS (10) occurrences across
 * >= SEQUENCE_MIN_ROUNDS (3) rounds; the top path repeats
 * >= MIN_PATTERN_OCCURRENCES (4) times AND covers >= MIN_PATTERN_SHARE (30%)
 * of that population. PR #2073 used 3 and 25%; at a 15% base rate 3 of 10
 * happens about 18% of the time by chance, 4 of 10 about 5% (supercharge 02
 * §6). Loosening any of these to "get a result" is the overclaiming this
 * module exists to stop.
 *
 * CORROBORATION for (2): both arms hold >= LIKELY_MIN_ARM_N (10) attempts,
 * the slice fails at >= LIKELY_MIN_LIFT (1.25) times the rest's rate, and the
 * Newcombe lower bound of the rate difference, Bonferroni-widened over the
 * slices the narrowing tried (family-wise 95%), is above 0 (supercharge 04
 * §2, "Corroborated association").
 *
 * WINDOW: the scope is the window the insight's own evidence stamps. PR
 * #2073's one-year fallback for a row with no window is gone (supercharge 07
 * §5): such a row is "not traced: no stamped window".
 */

import { buildHoleSequence } from '../context/build-hole-sequence';
import type { AnalysisScope, HoleContext, ShotFact } from '../context/types';
import { bandOf } from '../metrics/distance-profile';
import { computeParOpportunities } from '../metrics/par-opportunities';
import {
  attributeSequence,
  computeSequenceAttribution,
  SEQUENCE_MIN_EVENTS,
  SEQUENCE_MIN_ROUNDS,
  type SequenceEvent,
  type SequenceEventKind,
} from '../metrics/sequence-attribution';
import type { MetricResult } from '../metrics/types';
import { buildHypotheses, type Hypothesis } from '../reasoning/hypothesis-policy';
import {
  isNarrowBand,
  narrowApproach,
  narrowParScoring,
  narrowTee,
  type Narrowing,
} from './context-narrowing';
import { getMetricRenderConfig } from '../standing/metric-config';
import { proportionDiffInterval } from '../stats/intervals';
import type {
  Diagnosis,
  DiagnosisBasis,
  DiagnosisDriver,
  DiagnosisHypothesisLabel,
  DiagnosisNarrowing,
  InsightCause,
  InsightCauseAlternative,
  InsightDataGap,
  InsightEvidence,
  InsightNotTracedReason,
} from '@/lib/coachhelm/v2/insights/types';

// ---------------------------------------------------------------------------
// 1. Framing — is this insight a leak at all?
// ---------------------------------------------------------------------------

/** How a generator frames its own verdict. `strength`/`neutral` never get a
 *  root cause; `leak` does. Declared by the generator when it knows (e.g.
 *  tee-strategy's "sharp" variant), else derived from the values. */
export type InsightFraming = 'leak' | 'strength' | 'neutral';

/**
 * Resolve the framing. A generator-declared framing wins outright — values
 * alone mislead (the "Driver is performing" row sits 0.6pp under its own
 * comparison, but the generator's verdict is that the driver is NOT costing
 * strokes). Otherwise compare `your_value` to `comparison_value`, but only
 * when the polarity is trustworthy: the producer's `evidence.polarity`, or a
 * registry entry whose unit matches the evidence unit (an `sg_ott` row
 * carrying a fairway PERCENT must not be read with the strokes registry
 * direction). Untrustworthy polarity → `'leak'` (keep diagnosing; the
 * conservative choice is to still show an honest hypothesis, never to hide
 * a possible problem).
 */
export function resolveInsightFraming(
  declared: InsightFraming | undefined,
  evidence: Pick<InsightEvidence, 'metric' | 'unit' | 'polarity' | 'your_value' | 'comparison_value'>,
): InsightFraming {
  if (declared) return declared;
  let direction: 'higher_better' | 'lower_better' | null = evidence.polarity ?? null;
  if (!direction) {
    const cfg = getMetricRenderConfig(evidence.metric);
    if (cfg && cfg.unit === evidence.unit) direction = cfg.direction;
  }
  if (!direction) return 'leak';
  const you = Number(evidence.your_value);
  const ref = Number(evidence.comparison_value);
  if (!Number.isFinite(you) || !Number.isFinite(ref)) return 'leak';
  const worse = direction === 'higher_better' ? you < ref : you > ref;
  return worse ? 'leak' : 'strength';
}

// ---------------------------------------------------------------------------
// 2. Which shot sequence can explain which metric
// ---------------------------------------------------------------------------

export type SequenceFamily =
  | 'tee'
  | 'approach'
  | 'putt'
  | 'sand'
  | 'penalty'
  | 'big_number'
  | 'par'
  | 'opening_hole';

export interface SequenceTarget {
  family: SequenceFamily;
  /** Rollup row whose `status` gates this family (`coverage` =
   *  `sequence_hole_coverage`, for hole-level families). */
  rollup: SequenceEventKind | 'coverage';
  /** approach: the `bandOf` band. */
  band?: string;
  /** putt: first-putt distance range in feet, `[min, max)`; max null = open. */
  puttRange?: readonly [number, number | null];
  /** par: which par. */
  par?: number;
  /** Plain noun phrase for the FAILING population, e.g. "missed greens from
   *  125–175 yd". */
  populationLabel: string;
  /** Plain noun phrase for the whole checked population. */
  universeLabel: string;
  /** Highest cause state this family may claim (ladder caps, supercharge 02
   *  §6-7 #15/#19). A repeated tee-shot or opening-hole path is a pattern,
   *  not a counted cause, so those families stop at "likely". */
  maxState?: 'inferred_hypothesis';
}

const BAND_LABEL: Record<string, string> = {
  '50_125ft': '50–125 yd',
  '125_175ft': '125–175 yd',
  '175_plus_ft': '175+ yd',
};

/** Metric id → the recorded shot sequence that can show where it goes wrong.
 *  `null` for metrics no shot sequence describes (practice-vs-tournament
 *  delta, putt break bias, …) — those always take the hypothesis branch. */
export function sequenceTargetFor(metric: string): SequenceTarget | null {
  if (metric === 'sg_ott') {
    return {
      family: 'tee',
      rollup: 'tee_to_next',
      populationLabel: 'costly tee shots on par 4s and 5s',
      universeLabel: 'tee shots on par 4s and 5s',
      maxState: 'inferred_hypothesis',
    };
  }
  const approach = metric.match(/^approach_proximity_(50_125ft|125_175ft|175_plus_ft)$/);
  if (approach) {
    const band = approach[1]!;
    return {
      family: 'approach',
      rollup: 'approach_to_recovery',
      band,
      populationLabel: `missed greens from ${BAND_LABEL[band]}`,
      universeLabel: `approaches from ${BAND_LABEL[band]}`,
    };
  }
  const putt = metric.match(/^putts_made_(\d+)_(\d+|plus)_?ft_pct$/);
  if (putt) {
    const min = Number(putt[1]);
    const max = putt[2] === 'plus' ? null : Number(putt[2]);
    const range = max === null ? `${min}+ ft` : `${min}–${max} ft`;
    return {
      family: 'putt',
      rollup: 'first_putt_to_next_putt',
      puttRange: [min, max],
      populationLabel: `missed first putts from ${range}`,
      universeLabel: `first putts from ${range}`,
    };
  }
  if (metric === 'scrambling_pct_sand') {
    return {
      family: 'sand',
      rollup: 'coverage',
      populationLabel: 'greenside bunker shots not saved in two',
      universeLabel: 'greenside bunker shots',
    };
  }
  if (metric === 'penalty_rate_per_round') {
    return {
      family: 'penalty',
      rollup: 'coverage',
      populationLabel: 'penalty strokes',
      universeLabel: 'penalty strokes',
    };
  }
  if (metric === 'big_number_rate') {
    return {
      family: 'big_number',
      rollup: 'coverage',
      populationLabel: 'double-bogey-or-worse holes',
      universeLabel: 'holes',
    };
  }
  const par = metric.match(/^scoring_par_([345])$/);
  if (par) {
    const p = Number(par[1]);
    return {
      family: 'par',
      rollup: 'coverage',
      par: p,
      populationLabel: `over-par par ${p}s`,
      universeLabel: `par ${p}s`,
    };
  }
  if (metric === 'opening_hole_delta') {
    return {
      family: 'opening_hole',
      rollup: 'coverage',
      populationLabel: 'over-par opening holes',
      universeLabel: 'opening holes',
      maxState: 'inferred_hypothesis',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 3. Occurrences — one per checked situation, with the path that followed
// ---------------------------------------------------------------------------

/** One checked situation on a complete hole. */
export interface Occurrence {
  round_id: string;
  hole_number: number;
  failed: boolean;
  /** The shot-by-shot path that followed a failure. `null` when not failed. */
  pattern: string | null;
  /** Strokes vs the canonical SG baseline over the occurrence's own events
   *  (negative = lost). `null` when any baseline endpoint was unresolved. */
  strokes: number | null;
  /** For a failed shot-level occurrence: which optional fields the failing
   *  shot carries (drives the data gap). Absent for hole-level families. */
  recorded?: Partial<Record<GapField, boolean>>;
}

/** Optional `golf_shots` fields a counted path reads. When one is missing on
 *  too many failures the path cannot repeat, and the cause is a data gap. */
export type GapField = 'miss_direction' | 'distance_to_hole_after';

/** A tee shot/event costing at least this many strokes vs baseline counts
 *  as a failure, and a hole-level event at least this costly is named in a
 *  big-number/over-par path. Stated in the diagnosis text, never hidden. */
export const COSTLY_EVENT_STROKES = 0.3;

const EVENT_LABEL: Record<SequenceEventKind, string> = {
  tee_to_next: 'costly tee shot',
  approach_to_recovery: 'missed green and recovery',
  first_putt_to_next_putt: 'costly first putt',
  putting_sequence: 'extra putts',
  penalty: 'penalty',
  other: 'costly layup or extra shot',
};

/** Primary miss direction only (`short_right` → " short", `high_long` →
 *  " long") — a finer split fragments paths so nothing ever repeats. The
 *  short/long axis leads (the dial-in lever), then left/right, then the
 *  putting high/low read. */
function fmtDir(dir: string | null): string {
  if (!dir) return '';
  const parts = dir.toLowerCase().split('_').filter(Boolean);
  for (const axis of ['short', 'long', 'left', 'right', 'high', 'low']) {
    if (parts.includes(axis)) return ` ${axis}`;
  }
  return '';
}

/** Coarse leave for a RECOVERY shot (a chip/pitch/bunker shot), wider than
 *  the putt buckets so a repeated path actually repeats. Null when the leave
 *  is not recorded: an unrecorded step is not a path (review S1). */
function recoveryLeave(feet: number | null): string | null {
  if (feet === null) return null;
  if (feet < 6) return 'inside 6 ft';
  if (feet < 20) return '6–20 ft';
  return '20+ ft';
}

function lieWord(lie: string | null): string {
  const l = (lie ?? '').toLowerCase();
  if (l === 'sand') return 'a bunker';
  if (l === 'rough') return 'the rough';
  if (l === 'fairway') return 'the fairway';
  if (l === 'green') return 'the green';
  if (l === 'penalty') return 'a hazard';
  return 'trouble';
}

/** Coarse on-green leave bucket so repeated paths actually repeat. Null when
 *  the leave is not recorded (the putt family's data gap names it). */
function leaveBucket(feet: number | null): string | null {
  if (feet === null) return null;
  if (feet < 3) return 'inside 3 ft';
  if (feet < 6) return '3–6 ft';
  if (feet < 10) return '6–10 ft';
  if (feet < 20) return '10–20 ft';
  if (feet < 35) return '20–35 ft';
  return '35+ ft';
}

function isHoled(s: ShotFact): boolean {
  return s.result === 'hole' || s.putt_made === true;
}

function onGreen(s: ShotFact): boolean {
  if (isHoled(s)) return true;
  if (s.result === 'green' || s.result === 'gir') return true;
  return (s.lie_after ?? '').toLowerCase() === 'green';
}

function puttsText(n: number): string {
  if (n === 0) return 'holed out';
  return n === 1 ? '1 putt' : `${n} putts`;
}

function shotStepLabel(s: ShotFact): string {
  if (s.shot_type === 'putting') return 'putt';
  if (s.shot_type === 'around_green') {
    return (s.lie_before ?? '').toLowerCase() === 'sand' ? 'bunker shot' : 'chip';
  }
  if (s.shot_type === 'approach') return 'approach';
  if (s.shot_type === 'tee') return 'tee shot';
  return 'shot';
}

/** "chip to 10–20 ft" / "chip stayed in the rough"; null when the step
 *  found the green but its leave is not recorded. */
function recoveryStep(s: ShotFact): string | null {
  const label = shotStepLabel(s);
  if (isHoled(s)) return `${label} holed`;
  if (onGreen(s)) {
    const leave = recoveryLeave(s.distance_to_hole_after_feet);
    return leave === null ? null : `${label} to ${leave}`;
  }
  return `${label} stayed off the green`;
}

/** Join path steps; any unrecorded step makes the whole path unrecorded. */
function joinSteps(steps: ReadonlyArray<string | null>): string | null {
  return steps.every((x): x is string => x !== null) ? steps.join(' → ') : null;
}

function eventFor(events: readonly SequenceEvent[], shotNumber: number | null): SequenceEvent | undefined {
  if (shotNumber === null) return undefined;
  return events.find((e) => e.shotNumbers.includes(shotNumber));
}

/** The costly steps of a hole, or null when no single step was costly: a
 *  hole whose strokes are spread thin has no path to count (review S1). */
export function costlyPath(events: readonly SequenceEvent[]): string | null {
  const labels: string[] = [];
  for (const e of events) {
    const costly = e.kind === 'penalty' || (e.measuredContribution !== null && e.measuredContribution <= -COSTLY_EVENT_STROKES);
    if (!costly) continue;
    const label = EVENT_LABEL[e.kind];
    if (labels[labels.length - 1] !== label) labels.push(label);
  }
  return labels.length ? labels.join(' → ') : null;
}

function holeOccurrences(
  target: SequenceTarget,
  hole: HoleContext,
  shots: readonly ShotFact[],
  events: readonly SequenceEvent[],
  holeTotal: number | null,
): Occurrence[] {
  const base = { round_id: hole.round_id, hole_number: hole.hole_number };
  const out: Occurrence[] = [];

  switch (target.family) {
    case 'tee': {
      if (hole.par === 3) return out;
      const tee = shots[0];
      if (!tee || tee.shot_type !== 'tee' || tee.is_penalty) return out;
      const ev = eventFor(events, tee.shot_number);
      const strokes = ev?.measuredContribution ?? null;
      const failed = strokes !== null && strokes <= -COSTLY_EVENT_STROKES;
      let pattern: string | null = null;
      if (failed) {
        const club = tee.club_type === 'driver' ? 'driver' : 'tee shot';
        const where = tee.miss_direction ? `missed${fmtDir(tee.miss_direction)} into ${lieWord(tee.lie_after ?? tee.result)}` : `into ${lieWord(tee.lie_after ?? tee.result)}`;
        const next = shots[1];
        let then = '';
        if (next?.is_penalty) then = ' → penalty stroke';
        else if (next && next.shot_type === 'approach') then = onGreen(next) ? ' → approach found the green' : ' → approach missed the green';
        else if (next) then = ` → ${shotStepLabel(next)}`;
        pattern = `${club} ${where}${then}`;
      }
      out.push({
        ...base,
        failed,
        pattern,
        strokes,
        ...(failed ? { recorded: { miss_direction: !!tee.miss_direction } } : {}),
      });
      return out;
    }
    case 'approach': {
      for (let i = 0; i < shots.length; i++) {
        const s = shots[i]!;
        if (s.is_penalty || s.shot_type !== 'approach' || s.intent === 'layup') continue;
        if (bandOf(s) !== target.band) continue;
        const failed = !onGreen(s);
        // A2's eligibility rule (`metrics/distance-profile.ts`): from 175+ a
        // par-5 shot that did not find the green is a likely lay-up, not a
        // missed green. `intent` is never tagged in production, so without
        // this 49 of one player's 83 "missed greens from 175+" were lay-ups.
        if (failed && target.band === '175_plus_ft' && hole.par === 5) continue;
        const ev = eventFor(events, s.shot_number);
        let pattern: string | null = null;
        if (failed) {
          const steps: Array<string | null> = [`approach missed${fmtDir(s.miss_direction)}`];
          let j = i + 1;
          while (j < shots.length && shots[j]!.shot_type !== 'putting') {
            const r = shots[j]!;
            steps.push(r.is_penalty ? 'penalty stroke' : recoveryStep(r));
            if (!r.is_penalty && onGreen(r)) {
              j += 1;
              break;
            }
            j += 1;
          }
          const putts = shots.slice(j).filter((x) => x.shot_type === 'putting').length;
          if (!steps[steps.length - 1]?.endsWith('holed')) steps.push(puttsText(putts));
          pattern = joinSteps(steps);
        }
        out.push({
          ...base,
          failed,
          pattern,
          strokes: ev?.measuredContribution ?? null,
          ...(failed ? { recorded: { miss_direction: !!s.miss_direction } } : {}),
        });
      }
      return out;
    }
    case 'putt': {
      const idx = shots.findIndex((s) => s.shot_type === 'putting' && !s.is_penalty);
      if (idx === -1) return out;
      const first = shots[idx]!;
      const d = first.distance_to_hole_before_feet;
      const [min, max] = target.puttRange!;
      if (d === null || d < min || (max !== null && d >= max)) return out;
      const failed = !isHoled(first);
      const ev = eventFor(events, first.shot_number);
      let pattern: string | null = null;
      if (failed) {
        const more = shots.slice(idx + 1).filter((x) => x.shot_type === 'putting').length;
        const leave = leaveBucket(first.distance_to_hole_after_feet);
        // A miss that leaves a tap-in and is holed next is the ordinary
        // result of a missed putt, not a path that explains a leak (review
        // S4); an unrecorded leave is not a path at all (S1). Both stay in
        // the failure count, so they still weigh against any counted path.
        const ordinary = leave === 'inside 3 ft' && more === 1;
        pattern =
          leave === null || ordinary
            ? null
            : `first putt missed${fmtDir(first.miss_direction)}, leaving ${leave}` +
              ` → ${more === 1 ? 'holed the next putt' : `${more} more putts`}`;
      }
      out.push({
        ...base,
        failed,
        pattern,
        strokes: ev?.measuredContribution ?? null,
        ...(failed
          ? {
              recorded: {
                miss_direction: !!first.miss_direction,
                distance_to_hole_after: first.distance_to_hole_after_feet !== null,
              },
            }
          : {}),
      });
      return out;
    }
    case 'sand': {
      for (let i = 0; i < shots.length; i++) {
        const s = shots[i]!;
        if (s.is_penalty || s.shot_type !== 'around_green') continue;
        if ((s.lie_before ?? '').toLowerCase() !== 'sand') continue;
        // Saved = holed in at most two strokes counting this one.
        const toHoleOut = shots.length - i;
        const failed = toHoleOut > 2;
        let pattern: string | null = null;
        if (failed) {
          const steps: Array<string | null> = [recoveryStep(s)];
          let j = i + 1;
          while (j < shots.length && shots[j]!.shot_type !== 'putting') {
            steps.push(shots[j]!.is_penalty ? 'penalty stroke' : recoveryStep(shots[j]!));
            j += 1;
          }
          steps.push(puttsText(shots.slice(j).filter((x) => x.shot_type === 'putting').length));
          pattern = joinSteps(steps);
        }
        out.push({ ...base, failed, pattern, strokes: null });
      }
      return out;
    }
    case 'penalty': {
      for (let i = 0; i < shots.length; i++) {
        const s = shots[i]!;
        if (!s.is_penalty) continue;
        const prev = shots.slice(0, i).reverse().find((x) => !x.is_penalty);
        // Production records a tee-shot penalty (re-tee) as shot 1 with
        // lie_before 'tee' and no preceding row.
        const pattern = prev
          ? `${shotStepLabel(prev)}${fmtDir(prev.miss_direction)} into ${lieWord(prev.lie_after ?? prev.result)} → penalty`
          : (s.lie_before ?? '').toLowerCase() === 'tee'
            ? 'tee shot → penalty (re-tee)'
            : 'penalty with no recorded preceding shot';
        out.push({ ...base, failed: true, pattern, strokes: null });
      }
      return out;
    }
    case 'big_number':
    case 'par':
    case 'opening_hole': {
      if (target.family === 'par' && hole.par !== target.par) return out;
      if (target.family === 'opening_hole' && hole.hole_number !== 1) return out;
      const over = hole.total_strokes - hole.par;
      const failed = target.family === 'big_number' ? over >= 2 : over > 0;
      out.push({ ...base, failed, pattern: failed ? costlyPath(events) : null, strokes: holeTotal });
      return out;
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Observation — the most common path, gated on honest floors
// ---------------------------------------------------------------------------

/** Raised from PR #2073's 3 / 25% (supercharge 00 decision 6, 07 §5). */
export const MIN_PATTERN_OCCURRENCES = 4;
export const MIN_PATTERN_SHARE = 0.3;
/** Rounds a counted path must span: one round is one day (02 §2, review S8). */
export const MIN_PATTERN_ROUNDS = 2;

/** Fewest steps a reported path may have. A shot-level family's path must
 *  be a real SEQUENCE (the failing shot AND what followed) — a lone
 *  "approach missed short" is a miss-direction tally the generator already
 *  reports, not a sequence. A hole-level family's step is itself an event
 *  (e.g. "missed green and recovery"), so one is enough. */
const MIN_PATH_STEPS: Record<SequenceFamily, number> = {
  tee: 2,
  approach: 2,
  putt: 2,
  sand: 2,
  penalty: 2,
  big_number: 1,
  par: 1,
  opening_hole: 1,
};

function qualifies(count: number, of: number, roundsN: number): boolean {
  return (
    count >= MIN_PATTERN_OCCURRENCES && count / Math.max(1, of) >= MIN_PATTERN_SHARE && roundsN >= MIN_PATTERN_ROUNDS
  );
}

/**
 * The most specific repeated path. Full paths fragment (the putts at the end
 * vary), so every prefix of at least `minSteps` steps is counted too — each
 * occurrence counts once per prefix — and the LONGEST prefix that clears
 * the repeat floors wins (then higher count, more rounds, lexical, so the
 * result is deterministic). When nothing qualifies, the most common full
 * path is returned so the shortfall text can name it.
 */
export interface TopPath {
  pattern: string;
  count: number;
  rounds: number;
  /** Up to 5 holes the path was recorded on, in input order. */
  examples: Array<{ round_id: string; hole_number: number }>;
}

/** Most example holes a counted path carries. */
export const MAX_EXAMPLE_HOLES = 5;

export function topPath(
  failed: readonly Occurrence[],
  minSteps: number,
): TopPath | null {
  const counts = new Map<
    string,
    { count: number; rounds: Set<string>; steps: number; full: number; examples: TopPath['examples'] }
  >();
  for (const o of failed) {
    if (!o.pattern) continue;
    const tokens = o.pattern.split(' → ');
    const seen = new Set<string>();
    for (let k = Math.min(minSteps, tokens.length); k <= tokens.length; k++) {
      const prefix = tokens.slice(0, k).join(' → ');
      if (seen.has(prefix)) continue;
      seen.add(prefix);
      const c = counts.get(prefix) ?? { count: 0, rounds: new Set<string>(), steps: k, full: 0, examples: [] };
      c.count += 1;
      c.rounds.add(o.round_id);
      if (c.examples.length < MAX_EXAMPLE_HOLES) c.examples.push({ round_id: o.round_id, hole_number: o.hole_number });
      if (k === tokens.length) c.full += 1;
      counts.set(prefix, c);
    }
  }
  const entries = [...counts.entries()];
  const byStrength = (
    a: [string, { count: number; rounds: Set<string> }],
    b: [string, { count: number; rounds: Set<string> }],
  ) => b[1].count - a[1].count || b[1].rounds.size - a[1].rounds.size || a[0].localeCompare(b[0]);
  const qualifying = entries
    .filter(([, c]) => c.steps >= minSteps && qualifies(c.count, failed.length, c.rounds.size))
    .sort((a, b) => b[1].steps - a[1].steps || byStrength(a, b));
  const pick = qualifying[0] ?? entries.filter(([, c]) => c.full > 0).sort(byStrength)[0];
  return pick
    ? { pattern: pick[0], count: pick[1].count, rounds: pick[1].rounds.size, examples: pick[1].examples }
    : null;
}

export interface SequenceObservation {
  target: SequenceTarget;
  /** Complete (attributable) holes in scope vs holes checked. */
  holesAttributed: number;
  holesChecked: number;
  universe: number;
  failures: number;
  failureRounds: number;
  /** Status of the gating A4 rollup row. */
  rollupStatus: MetricResult['status'];
  top: TopPath | null;
  /** For each optional field the family's path reads: failures carrying it. */
  fieldCoverage: Array<{ field: GapField; have: number; of: number }>;
  /** Mean strokes vs baseline over failures whose baseline resolved. */
  meanStrokesPerFailure: number | null;
  strokesSampleN: number;
  /** True only when every floor holds (see module doc). */
  observed: boolean;
  /** Why not observed (empty when observed). */
  shortfalls: string[];
}

/**
 * Run the target over a player's complete holes. `holes` must already be
 * window/cutoff/completed-status scoped by the caller (A1's loader does
 * this); `facts` are re-scoped by `computeSequenceAttribution` itself.
 */
export function observeSequence(
  target: SequenceTarget,
  facts: readonly ShotFact[],
  holes: readonly HoleContext[],
  scope: AnalysisScope,
): SequenceObservation {
  const rollups = computeSequenceAttribution(facts, holes, scope);
  const rollupRow =
    target.rollup === 'coverage'
      ? rollups.find((r) => r.metricId === 'sequence_hole_coverage')
      : rollups.find((r) => r.metricId === 'sequence_event_strokes_gained' && r.dimensions.event_kind === target.rollup);
  const rollupStatus = rollupRow?.status ?? 'invalid';

  // Group facts by hole once (attributeSequence/buildHoleSequence each
  // filter the whole list otherwise — O(holes × shots)).
  const byHole = new Map<string, ShotFact[]>();
  for (const f of facts) {
    const k = `${f.round_id}:${f.hole_number}`;
    const arr = byHole.get(k);
    if (arr) arr.push(f);
    else byHole.set(k, [f]);
  }

  const occurrences: Occurrence[] = [];
  let holesAttributed = 0;
  for (const hole of holes) {
    const holeFacts = byHole.get(`${hole.round_id}:${hole.hole_number}`) ?? [];
    const attribution = attributeSequence(holeFacts, hole, scope);
    if (attribution.status !== 'attributed') continue;
    holesAttributed += 1;
    const { shots } = buildHoleSequence(holeFacts, hole);
    occurrences.push(
      ...holeOccurrences(target, hole, shots, attribution.events, attribution.totalMeasuredContribution),
    );
  }

  const failed = occurrences.filter((o) => o.failed);
  const failureRounds = new Set(failed.map((o) => o.round_id)).size;
  const top = topPath(failed, MIN_PATH_STEPS[target.family]);
  const fieldCoverage: SequenceObservation['fieldCoverage'] = [];
  for (const field of ['miss_direction', 'distance_to_hole_after'] as const) {
    const tracked = failed.filter((o) => o.recorded && field in o.recorded);
    if (tracked.length === 0) continue;
    fieldCoverage.push({ field, have: tracked.filter((o) => o.recorded![field]).length, of: tracked.length });
  }

  const resolved = failed.filter((o) => o.strokes !== null);
  const meanStrokesPerFailure =
    resolved.length > 0 ? resolved.reduce((s, o) => s + (o.strokes as number), 0) / resolved.length : null;

  const shortfalls: string[] = [];
  if (rollupStatus !== 'supported') {
    shortfalls.push(
      target.rollup === 'coverage'
        ? `complete shot records cover ${holesAttributed} holes — not yet enough to trace (need ${SEQUENCE_MIN_EVENTS} holes over ${SEQUENCE_MIN_ROUNDS} rounds)`
        : `too few recorded ${EVENT_LABEL[target.rollup]} events to trace (need ${SEQUENCE_MIN_EVENTS} over ${SEQUENCE_MIN_ROUNDS} rounds)`,
    );
  }
  if (failed.length < SEQUENCE_MIN_EVENTS || failureRounds < SEQUENCE_MIN_ROUNDS) {
    shortfalls.push(
      `${failed.length} ${target.populationLabel} across ${rounds(failureRounds)} (need ${SEQUENCE_MIN_EVENTS} over ${SEQUENCE_MIN_ROUNDS} rounds)`,
    );
  }
  if (!top || !qualifies(top.count, failed.length, top.rounds)) {
    shortfalls.push(
      top
        ? `no single follow-up path repeats often enough (most common: "${top.pattern}", ${top.count} of ${failed.length})`
        : 'no follow-up path recorded',
    );
  }

  return {
    target,
    holesAttributed,
    holesChecked: holes.length,
    universe: occurrences.length,
    failures: failed.length,
    failureRounds,
    rollupStatus,
    top,
    fieldCoverage,
    meanStrokesPerFailure,
    strokesSampleN: resolved.length,
    observed: shortfalls.length === 0,
    shortfalls,
  };
}

// ---------------------------------------------------------------------------
// 5. A5 controlled hypotheses, where a family applies
// ---------------------------------------------------------------------------

export function hypothesisLabel(state: Hypothesis['state']): DiagnosisHypothesisLabel {
  return state === 'supported_association' ? 'corroborated' : state;
}

const LABEL_RANK: Record<DiagnosisHypothesisLabel, number> = { corroborated: 2, candidate: 1, no_data: 0 };

/**
 * The single most-supported A5 hypothesis relevant to this metric, or null
 * when no A5 family speaks to it. Only families whose domain matches the
 * metric are considered: `par5_opportunity_loss` for par-5 scoring (fed by
 * the real A3 `computeParOpportunities` rows), the approach families
 * (`short_bias`/`rough_gap`/`insufficient`) for green-hit bands.
 */
export function relevantHypothesis(
  target: SequenceTarget | null,
  metric: string,
  facts: readonly ShotFact[],
  holes: readonly HoleContext[],
  scope: AnalysisScope,
): Hypothesis | null {
  let families: ReadonlySet<Hypothesis['family']>;
  let metrics: MetricResult[] = [];
  let scopedFacts: readonly ShotFact[] = facts;
  if (metric === 'scoring_par_5') {
    families = new Set(['par5_opportunity_loss']);
    metrics = computeParOpportunities([...facts], [...holes], scope);
  } else if (target?.family === 'approach') {
    families = new Set(['short_bias', 'rough_gap', 'insufficient']);
    scopedFacts = facts.filter((f) => bandOf(f) === target.band);
  } else {
    return null;
  }
  const candidates = buildHypotheses(metrics, scopedFacts).filter((h) => families.has(h.family));
  if (candidates.length === 0) return null;
  // Most-supported first; within a label, the one with the most claims.
  return [...candidates].sort(
    (a, b) =>
      LABEL_RANK[hypothesisLabel(b.state)] - LABEL_RANK[hypothesisLabel(a.state)] ||
      b.supportingClaimIds.length - a.supportingClaimIds.length ||
      a.id.localeCompare(b.id),
  )[0]!;
}

// ---------------------------------------------------------------------------
// 5b. Window — the scope an insight's own evidence describes
// ---------------------------------------------------------------------------

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isDate(s: string | undefined | null): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s);
}

/**
 * Pure + exported: the load scope for an insight's evidence window, or null
 * when the row stamps none.
 *
 *   - `window_start` is a date → `[window_start, window_end or today]`;
 *   - else `window_days > 0` with `window_end` a date → `[end − days, end]`
 *     (the lifetime generators stamp the span and the last round);
 *   - else `window_days > 0` → the rolling `[today − days, today]`;
 *   - else null: a span of 0 days is no window, not `[end, end]` (review S6).
 *     PR #2073 fell back to the last 12 months here, which read a window the
 *     metric never described (supercharge 07 §5); the caller now says "not
 *     traced: no stamped window" instead.
 *
 * Rolling generators (window ending today, `window_end` = newest round) do
 * not go through the stamped fields: the base passes
 * `rollingWindowEvidence(days)` (`BaseGenerator.rollingWindowDays`).
 */
export function scopeForEvidence(
  playerId: string,
  evidence: Pick<InsightEvidence, 'window_start' | 'window_end' | 'window_days'>,
  now: Date = new Date(),
): { scope: AnalysisScope; label: string } | null {
  const hasEnd = isDate(evidence.window_end);
  const endStr = hasEnd ? evidence.window_end.slice(0, 10) : dateOnly(now);
  const days = Number(evidence.window_days);
  let startStr: string;
  if (isDate(evidence.window_start)) {
    startStr = evidence.window_start.slice(0, 10);
  } else if (Number.isFinite(days) && days > 0) {
    const end = new Date(`${endStr}T00:00:00Z`);
    startStr = dateOnly(new Date(end.getTime() - days * 86400_000));
  } else {
    return null;
  }
  return {
    scope: {
      player_id: playerId,
      window_start: startStr,
      window_end: endStr,
      analysis_cutoff: now.toISOString(),
    },
    label: `${startStr} to ${endStr}`,
  };
}

/** The evidence-window fields of a rolling `days`-day window ending today:
 *  what `scopeForEvidence` must read for a generator whose aggregate is
 *  `round_date >= now − days` (its stamped `window_end` is the newest round). */
export function rollingWindowEvidence(
  days: number,
  now: Date = new Date(),
): Pick<InsightEvidence, 'window_start' | 'window_end' | 'window_days'> {
  const end = dateOnly(now);
  const start = dateOnly(new Date(new Date(`${end}T00:00:00Z`).getTime() - days * 86400_000));
  return { window_start: start, window_end: end, window_days: days };
}

// ---------------------------------------------------------------------------
// 5c. Context narrowing — length → par × length → shape (evidence-gated)
// ---------------------------------------------------------------------------

/**
 * The context narrowing for this metric's failing population, or null when
 * no subject applies (putting keeps its own attempt-sized reading; sand,
 * penalty and big-number rows are not a length/par/shape question). See
 * `context-narrowing.ts` for the gates. `holes` must already be scoped.
 */
export function narrowingFor(
  target: SequenceTarget | null,
  facts: readonly ShotFact[],
  holes: readonly HoleContext[],
): Narrowing | null {
  if (!target) return null;
  if (target.family === 'approach' && isNarrowBand(target.band)) return narrowApproach(facts, holes, target.band);
  if (target.family === 'tee') return narrowTee(facts, holes);
  if (target.family === 'par' && (target.par === 3 || target.par === 4 || target.par === 5)) {
    return narrowParScoring(facts, holes, target.par);
  }
  return null;
}

export function toDiagnosisNarrowing(n: Narrowing): DiagnosisNarrowing {
  return {
    subject: n.subject,
    path: n.path,
    stopped_at: n.stoppedAt,
    steps: n.steps.map((s) => ({ level: s.level, passed: s.passed, label: s.label, statement: s.statement })),
    sentence: n.sentence,
    ...(Object.keys(n.excluded).length > 0 ? { excluded: n.excluded } : {}),
  };
}

/** True when the narrowing got past its population step (something worth
 *  putting in the root-cause text, not just the basis). */
export function narrowingSpeaks(n: DiagnosisNarrowing | Narrowing | null | undefined): boolean {
  if (!n) return false;
  const first = n.steps[0];
  return !!first && first.passed;
}

// ---------------------------------------------------------------------------
// 6. Compose the typed Diagnosis
// ---------------------------------------------------------------------------

export interface RootCauseContext {
  facts: readonly ShotFact[];
  holes: readonly HoleContext[];
  scope: AnalysisScope;
  /** Human window label used in the text, e.g. "2026-06-26 to 2026-09-24". */
  windowLabel: string;
}

type DiagnosisEvidence = Pick<
  InsightEvidence,
  | 'metric'
  | 'metric_label'
  | 'unit'
  | 'your_value'
  | 'your_value_display'
  | 'comparison_value'
  | 'comparison_label'
  | 'sample_n'
>;

function metricDriver(evidence: DiagnosisEvidence, metricId: string): DiagnosisDriver {
  return {
    metric: evidence.metric || metricId,
    label: evidence.metric_label,
    value: evidence.your_value,
    unit: evidence.unit,
    sample_n: evidence.sample_n,
    source: 'golf_player_stats_cache',
  };
}

function symptomOf(evidence: DiagnosisEvidence): string {
  return (
    `${evidence.metric_label}: ${evidence.your_value_display} ` +
    `vs ${evidence.comparison_label} ${evidence.comparison_value}`
  );
}

function rounds(n: number): string {
  return n === 1 ? '1 round' : `${n} rounds`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** A practice focus that follows from the observed path — names the step
 *  the path starts with; never a mechanical/psychological cause. */
export function observedAction(target: SequenceTarget, pattern: string): string {
  const first = pattern.split(' → ')[0]!;
  switch (target.family) {
    case 'tee':
      return `Work on the tee shot that starts this path (${first}): target and club choice on those holes`;
    case 'approach':
      return `Practice the shot these misses leave you (${first}) and the recovery that follows`;
    case 'putt': {
      // Only lag pace is a sourced lever: from 25+ ft, 3-putts are driven by
      // speed control, not line (docs/v3-research-golf-domain.md, "Lag
      // Putting (>25 ft)"). Start line and other stroke mechanics cannot be
      // inferred from outcome data (same doc, engine constraint 5), so the
      // shorter bands get a neutral practice line.
      const range = target.universeLabel.replace('first putts from ', '');
      const lag = target.puttRange !== undefined && target.puttRange[0] >= 25;
      return lag
        ? `Work on lag pace from ${range}: aim to leave the second putt inside 3 ft`
        : `Practice first putts from ${range}`;
    }
    case 'sand':
      return `Practice greenside bunker shots to a two-putt-or-better leave (${first})`;
    case 'penalty':
      return `Plan a target that takes the hazard out of play on the holes where this happens (${first})`;
    case 'big_number':
    case 'par':
    case 'opening_hole':
      return `Start with the costliest step on these holes: ${first}`;
  }
}

// ---------------------------------------------------------------------------
// 6b. Likely from totals — the corroboration gate on the narrowing's slice
// ---------------------------------------------------------------------------

/** Fewest attempts each arm of a "likely from totals" association needs. */
export const LIKELY_MIN_ARM_N = 10;
/** Slice failure rate ÷ rest failure rate a "likely" association needs. */
export const LIKELY_MIN_LIFT = 1.25;
/** Family-wise error rate the "likely" interval holds across the slices tried. */
export const LIKELY_FAMILY_ALPHA = 0.05;

/** Standard normal quantile: Acklam's rational approximation (relative
 *  error under 1.2e-9). Pure. */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError(`normalQuantile: p must be in (0, 1), got ${p}`);
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > 1 - lo) return -normalQuantile(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

/** Two-sided z for a Bonferroni-adjusted interval over `looks` comparisons. */
export function bonferroniZ(looks: number, alpha: number = LIKELY_FAMILY_ALPHA): number {
  const k = Math.max(1, Math.floor(looks));
  return normalQuantile(1 - alpha / (2 * k));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function pctText(x: number): string {
  return `${Math.round(x * 100)}%`;
}

/**
 * The narrowing's chosen par × length slice as a corroborated association,
 * or null when it does not clear the gate (module doc): both arms
 * >= LIKELY_MIN_ARM_N attempts, slice rate >= LIKELY_MIN_LIFT × the rest's,
 * and the Newcombe lower bound of the difference > 0. The narrowing picked
 * its slice after looking at every par and par × length slice
 * (`sliceChecks`), so the chosen one is the best of several looks, not one.
 * The interval is therefore Bonferroni-widened over the slices tried (a
 * family-wise 95%), which keeps "likely" near its nominal rate under a true
 * null. Benjamini-Hochberg across reads arrives with Slice 1.
 */
export function likelyFromTotals(n: Narrowing | null): InsightCauseAlternative | null {
  const sl = n?.slice;
  if (!n || !sl || sl.restRate === null) return null;
  if (sl.attempts < LIKELY_MIN_ARM_N || sl.restAttempts < LIKELY_MIN_ARM_N) return null;
  if (sl.rate < LIKELY_MIN_LIFT * sl.restRate || sl.rate <= sl.restRate) return null;
  const looks = Math.max(1, n.sliceChecks?.length ?? 1);
  const ci = proportionDiffInterval(sl.failures, sl.attempts, sl.restFailures, sl.restAttempts, bonferroniZ(looks));
  if (!ci || !(ci.low > 0)) return null;
  return {
    label: likelyLabel(n.subject, sl.label),
    lift: sl.restRate > 0 ? round2(sl.rate / sl.restRate) : null,
    arm_a: { n: sl.attempts, failures: sl.failures, rate: round3(sl.rate) },
    arm_b: { n: sl.restAttempts, failures: sl.restFailures, rate: round3(sl.restRate) },
    lower_bound: round3(ci.low / 100),
    upper_bound: round3(ci.high / 100),
  };
}

function likelyLabel(subject: Narrowing['subject'], slice: string): string {
  if (subject === 'approach') return `Green missed on ${slice}`;
  if (subject === 'tee') return `Fairway missed on ${slice}`;
  return `Over par on ${slice}`;
}

function likelySentence(n: Narrowing, alt: InsightCauseAlternative, slice: string): string {
  const a = alt.arm_a;
  const b = alt.arm_b;
  const lo = Math.round(alt.lower_bound * 100);
  const hi = Math.round(alt.upper_bound * 100);
  let body: string;
  if (n.subject === 'approach') {
    body = `on ${slice}, ${a.failures} of ${a.n} ${n.population} missed the green (${pctText(a.rate)}) against ${b.failures} of ${b.n} elsewhere (${pctText(b.rate)})`;
  } else if (n.subject === 'tee') {
    body = `on ${slice}, ${a.failures} of ${a.n} tee shots missed the fairway (${pctText(a.rate)}) against ${b.failures} of ${b.n} on other par 4s and 5s (${pctText(b.rate)})`;
  } else {
    body = `${a.failures} of ${a.n} ${slice} finished over par (${pctText(a.rate)}) against ${b.failures} of ${b.n} other ${n.population} (${pctText(b.rate)})`;
  }
  return `Likely from the totals: ${body}; difference ${lo}–${hi} points. Not yet a counted sequence.`;
}

// ---------------------------------------------------------------------------
// 6c. Data gap — the one missing field
// ---------------------------------------------------------------------------

/** Share of failures that must carry an optional field (supercharge 04 §2). */
export const DATA_GAP_MIN_COVERAGE = 0.6;

/**
 * How many of the NEXT failures must carry the field for coverage to reach
 * DATA_GAP_MIN_COVERAGE: the smallest x with (have + x) / (of + x) ≥ 0.6.
 * New failures join the population too, so 60% of today's population is not
 * enough (5 of 30 tagged + 18 more = 23 of 48, 48%). In integers:
 * 5(have + x) ≥ 3(of + x) ⇔ x ≥ (3·of − 5·have) / 2. At least 1.
 */
export function dataGapTagsNeeded(have: number, of: number): number {
  return Math.max(1, Math.ceil((3 * of - 5 * have) / 2));
}

const SHOT_NOUN: Partial<Record<SequenceFamily, string>> = { tee: 'tee shot', approach: 'approach', putt: 'putt' };

const PROMPT: Record<GapField, Partial<Record<SequenceFamily, string>>> = {
  miss_direction: {
    tee: 'Which side? Left · Right',
    approach: 'Where did it miss? Short · Long · Left · Right',
    putt: 'Which side? Short · Long · High · Low',
  },
  distance_to_hole_after: {
    putt: 'How far from the hole did it stop?',
  },
};

function shotFilterFor(target: SequenceTarget): Record<string, unknown> {
  switch (target.family) {
    case 'approach':
      return { shot_type: 'approach', band: target.band, found_green: false };
    case 'putt':
      return { shot_type: 'putting', first_putt: true, distance_feet: target.puttRange, holed: false };
    case 'tee':
      return { shot_type: 'tee', par: [4, 5], min_strokes_lost: COSTLY_EVENT_STROKES };
    default:
      return { family: target.family };
  }
}

/**
 * The field recorded on the smallest share of the failures, when that share
 * is below DATA_GAP_MIN_COVERAGE; else null. `target_count` is how many of
 * the next failures must be tagged to clear the gate (`dataGapTagsNeeded`);
 * `have_count` the ones already tagged.
 */
export function dataGapFor(obs: SequenceObservation): InsightDataGap | null {
  const worst = obs.fieldCoverage
    .filter((c) => c.of > 0 && c.have / c.of < DATA_GAP_MIN_COVERAGE)
    .sort((a, b) => a.have / a.of - b.have / b.of)[0];
  if (!worst) return null;
  const prompt = PROMPT[worst.field][obs.target.family];
  if (!prompt) return null;
  return {
    field: worst.field,
    shot_filter: shotFilterFor(obs.target),
    target_count: dataGapTagsNeeded(worst.have, worst.of),
    have_count: worst.have,
    prompt,
  };
}

function gapPhrase(field: GapField, family: SequenceFamily): string {
  const noun = SHOT_NOUN[family] ?? 'shot';
  return field === 'miss_direction' ? `which side the ${noun} missed` : `where the ${noun} stopped`;
}

// ---------------------------------------------------------------------------
// 6d. Compose the cause and the diagnosis
// ---------------------------------------------------------------------------

function observedDiagnosis(
  evidence: DiagnosisEvidence,
  metricId: string,
  obs: SequenceObservation,
  ctx: RootCauseContext,
  narrowing: Narrowing | null,
): Omit<Diagnosis, 'confidence_reason'> {
  const top = obs.top!;
  const lost =
    obs.meanStrokesPerFailure !== null && obs.meanStrokesPerFailure < 0
      ? `. Each cost about ${Math.abs(round1(obs.meanStrokesPerFailure)).toFixed(1)} strokes against the strokes-gained baseline`
      : '';
  const drivers: DiagnosisDriver[] = [
    {
      metric: 'sequence_pattern_share',
      label: `Path: ${top.pattern}`,
      value: Math.round((top.count / obs.failures) * 100),
      unit: 'percent',
      sample_n: obs.failures,
      source: 'golf_shots · complete hole sequences (A1/A4)',
    },
    failureDriver(obs),
  ];
  if (obs.meanStrokesPerFailure !== null) {
    drivers.push({
      metric: 'sequence_event_strokes_gained',
      label: 'Strokes vs baseline per occurrence',
      value: round1(obs.meanStrokesPerFailure),
      unit: 'strokes',
      sample_n: obs.strokesSampleN,
      source: 'sg_expected_strokes baseline (A4 attributeSequence)',
    });
  }
  drivers.push(metricDriver(evidence, metricId));
  return {
    symptom: symptomOf(evidence),
    root_cause:
      `${top.pattern} — ${top.count} of ${obs.failures} ${obs.target.populationLabel} ` +
      `across ${rounds(top.rounds)} (${ctx.windowLabel})${lost}.`,
    causality_level: 'observed_sequence',
    drivers,
    recommended_action: observedAction(obs.target, top.pattern),
    basis: {
      kind: 'shot_sequence',
      checked: checkedLines(obs, null, narrowing),
      ...(narrowing ? { narrowing: toDiagnosisNarrowing(narrowing) } : {}),
      sequence: {
        pattern: top.pattern,
        occurrences: top.count,
        of: obs.failures,
        population: obs.target.populationLabel,
        distinct_rounds: top.rounds,
        window: ctx.windowLabel,
        examples: top.examples,
      },
    },
  };
}

function failureDriver(obs: SequenceObservation): DiagnosisDriver {
  return {
    metric: 'sequence_failure_count',
    label: `${obs.target.populationLabel[0]!.toUpperCase()}${obs.target.populationLabel.slice(1)} (of ${obs.universe} ${obs.target.universeLabel})`,
    value: obs.failures,
    unit: 'count',
    sample_n: obs.universe,
    source: 'golf_shots · complete hole sequences (A1/A4)',
  };
}

function checkedLines(obs: SequenceObservation | null, hyp: Hypothesis | null, narrowing: Narrowing | null = null): string[] {
  const lines: string[] = [];
  if (narrowing) {
    for (const st of narrowing.steps) lines.push(`${st.level}: ${st.passed ? '' : 'not narrowed — '}${st.statement}`);
  }
  if (obs) {
    lines.push(`${obs.holesAttributed} of ${obs.holesChecked} holes have complete shot records`);
    lines.push(`${obs.failures} ${obs.target.populationLabel} of ${obs.universe} ${obs.target.universeLabel}, ${rounds(obs.failureRounds)}`);
    for (const c of obs.fieldCoverage) lines.push(`${c.field} recorded on ${c.have} of ${c.of} ${obs.target.populationLabel}`);
  }
  if (hyp) {
    lines.push(`A5 ${hyp.family}: ${hypothesisLabel(hyp.state)}${hyp.missingInputs.length ? ` (missing: ${hyp.missingInputs.join(', ')})` : ''}`);
  }
  return lines;
}

interface NotTraced {
  reason: InsightNotTracedReason;
  sentence: string;
  action: string | null;
  dataGap: InsightDataGap | null;
  countDown: InsightCause['count_down'];
}

/** Why the cause is not traced, in the order a reader needs it. Exported for tests. */
export function notTraced(
  evidence: Pick<InsightEvidence, 'metric_label'>,
  target: SequenceTarget | null,
  obs: SequenceObservation | null,
  flags: { loadFailed: boolean; noWindow: boolean },
): NotTraced {
  const none = { action: null, dataGap: null, countDown: undefined };
  if (flags.loadFailed) {
    return { ...none, reason: 'load_failed', sentence: 'Not traced on this run: the shot records could not be read.' };
  }
  if (!target) {
    return {
      ...none,
      reason: 'no_shot_path',
      sentence: `Not traced: no recorded shot path measures ${evidence.metric_label.toLowerCase()}.`,
    };
  }
  if (flags.noWindow || !obs) {
    return {
      ...none,
      reason: 'no_window',
      sentence: 'Not traced: this read has no stamped window, so no shot sequence was checked.',
    };
  }
  if (obs.failures < SEQUENCE_MIN_EVENTS || obs.failureRounds < SEQUENCE_MIN_ROUNDS) {
    return {
      ...none,
      reason: 'count_down',
      countDown: {
        need_events: SEQUENCE_MIN_EVENTS,
        need_rounds: SEQUENCE_MIN_ROUNDS,
        have_events: obs.failures,
        have_rounds: obs.failureRounds,
      },
      sentence:
        `Not traced yet. Needs ${SEQUENCE_MIN_EVENTS} ${target.populationLabel} over ${SEQUENCE_MIN_ROUNDS} rounds; ` +
        `${obs.failures} so far over ${rounds(obs.failureRounds)}.`,
    };
  }
  const gap = dataGapFor(obs);
  if (gap) {
    const field = gap.field as GapField;
    const tracked = obs.fieldCoverage.find((c) => c.field === field)!;
    const missing = tracked.of - tracked.have;
    return {
      reason: 'data_gap',
      dataGap: gap,
      countDown: undefined,
      sentence:
        `Not traced yet: ${missing} of ${tracked.of} ${target.populationLabel} have no record of ${gapPhrase(field, target.family)}. ` +
        `One tap on the next ${gap.target_count} fills it.`,
      action: `Tag ${gapPhrase(field, target.family)} on the next ${gap.target_count} ${target.populationLabel}`,
    };
  }
  const top = obs.top;
  if (target.maxState === 'inferred_hypothesis' && obs.observed && top) {
    const what = target.family === 'tee' ? 'tee-shot' : target.family === 'opening_hole' ? 'opening-hole' : 'shot';
    return {
      ...none,
      reason: 'pattern_only',
      sentence:
        `Not traced as a cause: "${top.pattern}" repeats on ${top.count} of ${obs.failures} ${target.populationLabel} ` +
        `across ${rounds(top.rounds)}, but a repeated ${what} path is a pattern, not a measured cause.`,
    };
  }
  const lead =
    `Not traced yet: ${obs.failures} ${target.populationLabel} over ${rounds(obs.failureRounds)} checked, and no single path ` +
    `accounts for ${MIN_PATTERN_OCCURRENCES} of them and ${Math.round(MIN_PATTERN_SHARE * 100)}% across ${MIN_PATTERN_ROUNDS} rounds` +
    (top ? ` (most common: "${top.pattern}", ${top.count} of ${obs.failures})` : '');
  const rollupNote = obs.rollupStatus !== 'supported' && obs.shortfalls[0] ? `; ${obs.shortfalls[0]}` : '';
  return { ...none, reason: 'no_leading_path', sentence: `${lead}${rollupNote}.` };
}

function hypothesisDiagnosis(
  evidence: DiagnosisEvidence,
  metricId: string,
  rootCause: string,
  action: string | null,
  extraDrivers: DiagnosisDriver[],
  obs: SequenceObservation | null,
  hyp: Hypothesis | null,
  narrowing: Narrowing | null,
): Omit<Diagnosis, 'confidence_reason'> {
  const drivers: DiagnosisDriver[] = [metricDriver(evidence, metricId), ...extraDrivers];
  if (obs && obs.universe > 0) drivers.push(failureDriver(obs));
  const basis: DiagnosisBasis = {
    kind: hyp ? 'hypothesis_policy' : 'aggregate_only',
    hypothesis_label: hyp ? hypothesisLabel(hyp.state) : 'no_data',
    checked: checkedLines(obs, hyp, narrowing),
    ...(narrowing ? { narrowing: toDiagnosisNarrowing(narrowing) } : {}),
  };
  return {
    symptom: symptomOf(evidence),
    root_cause: rootCause,
    causality_level: 'inferred_hypothesis',
    drivers,
    recommended_action: action ?? `Target ${evidence.metric_label.toLowerCase()} in the next practice block`,
    basis,
  };
}

function emptyCause(
  state: InsightCause['state'],
  target: SequenceTarget | null,
  obs: SequenceObservation | null,
  windowLabel: string | null,
): InsightCause {
  return {
    state,
    population: target?.populationLabel ?? null,
    window: windowLabel,
    path: null,
    occurrences: null,
    denominator: null,
    distinct_rounds: null,
    example_holes: [],
    event_strokes: null,
    checked: {
      holes_with_full_record: obs?.holesAttributed ?? 0,
      of: obs?.holesChecked ?? 0,
      fields_missing: (obs?.fieldCoverage ?? [])
        .filter((c) => c.of > 0 && c.have / c.of < DATA_GAP_MIN_COVERAGE)
        .map((c) => c.field),
    },
    alternatives: [],
    data_gap: null,
    coach_override: null,
  };
}

export type RootCauseOutcome =
  | { kind: 'none'; reason: 'strength' | 'neutral' }
  | {
      kind: 'diagnosis';
      diagnosis: Omit<Diagnosis, 'confidence_reason'>;
      cause: InsightCause;
      observation: SequenceObservation | null;
    };

/**
 * Decide the cause state and compose the diagnosis. `ctx === null` means no
 * shot context was loaded: `loadFailed` says the load threw, `noWindow` that
 * the row stamps no window (`scopeForEvidence` returned null); otherwise the
 * metric has no sequence target. The caller runs this only with the
 * `coachhelm_root_cause_diagnosis` flag on.
 */
export function diagnoseRootCause(input: {
  metricId: string;
  framing: InsightFraming;
  evidence: DiagnosisEvidence;
  ctx: RootCauseContext | null;
  loadFailed?: boolean;
  noWindow?: boolean;
}): RootCauseOutcome {
  if (input.framing !== 'leak') return { kind: 'none', reason: input.framing };
  const metric = input.evidence.metric || input.metricId;
  const target = sequenceTargetFor(metric);
  const ctx = input.ctx;
  const obs = target && ctx ? observeSequence(target, ctx.facts, ctx.holes, ctx.scope) : null;
  const narrowing = ctx ? narrowingFor(target, ctx.facts, ctx.holes) : null;
  const windowLabel = ctx?.windowLabel ?? null;

  // 1. Counted. Capped families (`maxState`) never claim it.
  if (obs && obs.observed && obs.top && ctx && target?.maxState === undefined) {
    const top = obs.top;
    return {
      kind: 'diagnosis',
      diagnosis: observedDiagnosis(input.evidence, input.metricId, obs, ctx, narrowing),
      cause: {
        ...emptyCause('observed_sequence', target, obs, windowLabel),
        path: top.pattern.split(' → '),
        occurrences: top.count,
        denominator: obs.failures,
        distinct_rounds: top.rounds,
        example_holes: top.examples,
        event_strokes: obs.meanStrokesPerFailure !== null ? round2(obs.meanStrokesPerFailure) : null,
      },
      observation: obs,
    };
  }

  const hyp = ctx ? relevantHypothesis(target, metric, ctx.facts, ctx.holes, ctx.scope) : null;

  // 2. Likely from totals.
  const alt = likelyFromTotals(narrowing);
  if (alt && narrowing?.slice) {
    const armDrivers: DiagnosisDriver[] = [
      {
        metric: 'cause_arm_a_rate',
        label: alt.label,
        value: Math.round(alt.arm_a.rate * 100),
        unit: 'percent',
        sample_n: alt.arm_a.n,
        source: 'golf_shots · context narrowing',
      },
      {
        metric: 'cause_arm_b_rate',
        label: 'Everywhere else',
        value: Math.round(alt.arm_b.rate * 100),
        unit: 'percent',
        sample_n: alt.arm_b.n,
        source: 'golf_shots · context narrowing',
      },
    ];
    return {
      kind: 'diagnosis',
      diagnosis: hypothesisDiagnosis(
        input.evidence,
        input.metricId,
        likelySentence(narrowing, alt, narrowing.slice.label),
        null,
        armDrivers,
        obs,
        hyp,
        narrowing,
      ),
      cause: { ...emptyCause('inferred_hypothesis', target, obs, windowLabel), alternatives: [alt] },
      observation: obs,
    };
  }

  // 3. Not traced.
  const nt = notTraced(input.evidence, target, obs, {
    loadFailed: input.loadFailed === true,
    noWindow: input.noWindow === true,
  });
  return {
    kind: 'diagnosis',
    diagnosis: hypothesisDiagnosis(input.evidence, input.metricId, nt.sentence, nt.action, [], obs, hyp, narrowing),
    cause: {
      ...emptyCause('not_traced', target, obs, windowLabel),
      data_gap: nt.dataGap,
      not_traced_reason: nt.reason,
      ...(nt.countDown ? { count_down: nt.countDown } : {}),
    },
    observation: obs,
  };
}
