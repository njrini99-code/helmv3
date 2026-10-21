/**
 * CoachHelm v3 insight angles — shared data shapes and pure helpers for the
 * five angles first built on PR #2073 (2026-09-25) and ported to main in
 * CoachHelm Slice 5a (2026-10-20):
 *
 *   1. lie-adjusted approach   (`lie-approach.ts`)
 *   2. Bad-Day Floor (`bad-day-floor.ts`)
 *   3. Three-Putt Autopsy + Second-Putt Exposure (`three-putt-chain.ts`)
 *   4. Miss-Cost Compass + driver vs non-driver chain (`tee-miss-cost.ts`)
 *   5. Approach-miss compass (`approach-miss-compass.ts`)
 *
 * PURE: no Supabase, no `server-only`. `load-angle-data.ts` reads the rows
 * (countable rounds only) and every angle computes from the same
 * {@link AngleData}, so the generators cost one read per player.
 *
 * All five sit behind ONE flag, {@link INSIGHT_ANGLES_FLAG} (default off),
 * checked once at the orchestrator call site (`insightAngleGenerators`).
 *
 * Slice 5a adds the design layer every angle row now carries
 * (`02-accuracy-standard.md` §7, `04-output-specs-and-examples.md` §1.1):
 * the family registry {@link ANGLE_FAMILIES} (sample unit, floors, how the
 * strokes are sized, ladder cap, citations), the read fields
 * ({@link angleReadFields}: `sample_unit`, `rounds_n`, `newest_round_id`,
 * `comparison`) and the test input the Slice 1 support pass rates
 * (`detail.gap_input`, the same shape as `v3/support/gap.ts` GapInput).
 */

import {
  COUNTERFACTUAL_MAX_STROKES_PER_ROUND,
  COUNTERFACTUAL_SUPPRESS_THRESHOLD,
  type CounterfactualProjection,
} from '@/lib/coachhelm/v3/counterfactual/types';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { shotSgForRound, type RawShotRow } from './shot-sg';

/** The one flag the angle generators share (config/feature-flags.yml). */
export const INSIGHT_ANGLES_FLAG = 'coachhelm_insight_angles_v1';

/** Newest countable rounds an angle reads (about one season). */
export const ANGLE_ROUND_LIMIT = 40;

/** Stored per-round strokes gained, RAW (a 9-hole round is a 9-hole total). */
export interface AngleRoundSg {
  total: number | null;
  tee: number | null;
  approach: number | null;
  short_game: number | null;
  putting: number | null;
}

export interface AngleRound {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** 9 or 18 (countable rounds only). */
  holes: number;
  team_id: string | null;
  sg: AngleRoundSg;
}

export interface AngleHole {
  id: string;
  round_id: string;
  hole_number: number;
  par: number;
  score: number | null;
  penalty_strokes: number | null;
  putts: number | null;
  fairway_hit: boolean | null;
  gir: boolean | null;
}

/** One `golf_shots` row: the SG port's shape plus the putt columns. */
export interface AngleShot extends RawShotRow {
  putt_distance_feet: number | null;
  putt_slope: string | null;
}

export interface AngleData {
  playerId: string;
  /** Countable rounds, newest first, at most {@link ANGLE_ROUND_LIMIT}. */
  rounds: AngleRound[];
  holes: AngleHole[];
  shots: AngleShot[];
  /**
   * `sg_scale_for_player`; null when the RPC failed or returned no usable
   * value. Without it per-shot SG is not computed and the SG-based families
   * (lie-adjusted approach, approach-miss compass) say nothing.
   */
  scale: number | null;
  /** Scoring baseline for the counterfactual line (null → projection suppressed). */
  scoringBaseline: number | null;
}

/** One teammate's countable rounds, for the peer benchmarks. */
export interface PeerRound {
  /** `golf_rounds.id` (the same-day field adjustment keys on it, Slice 7b). */
  round_id?: string;
  player_id: string;
  /** `golf_rounds.course_id`; null when the round names no course. */
  course_id?: string | null;
  date: string;
  holes: number;
  sg_total: number | null;
  /** `golf_rounds.score_to_par` (raw; a 9-hole round is a 9-hole total). */
  score_to_par: number | null;
  fairways_hit: number | null;
  fairways_total: number | null;
  /** `golf_round_stats_cache.three_putts` for the round; null when not cached. */
  three_putts: number | null;
}

/** A Tour three-putt figure from `golf_pga_standards` (PGA for men, LPGA for women). */
export interface TourThreePutt {
  /** Three-putts per 18 holes. */
  per_18: number;
  tour: 'pga' | 'lpga';
  season: string;
  /** The row's own source text. */
  source: string;
}

/**
 * Teammates needed before any team benchmark is shown (`07` §6 privacy rule):
 * a median of fewer players can expose one teammate's own number. Below this
 * the row carries no team comparison at all.
 */
export const PEER_MIN_PLAYERS = 5;
/** Newest countable rounds read per teammate (the same window as the player's). */
export const PEER_ROUND_LIMIT = 40;

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/** Yards from a raw distance in the row's unit (`feet` or anything else = yards). */
export function yardsOf(d: number | null | undefined, unit: string | null | undefined): number | null {
  if (d === null || d === undefined || !Number.isFinite(Number(d))) return null;
  return unit === 'feet' ? Number(d) / 3 : Number(d);
}

/** Feet from a raw distance in the row's unit (`yards` → ×3, anything else = feet). */
export function feetOf(d: number | null | undefined, unit: string | null | undefined): number | null {
  if (d === null || d === undefined || !Number.isFinite(Number(d))) return null;
  return unit === 'yards' ? Number(d) * 3 : Number(d);
}

/** Scale a per-round value to per 18 holes. */
export function per18(value: number, holes: number): number {
  return holes > 0 ? (value * 18) / holes : value;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function mean(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Sample variance (n − 1). */
export function variance(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
}

/**
 * One-sided Welch z for "mean(a) > mean(b)". Returns null when either side
 * has fewer than 2 values or both variances are 0.
 */
export function welchZ(a: readonly number[], b: readonly number[]): number | null {
  const va = variance(a);
  const vb = variance(b);
  if (va === null || vb === null) return null;
  const se = Math.sqrt(va / a.length + vb / b.length);
  if (!(se > 0)) return null;
  return (mean(a)! - mean(b)!) / se;
}

/** One-sided 95% (z ≥ 1.645): the significance floor every angle uses. */
export const ANGLE_MIN_Z = 1.645;

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

export interface AngleWindow {
  window_start: string;
  window_end: string;
  /** Inclusive calendar span of the rounds read (≥ 1). */
  window_days: number;
}

export function windowOf(rounds: readonly Pick<AngleRound, 'date'>[]): AngleWindow {
  const dates = rounds.map((r) => r.date).filter(Boolean).sort();
  if (dates.length === 0) return { window_start: '', window_end: '', window_days: 1 };
  const start = dates[0]!;
  const end = dates[dates.length - 1]!;
  const days = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86400_000) + 1);
  return { window_start: start, window_end: end, window_days: days };
}

// ---------------------------------------------------------------------------
// Holes and shots
// ---------------------------------------------------------------------------

export function holeKey(roundId: string, holeNumber: number | null): string {
  return `${roundId}:${holeNumber ?? -1}`;
}

/** Holes keyed by `round:hole_number`, and by id. */
export function indexHoles(holes: readonly AngleHole[]): {
  byKey: Map<string, AngleHole>;
  byId: Map<string, AngleHole>;
} {
  const byKey = new Map<string, AngleHole>();
  const byId = new Map<string, AngleHole>();
  for (const h of holes) {
    byKey.set(holeKey(h.round_id, h.hole_number), h);
    byId.set(h.id, h);
  }
  return { byKey, byId };
}

/** Shots grouped by hole key, each list sorted by shot_number. */
export function shotsByHole(shots: readonly AngleShot[]): Map<string, AngleShot[]> {
  const out = new Map<string, AngleShot[]>();
  for (const s of shots) {
    const k = holeKey(s.round_id, s.hole_number);
    const arr = out.get(k) ?? [];
    arr.push(s);
    out.set(k, arr);
  }
  for (const arr of out.values()) arr.sort((a, b) => a.shot_number - b.shot_number);
  return out;
}

/**
 * Per-shot strokes gained keyed by shot id, from the same port of
 * `calculate_round_strokes_gained` the root map sizes approach bands with
 * (`./shot-sg.ts#shotSgForRound`, ported from PR #2073), with the player's
 * `sg_scale_for_player`.
 */
export function shotSgById(data: Pick<AngleData, 'shots' | 'holes' | 'scale'>): Map<string, number> {
  // No SG scale → no per-shot SG (never computed at a guessed scale of 1).
  if (data.scale === null) return new Map();
  const scale = data.scale;
  const parByHoleId = new Map<string, number>();
  for (const h of data.holes) parByHoleId.set(h.id, h.par);
  const byRound = new Map<string, AngleShot[]>();
  for (const s of data.shots) {
    const arr = byRound.get(s.round_id) ?? [];
    arr.push(s);
    byRound.set(s.round_id, arr);
  }
  const out = new Map<string, number>();
  for (const list of byRound.values()) {
    for (const sg of shotSgForRound(list, parByHoleId, scale)) out.set(sg.shotId, sg.sg);
  }
  return out;
}

/** Holes played across the rounds read (9 or 18 each). */
export function totalHoles(rounds: readonly Pick<AngleRound, 'holes'>[]): number {
  return rounds.reduce((a, r) => a + r.holes, 0);
}

// ---------------------------------------------------------------------------
// Counterfactual sized on the player's own attempts
// ---------------------------------------------------------------------------

/**
 * A counterfactual sized on the player's OWN attempts:
 * `strokes_saved_per_round = strokesPerAttempt × attemptsPerRound`, clamped to
 * the default per-projection ceiling and suppressed below the noise floor —
 * the same discipline as `computeCounterfactual` (which cannot size these
 * angles: their metrics have no standing row and no lookup entry).
 */
export function attemptCounterfactual(input: {
  strokesPerAttempt: number;
  attemptsPerRound: number;
  baseline: number | null;
  weeks: number;
  confidence?: number;
}): CounterfactualProjection {
  const raw = input.strokesPerAttempt * input.attemptsPerRound;
  const attempts = Number.isFinite(input.attemptsPerRound) ? round2(input.attemptsPerRound) : null;
  if (!Number.isFinite(raw) || raw <= 0) {
    return {
      current_baseline_score: input.baseline,
      projected_score_if_closed: null,
      strokes_saved_per_round: 0,
      weeks_to_typical_close: input.weeks,
      suppressed: true,
      suppress_reason: 'no_gap',
      attempts_used: attempts,
    };
  }
  const clamped = raw > COUNTERFACTUAL_MAX_STROKES_PER_ROUND;
  const saved = round2(clamped ? COUNTERFACTUAL_MAX_STROKES_PER_ROUND : raw);
  const band = bandFor(input.confidence);
  if (saved < COUNTERFACTUAL_SUPPRESS_THRESHOLD) {
    return {
      current_baseline_score: input.baseline,
      projected_score_if_closed: null,
      strokes_saved_per_round: saved,
      weeks_to_typical_close: input.weeks,
      suppressed: true,
      suppress_reason: 'below_threshold',
      clamped,
      attempts_used: attempts,
      confidence_band: band,
    };
  }
  if (input.baseline === null) {
    return {
      current_baseline_score: null,
      projected_score_if_closed: null,
      strokes_saved_per_round: saved,
      weeks_to_typical_close: input.weeks,
      suppressed: true,
      suppress_reason: 'no_baseline',
      clamped,
      attempts_used: attempts,
      confidence_band: band,
    };
  }
  return {
    current_baseline_score: input.baseline,
    projected_score_if_closed: round1(input.baseline - saved),
    strokes_saved_per_round: saved,
    weeks_to_typical_close: input.weeks,
    suppressed: false,
    clamped,
    attempts_used: attempts,
    confidence_band: band,
  };
}

function bandFor(confidence: number | undefined): 'low' | 'medium' | 'high' {
  if (confidence == null || !Number.isFinite(confidence)) return 'high';
  if (confidence < 0.4) return 'low';
  if (confidence < 0.7) return 'medium';
  return 'high';
}

/**
 * strokes_impact for a ROUGH-ESTIMATE family: the size of the read
 * (`strokesPerAttempt × attemptsPerRound`, clamped to the projection ceiling),
 * with no counterfactual attached. A rough estimate never carries a live
 * projection (`projected_score_if_closed`), so the Team Brief and the
 * strokes-available roll-up cannot total it as measured (they also skip
 * `estimated: true`).
 */
export function roughEstimateStrokes(strokesPerAttempt: number, attemptsPerRound: number): number {
  const raw = strokesPerAttempt * attemptsPerRound;
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return round2(Math.min(raw, COUNTERFACTUAL_MAX_STROKES_PER_ROUND));
}

/** strokes_impact for the row: the projection's strokes when it renders. */
export function impactOf(cf: CounterfactualProjection): number {
  return cf.suppressed && cf.suppress_reason !== 'no_baseline' ? 0 : cf.strokes_saved_per_round;
}

/** The team the player's rounds were most often logged under, or null. */
export function primaryTeamId(rounds: readonly Pick<AngleRound, 'team_id'>[]): string | null {
  const counts = new Map<string, number>();
  for (const r of rounds) if (r.team_id) counts.set(r.team_id, (counts.get(r.team_id) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [id, n] of counts) {
    if (n > bestN) {
      best = id;
      bestN = n;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Receipts (owner contract 2026-09-25)
// ---------------------------------------------------------------------------

/** Most example holes a row carries in `detail.receipts.examples`. */
export const RECEIPT_MAX_EXAMPLES = 5;

export interface ReceiptExample {
  round_id: string;
  hole_number: number;
  /** `golf_holes.id` when the hole row is known. */
  hole_id: string | null;
  /** Round date, YYYY-MM-DD. */
  date: string;
  /** One descriptive line — what was recorded on that hole. */
  note: string;
}

/**
 * The receipts every angle row carries in `evidence.detail.receipts`: date
 * window, metric definition, sample counts (denominators), exclusions (what
 * was left out and why — missing is never counted as zero), and up to
 * {@link RECEIPT_MAX_EXAMPLES} example holes by round/hole id.
 */
export interface AngleReceipts {
  window: AngleWindow;
  definition: string;
  samples: Record<string, number>;
  exclusions: Record<string, number>;
  examples: ReceiptExample[];
}

/** Newest-first, de-duplicated, capped example list. */
export function pickExamples(
  candidates: readonly ReceiptExample[],
  max: number = RECEIPT_MAX_EXAMPLES,
): ReceiptExample[] {
  const seen = new Set<string>();
  const out: ReceiptExample[] = [];
  for (const c of [...candidates].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.hole_number - b.hole_number))) {
    const k = holeKey(c.round_id, c.hole_number);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/** Linear-interpolated percentile (p in 0..1). Null on an empty list. */
export function percentile(xs: readonly number[], p: number): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const idx = (s.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo]! + (s[hi]! - s[lo]!) * (idx - lo);
}

/** "12.5% (n=16)" or "n/a (n=0)" — never renders a missing rate as 0. */
export function pctText(pct: number | null, n: number): string {
  return pct === null ? `n/a (n=${n})` : `${pct}% (n=${n})`;
}

// ---------------------------------------------------------------------------
// Slice 5a design layer (02 §7, 04 §1.1)
// ---------------------------------------------------------------------------

/** What `sample_n` counts (the Slice 0b vocabulary, `04` §1.1). */
export type AngleSampleUnit = 'putts' | 'approaches' | 'tee_shots' | 'shots' | 'rounds' | 'holes' | 'opportunities';

/**
 * How a family's `strokes_impact` is sized. `sg_baseline` and `peer_delta`
 * are measured on the player's own record against a stated benchmark;
 * `rough_estimate` rests on an assumption the record cannot check (the holes
 * differ, or a Tour penalty stands in for the player's own) and must never
 * print as a measured saving.
 */
export type AngleImpactKind = 'sg_baseline' | 'peer_delta' | 'rough_estimate';

/** Benchmark line sources (`04` §1.1 `ComparisonLine.source`). */
export type ComparisonLineSource =
  | 'team_pool'
  | 'program_pool'
  | 'level_anchor'
  | 'tour'
  | 'self_best'
  | 'self_prior'
  | 'self_other';

export interface ComparisonLine {
  source: ComparisonLineSource;
  label: string;
  value: number;
  /** Observations behind the benchmark value (players, holes, misses); null when not counted. */
  n: number | null;
  citation?: string;
}

/** Highest claim-ladder rung a family can reach (`02` §6). */
export type AngleLadderCap = 'seen_repeatedly' | 'observed' | 'likely' | 'working_hypothesis';

export type AngleFamilyId =
  | 'three_putt_chain'
  | 'bad_day_floor'
  | 'lie_rough_execution'
  | 'lie_fairway_exposure'
  | 'tee_miss_cost'
  | 'approach_miss_compass';

export interface AngleFamily {
  family: AngleFamilyId;
  /** `evidence.metric` the row carries. */
  metric: string;
  /** `golf_coach_insights.insight_type` the generator writes. */
  insight_type: string;
  sample_unit: AngleSampleUnit;
  /** Floor for saying anything, in `sample_unit` (for a two-sided contrast: both sides together). */
  floor: number;
  /** Per-side floor for a within-player contrast; null for a single estimate. */
  per_side_floor: number | null;
  /** Countable rounds the window must hold (never below 3, `02` §2). */
  round_floor: number;
  /** The `detail.gap_input` shape the Slice 1 support pass reads. */
  gap_kind: 'proportion' | 'mean';
  impact: AngleImpactKind;
  /** The preferred comparison source. */
  benchmark: ComparisonLineSource;
  /** Sources used, in order, when the preferred one is not available. */
  benchmark_fallbacks?: readonly ComparisonLineSource[];
  cap: AngleLadderCap;
  /** Shrinkage κ default (`02` §4) and its unit. */
  kappa: { value: number; unit: AngleSampleUnit };
  /** Where the comparison or causal wording traces (`docs/v3-research-golf-domain.md` or `05-sources.md`). */
  citations: readonly string[];
}

const RESEARCH_DOC = 'docs/v3-research-golf-domain.md';
const SG_CITATION = `${RESEARCH_DOC} §Strokes Gained (Broadie, Every Shot Counts): expected strokes by lie and distance`;

/**
 * The six angle families (five generators; the lie-adjusted approach writes
 * one of two causes). Numbers from `02` §7 ("PR #2073 modules" row) and the
 * thresholds table in `04` §2. The Slice 1 support registry
 * (`v3/support/families.ts`) needs one entry per row here; the PR body lists
 * them.
 */
export const ANGLE_FAMILIES: Readonly<Record<AngleFamilyId, AngleFamily>> = {
  three_putt_chain: {
    family: 'three_putt_chain',
    // Its own id: `three_putt_chain` is composite C6's percent metric
    // (`composite/rules/lag-distance-3putt.ts`).
    metric: 'three_putts_per_18',
    insight_type: 'putting',
    sample_unit: 'holes',
    floor: 90,
    per_side_floor: null,
    round_floor: 5,
    gap_kind: 'proportion',
    impact: 'peer_delta',
    // Q-88: the Tour is the only external benchmark. A Tour three-putt figure
    // (golf_pga_standards) when one exists, else the teammates' median at
    // PEER_MIN_PLAYERS or more, else no comparison and no read.
    benchmark: 'tour',
    benchmark_fallbacks: ['team_pool'],
    // Replaces composite C6 (estimated 3-putt rate) later; counted, so Observed.
    cap: 'observed',
    // κ in the gap input's own unit (holes): about 5 rounds of putted holes.
    kappa: { value: 90, unit: 'holes' },
    citations: [
      `${RESEARCH_DOC} §Putting: 3-putts are dominated by speed control; second-putt distance is the proxy`,
      `${RESEARCH_DOC} causal claims allowed: lag distance drives 3-putt rate`,
    ],
  },
  bad_day_floor: {
    family: 'bad_day_floor',
    metric: 'round_bad_day_floor',
    insight_type: 'scoring',
    sample_unit: 'rounds',
    floor: 10,
    per_side_floor: null,
    round_floor: 10,
    gap_kind: 'mean',
    // Sized as extra gap × 0.2 (a P80 round is one round in five): an
    // assumption about how often bad rounds come, not a measured saving.
    impact: 'rough_estimate',
    benchmark: 'team_pool',
    // 02 §7: the P80 of 40 rounds has SE ≈ 0.7 strokes; the weakest angle.
    cap: 'likely',
    kappa: { value: 8, unit: 'rounds' },
    citations: [`${RESEARCH_DOC} causal claims allowed: penalty rate drives big-number rate`],
  },
  lie_rough_execution: {
    family: 'lie_rough_execution',
    metric: 'approach_rough_lie_penalty',
    insight_type: 'approach',
    sample_unit: 'approaches',
    floor: 20,
    per_side_floor: 8,
    round_floor: 5,
    gap_kind: 'mean',
    impact: 'sg_baseline',
    benchmark: 'tour',
    cap: 'observed',
    kappa: { value: 20, unit: 'shots' },
    citations: [SG_CITATION, `${RESEARCH_DOC} §Lie quality premium (fairway vs rough GIR)`],
  },
  lie_fairway_exposure: {
    family: 'lie_fairway_exposure',
    metric: 'tee_fairway_rough_exposure',
    insight_type: 'tee',
    sample_unit: 'holes',
    floor: 40,
    per_side_floor: null,
    round_floor: 5,
    gap_kind: 'proportion',
    // The cost assumes a missed fairway is a rough lie at the Tour penalty.
    impact: 'rough_estimate',
    benchmark: 'team_pool',
    cap: 'likely',
    kappa: { value: 30, unit: 'holes' },
    citations: [SG_CITATION, `${RESEARCH_DOC} §Lie quality premium (fairway vs rough GIR)`],
  },
  tee_miss_cost: {
    family: 'tee_miss_cost',
    metric: 'tee_miss_next_shot_cost',
    insight_type: 'tee',
    sample_unit: 'tee_shots',
    floor: 24,
    per_side_floor: 12,
    round_floor: 5,
    gap_kind: 'mean',
    // Hole scores after a miss vs the player's own fairway holes: the holes
    // differ (the player picks the club and the line), so the saving is a
    // rough estimate, never a measured one.
    impact: 'rough_estimate',
    benchmark: 'self_other',
    cap: 'likely',
    kappa: { value: 20, unit: 'shots' },
    citations: [`${RESEARCH_DOC} §Tee strategy: distance gain matters only if it does not raise penalty/recovery rate`],
  },
  approach_miss_compass: {
    family: 'approach_miss_compass',
    metric: 'approach_miss_recovery_cost',
    insight_type: 'short_game',
    sample_unit: 'approaches',
    floor: 24,
    per_side_floor: 12,
    round_floor: 5,
    gap_kind: 'mean',
    impact: 'sg_baseline',
    benchmark: 'self_other',
    cap: 'observed',
    kappa: { value: 20, unit: 'shots' },
    citations: [SG_CITATION],
  },
};

/** Window rule every angle reads (`02` §4: newest 40 countable rounds). */
export const ANGLE_WINDOW_RULE = `newest_${ANGLE_ROUND_LIMIT}_countable_rounds`;

/**
 * The `04` §1.1 read fields an angle row carries next to `InsightEvidence`.
 * Field names match Slice 0b (`sample_unit`, `rounds_n`, `newest_round_id`)
 * and the `comparison` object, so the renderer and the support pass read one
 * contract whichever lands first.
 */
export interface AngleReadFields {
  sample_unit: AngleSampleUnit;
  rounds_n: number;
  newest_round_id?: string;
  /** The rounds counted (newest first); the base keeps it, so it matches `rounds_n`. */
  source_round_ids: string[];
  comparison: { primary: ComparisonLine; lines: ComparisonLine[] };
}

/** Round ids newest first (by date, then id), whatever order the caller holds them in. */
export function newestFirstIds(rounds: readonly { id: string; date: string }[]): string[] {
  return [...rounds]
    .sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1))
    .map((r) => r.id);
}

/**
 * The evidence an angle row writes: the base contract plus the read fields.
 * A measured family carries its projection; a rough estimate carries none.
 */
export type AngleEvidence = InsightEvidence & AngleReadFields & { counterfactual?: CounterfactualProjection };

/** The read fields for a family, from the rounds actually read (newest first). */
export function angleReadFields(
  family: AngleFamilyId,
  roundIds: readonly string[],
  primary: ComparisonLine,
  extraLines: readonly ComparisonLine[] = [],
): AngleReadFields {
  const def = ANGLE_FAMILIES[family];
  return {
    sample_unit: def.sample_unit,
    rounds_n: roundIds.length,
    ...(roundIds[0] ? { newest_round_id: roundIds[0] } : {}),
    source_round_ids: [...roundIds],
    comparison: { primary, lines: [primary, ...extraLines] },
  };
}

/** One-sided upper tail of the standard normal (Abramowitz–Stegun 7.1.26 erfc). */
export function normalSf(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 0 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erfc = poly * Math.exp(-x * x);
  return z >= 0 ? erfc / 2 : 1 - erfc / 2;
}

/**
 * The test input the Slice 1 support pass rates (`v3/support/gap.ts`
 * GapInput, same field names): a proportion against a fixed benchmark rate,
 * or a mean with its standard error against a benchmark value. `df` is
 * always finite so it survives JSON.
 */
export type AngleGapInput =
  | { kind: 'proportion'; k: number; n: number; benchmark: number; polarity: 'higher_better' | 'lower_better' }
  | { kind: 'mean'; value: number; se: number; df: number; benchmark: number; polarity: 'higher_better' | 'lower_better' };

/** The family's own gate statistic, kept beside the gap input for the audit view. */
export interface AngleTest {
  statistic: 'z';
  z: number | null;
  p_one_sided: number | null;
  /** The family's own pass line (one-sided 95%). The per-run BH q is Slice 1's. */
  min_z: number;
}

export function angleTest(z: number | null): AngleTest {
  return { statistic: 'z', z, p_one_sided: z === null ? null : round4(normalSf(z)), min_z: ANGLE_MIN_Z };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Welch standard error of mean(a) − mean(b); null when either side has < 2 values. */
export function welchSe(a: readonly number[], b: readonly number[]): number | null {
  const va = variance(a);
  const vb = variance(b);
  if (va === null || vb === null) return null;
  const se = Math.sqrt(va / a.length + vb / b.length);
  return se > 0 ? se : null;
}

/** Welch–Satterthwaite degrees of freedom, floored to ≥ 1; null when undefined. */
export function welchDf(a: readonly number[], b: readonly number[]): number | null {
  const va = variance(a);
  const vb = variance(b);
  if (va === null || vb === null) return null;
  const qa = va / a.length;
  const qb = vb / b.length;
  const den = (qa * qa) / (a.length - 1) + (qb * qb) / (b.length - 1);
  if (!(den > 0)) return null;
  return Math.max(1, Math.floor((qa + qb) ** 2 / den));
}

/**
 * Standard error of `P80 − median` by a deterministic bootstrap (seeded, so a
 * rerun on the same rounds gives the same number; pure). Null below 3 values.
 */
export function floorGapBootstrapSe(values: readonly number[], resamples = 400): number | null {
  if (values.length < 3) return null;
  let seed = 0x9e3779b9 ^ values.length;
  const rand = (): number => {
    // mulberry32
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gaps: number[] = [];
  const draw = new Array<number>(values.length);
  for (let b = 0; b < resamples; b++) {
    for (let i = 0; i < values.length; i++) draw[i] = values[Math.floor(rand() * values.length)]!;
    gaps.push(percentile(draw, 0.8)! - median(draw)!);
  }
  const v = variance(gaps);
  return v === null ? null : Math.sqrt(v);
}

/**
 * A counted shot/putt path behind a read (the WHY that Slice 2 can lift to
 * `observed_sequence`). Kept in `detail.sequence` as data; on main the row's
 * cause stays an inferred hypothesis until the root-cause slice lands.
 */
export interface AngleSequence {
  pattern: string;
  occurrences: number;
  of: number;
  population: string;
  distinct_rounds: number;
  window: string;
  examples: { round_id: string; hole_number: number; hole_id: string | null }[];
  /** True when the path clears the `02` §6 Observed floors (see {@link meetsObservedFloors}). */
  meets_observed_floors: boolean;
}

/** `02` §6 Observed WHY floors: ≥ 10 events over ≥ 3 rounds; leading path ≥ 4 occurrences and ≥ 30% share. */
export const OBSERVED_MIN_EVENTS = 10;
export const OBSERVED_MIN_ROUNDS = 3;
export const OBSERVED_MIN_OCCURRENCES = 4;
export const OBSERVED_MIN_SHARE = 0.3;

export function meetsObservedFloors(s: Pick<AngleSequence, 'occurrences' | 'of' | 'distinct_rounds'>): boolean {
  return (
    s.of >= OBSERVED_MIN_EVENTS &&
    s.distinct_rounds >= OBSERVED_MIN_ROUNDS &&
    s.occurrences >= OBSERVED_MIN_OCCURRENCES &&
    s.occurrences / s.of >= OBSERVED_MIN_SHARE
  );
}

/** The family stamp every angle row carries in `detail`. */
export function familyDetail(family: AngleFamilyId): {
  family: AngleFamilyId;
  ladder_cap: AngleLadderCap;
  impact_kind: AngleImpactKind;
  window_rule: string;
  citations: readonly string[];
} {
  const def = ANGLE_FAMILIES[family];
  return {
    family,
    ladder_cap: def.cap,
    impact_kind: def.impact,
    window_rule: ANGLE_WINDOW_RULE,
    citations: def.citations,
  };
}
