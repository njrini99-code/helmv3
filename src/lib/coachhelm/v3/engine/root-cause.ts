/**
 * Root-cause diagnosis — pure core (no DB, no clock).
 *
 * Replaces the templated "{metric} is off its benchmark — likely cause
 * inferred from the aggregate" diagnosis every v3 single-metric insight used
 * to carry (production 2026-09-24: 877 of 877 v3 rows) with one of three
 * honest outcomes, decided per insight by `diagnoseRootCause`:
 *
 *   1. NOT A LEAK → no diagnosis at all. A strength ("Driver is performing")
 *      or a neutral/at-benchmark reading has no problem to find a cause for,
 *      so `generator-base.ts` omits `evidence.diagnosis` entirely (the update
 *      path in `v2/insights/upsert.ts` REPLACES `evidence`, so a refresh
 *      clears a stale templated diagnosis too).
 *
 *   2. OBSERVED SEQUENCE (`causality_level: 'observed_sequence'`). When the
 *      player's recorded shots contain the metric's failure often enough, the
 *      most common shot-by-shot path that followed it is stated as a count
 *      over a named denominator — e.g. "approach missed short into the rough
 *      → chip to 10–20 ft → 2 putts — 7 of 12 missed greens from 125–175 yd".
 *      Built on the A1 hole sequence (`buildHoleSequence`), the A4 per-hole
 *      attribution (`attributeSequence`, for the strokes each occurrence lost
 *      against the canonical SG baseline) and the A4 rollup
 *      (`computeSequenceAttribution`, whose per-kind `status` must be
 *      `'supported'` — the A6 slice-2 rule: a single event never founds a
 *      finding without its kind's population clearing the floor). It is a
 *      TEMPORAL fact ("preceded by" in DiagnosisPanel), never a causal claim.
 *
 *   3. HYPOTHESIS (`causality_level: 'inferred_hypothesis'`). Otherwise the
 *      diagnosis says what was actually checked and why it did not qualify
 *      (coverage, the quoted population against its floor, the top path's
 *      share), plus the A5 controlled-hypothesis result where a family
 *      applies (`buildHypotheses`: `par5_opportunity_loss` for par-5
 *      scoring, the approach families for green-hit bands) with its
 *      `no_data` / `candidate` / `corroborated` label. Never the bare
 *      "off its benchmark" template.
 *
 * FLOORS (all must hold for branch 2): the event kind's rollup row (or, for
 * hole-level families, `sequence_hole_coverage`) is `'supported'`; the
 * quoted failing population has >= SEQUENCE_MIN_EVENTS (10) occurrences
 * across >= SEQUENCE_MIN_ROUNDS (3) rounds (the #2008 MUST-1 lesson: gate the
 * population you quote, not a proxy); and the top path repeats
 * >= MIN_PATTERN_OCCURRENCES (3) times AND covers >= MIN_PATTERN_SHARE (25%)
 * of that population. Loosening any of these to "get a result" is exactly
 * the overclaiming this module exists to stop.
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
import { getMetricRenderConfig } from '../standing/metric-config';
import type {
  Diagnosis,
  DiagnosisBasis,
  DiagnosisDriver,
  DiagnosisHypothesisLabel,
  InsightEvidence,
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
}

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
 *  the putt buckets so a repeated path actually repeats. */
function recoveryLeave(feet: number | null): string {
  if (feet === null) return 'an unrecorded distance';
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

/** Coarse on-green leave bucket so repeated paths actually repeat. */
function leaveBucket(feet: number | null): string {
  if (feet === null) return 'an unrecorded distance';
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

/** "chip to 10–20 ft" / "chip stayed in the rough". */
function recoveryStep(s: ShotFact): string {
  const label = shotStepLabel(s);
  if (isHoled(s)) return `${label} holed`;
  if (onGreen(s)) return `${label} to ${recoveryLeave(s.distance_to_hole_after_feet)}`;
  return `${label} stayed off the green`;
}

function eventFor(events: readonly SequenceEvent[], shotNumber: number | null): SequenceEvent | undefined {
  if (shotNumber === null) return undefined;
  return events.find((e) => e.shotNumbers.includes(shotNumber));
}

function costlyPath(events: readonly SequenceEvent[]): string {
  const labels: string[] = [];
  for (const e of events) {
    const costly = e.kind === 'penalty' || (e.measuredContribution !== null && e.measuredContribution <= -COSTLY_EVENT_STROKES);
    if (!costly) continue;
    const label = EVENT_LABEL[e.kind];
    if (labels[labels.length - 1] !== label) labels.push(label);
  }
  return labels.length ? labels.join(' → ') : 'no single costly shot (strokes spread across the hole)';
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
      out.push({ ...base, failed, pattern, strokes });
      return out;
    }
    case 'approach': {
      for (let i = 0; i < shots.length; i++) {
        const s = shots[i]!;
        if (s.is_penalty || s.shot_type !== 'approach' || s.intent === 'layup') continue;
        if (bandOf(s) !== target.band) continue;
        const failed = !onGreen(s);
        const ev = eventFor(events, s.shot_number);
        let pattern: string | null = null;
        if (failed) {
          const steps = [`approach missed${fmtDir(s.miss_direction)}`];
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
          if (!steps[steps.length - 1]!.endsWith('holed')) steps.push(puttsText(putts));
          pattern = steps.join(' → ');
        }
        out.push({ ...base, failed, pattern, strokes: ev?.measuredContribution ?? null });
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
        pattern =
          `first putt missed${fmtDir(first.miss_direction)}, leaving ${leaveBucket(first.distance_to_hole_after_feet)}` +
          ` → ${more === 1 ? 'holed the next putt' : `${more} more putts`}`;
      }
      out.push({ ...base, failed, pattern, strokes: ev?.measuredContribution ?? null });
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
          const steps = [recoveryStep(s)];
          let j = i + 1;
          while (j < shots.length && shots[j]!.shot_type !== 'putting') {
            steps.push(shots[j]!.is_penalty ? 'penalty stroke' : recoveryStep(shots[j]!));
            j += 1;
          }
          steps.push(puttsText(shots.slice(j).filter((x) => x.shot_type === 'putting').length));
          pattern = steps.join(' → ');
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

export const MIN_PATTERN_OCCURRENCES = 3;
export const MIN_PATTERN_SHARE = 0.25;

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

function qualifies(count: number, of: number): boolean {
  return count >= MIN_PATTERN_OCCURRENCES && count / Math.max(1, of) >= MIN_PATTERN_SHARE;
}

/**
 * The most specific repeated path. Full paths fragment (the putts at the end
 * vary), so every prefix of at least `minSteps` steps is counted too — each
 * occurrence counts once per prefix — and the LONGEST prefix that clears
 * the repeat floors wins (then higher count, more rounds, lexical, so the
 * result is deterministic). When nothing qualifies, the most common full
 * path is returned so the shortfall text can name it.
 */
export function topPath(
  failed: readonly Occurrence[],
  minSteps: number,
): { pattern: string; count: number; rounds: number } | null {
  const counts = new Map<string, { count: number; rounds: Set<string>; steps: number; full: number }>();
  for (const o of failed) {
    if (!o.pattern) continue;
    const tokens = o.pattern.split(' → ');
    const seen = new Set<string>();
    for (let k = Math.min(minSteps, tokens.length); k <= tokens.length; k++) {
      const prefix = tokens.slice(0, k).join(' → ');
      if (seen.has(prefix)) continue;
      seen.add(prefix);
      const c = counts.get(prefix) ?? { count: 0, rounds: new Set<string>(), steps: k, full: 0 };
      c.count += 1;
      c.rounds.add(o.round_id);
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
    .filter(([, c]) => c.steps >= minSteps && qualifies(c.count, failed.length))
    .sort((a, b) => b[1].steps - a[1].steps || byStrength(a, b));
  const pick = qualifying[0] ?? entries.filter(([, c]) => c.full > 0).sort(byStrength)[0];
  return pick ? { pattern: pick[0], count: pick[1].count, rounds: pick[1].rounds.size } : null;
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
  top: { pattern: string; count: number; rounds: number } | null;
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
  if (!top || !qualifies(top.count, failed.length)) {
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

/** Pure + exported: the load scope for an insight's evidence window (see
 *  `root-cause-context.ts`'s module doc for the three cases). */
export function scopeForEvidence(
  playerId: string,
  evidence: Pick<InsightEvidence, 'window_start' | 'window_end' | 'window_days'>,
  now: Date = new Date(),
): { scope: AnalysisScope; label: string } {
  const endStr = isDate(evidence.window_end) ? evidence.window_end.slice(0, 10) : dateOnly(now);
  let startStr: string;
  if (isDate(evidence.window_start)) {
    startStr = evidence.window_start.slice(0, 10);
  } else if (Number.isFinite(evidence.window_days) && evidence.window_days > 0) {
    const end = new Date(`${endStr}T00:00:00Z`);
    startStr = dateOnly(new Date(end.getTime() - evidence.window_days * 86400_000));
  } else {
    const d = new Date(`${endStr}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    startStr = dateOnly(d);
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
    case 'putt':
      return /inside 3 ft/.test(pattern)
        ? `Misses already finish inside 3 ft, so spend the putting block on start line from ${target.universeLabel.replace('first putts from ', '')}`
        : `Work on pace from ${target.universeLabel.replace('first putts from ', '')}: the misses leave the next putt outside 3 ft`;
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

function observedDiagnosis(
  evidence: DiagnosisEvidence,
  metricId: string,
  obs: SequenceObservation,
  ctx: RootCauseContext,
): Omit<Diagnosis, 'confidence_reason'> {
  const top = obs.top!;
  const lost =
    obs.meanStrokesPerFailure !== null && obs.meanStrokesPerFailure < 0
      ? `; each cost about ${Math.abs(round1(obs.meanStrokesPerFailure)).toFixed(1)} strokes vs the strokes-gained baseline (n=${obs.strokesSampleN})`
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
    {
      metric: 'sequence_failure_count',
      label: `${obs.target.populationLabel[0]!.toUpperCase()}${obs.target.populationLabel.slice(1)} (of ${obs.universe} ${obs.target.universeLabel})`,
      value: obs.failures,
      unit: 'count',
      sample_n: obs.universe,
      source: 'golf_shots · complete hole sequences (A1/A4)',
    },
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
      `across ${rounds(top.rounds)} (${ctx.windowLabel})${lost}`,
    causality_level: 'observed_sequence',
    drivers,
    recommended_action: observedAction(obs.target, top.pattern),
    basis: {
      kind: 'shot_sequence',
      checked: checkedLines(obs, null),
      sequence: {
        pattern: top.pattern,
        occurrences: top.count,
        of: obs.failures,
        population: obs.target.populationLabel,
        distinct_rounds: top.rounds,
        window: ctx.windowLabel,
      },
    },
  };
}

function checkedLines(obs: SequenceObservation | null, hyp: Hypothesis | null): string[] {
  const lines: string[] = [];
  if (obs) {
    lines.push(`${obs.holesAttributed} of ${obs.holesChecked} holes have complete shot records`);
    lines.push(`${obs.failures} ${obs.target.populationLabel} of ${obs.universe} ${obs.target.universeLabel}, ${rounds(obs.failureRounds)}`);
  }
  if (hyp) {
    lines.push(`A5 ${hyp.family}: ${hypothesisLabel(hyp.state)}${hyp.missingInputs.length ? ` (missing: ${hyp.missingInputs.join(', ')})` : ''}`);
  }
  return lines;
}

function hypothesisDiagnosis(
  evidence: DiagnosisEvidence,
  metricId: string,
  obs: SequenceObservation | null,
  hyp: Hypothesis | null,
  ctx: RootCauseContext | null,
  loadFailed: boolean,
): Omit<Diagnosis, 'confidence_reason'> {
  const parts: string[] = [];
  if (loadFailed) {
    parts.push('Not traced to shot sequences: the shot records could not be read for this run');
  } else if (!obs) {
    parts.push(`Not traceable to a shot sequence: no recorded shot path measures ${evidence.metric_label.toLowerCase()}`);
  } else {
    parts.push(
      `Not yet traced to a repeated shot sequence (${ctx?.windowLabel ?? 'window'}): ${obs.shortfalls.join('; ')}`,
    );
  }
  let label: DiagnosisHypothesisLabel = 'no_data';
  if (hyp) {
    label = hypothesisLabel(hyp.state);
    parts.push(
      `Working hypothesis (${label === 'corroborated' ? 'corroborated association' : label === 'candidate' ? 'candidate, uncorroborated' : 'no data yet'}): ${hyp.description.replace(/\.+$/, '')}`,
    );
  }
  const drivers: DiagnosisDriver[] = [metricDriver(evidence, metricId)];
  if (obs && obs.universe > 0) {
    drivers.push({
      metric: 'sequence_failure_count',
      label: `${obs.target.populationLabel[0]!.toUpperCase()}${obs.target.populationLabel.slice(1)} (of ${obs.universe} ${obs.target.universeLabel})`,
      value: obs.failures,
      unit: 'count',
      sample_n: obs.universe,
      source: 'golf_shots · complete hole sequences (A1/A4)',
    });
  }
  const action = obs
    ? `Keep logging full shot detail on ${obs.target.universeLabel} so the next run can trace where the strokes go; meanwhile target ${evidence.metric_label.toLowerCase()} in practice`
    : `Target ${evidence.metric_label.toLowerCase()} in the next practice block`;
  const basis: DiagnosisBasis = {
    kind: hyp ? 'hypothesis_policy' : 'aggregate_only',
    hypothesis_label: label,
    checked: checkedLines(obs, hyp),
  };
  return {
    symptom: symptomOf(evidence),
    root_cause: `${parts.join('. ')}.`,
    causality_level: 'inferred_hypothesis',
    drivers,
    recommended_action: action,
    basis,
  };
}

export type RootCauseOutcome =
  | { kind: 'none'; reason: 'strength' | 'neutral' }
  | { kind: 'diagnosis'; diagnosis: Omit<Diagnosis, 'confidence_reason'>; observation: SequenceObservation | null };

/**
 * Decide and compose the diagnosis. `ctx === null` means the shot context
 * was not loaded (no sequence target for this metric) or `loadFailed` says
 * the load threw — either way the hypothesis branch states that plainly.
 * `observedEnabled` routes the observed branch through one predicate (the
 * A10 capability gate), so turning it off falls back to the honest
 * hypothesis with the same checks listed.
 */
export function diagnoseRootCause(input: {
  metricId: string;
  framing: InsightFraming;
  evidence: DiagnosisEvidence;
  ctx: RootCauseContext | null;
  loadFailed?: boolean;
  observedEnabled?: boolean;
}): RootCauseOutcome {
  if (input.framing !== 'leak') return { kind: 'none', reason: input.framing };
  const metric = input.evidence.metric || input.metricId;
  const target = sequenceTargetFor(metric);
  const obs = target && input.ctx ? observeSequence(target, input.ctx.facts, input.ctx.holes, input.ctx.scope) : null;
  if (obs && obs.observed && input.observedEnabled !== false && input.ctx) {
    return { kind: 'diagnosis', diagnosis: observedDiagnosis(input.evidence, input.metricId, obs, input.ctx), observation: obs };
  }
  const hyp = input.ctx ? relevantHypothesis(target, metric, input.ctx.facts, input.ctx.holes, input.ctx.scope) : null;
  return {
    kind: 'diagnosis',
    diagnosis: hypothesisDiagnosis(input.evidence, input.metricId, obs, hyp, input.ctx, input.loadFailed === true),
    observation: obs,
  };
}
