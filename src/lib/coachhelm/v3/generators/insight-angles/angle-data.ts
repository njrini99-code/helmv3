/**
 * CoachHelm v3 insight angles (2026-09-25) — shared data shapes and pure
 * helpers for the four owner-picked angles:
 *
 *   1. lie-adjusted approach   (`lie-approach.ts`)
 *   2. Bad-Day Floor (`bad-day-floor.ts`)
 *   3. Three-Putt Autopsy + Second-Putt Exposure (`three-putt-chain.ts`)
 *   4. Miss-Cost Compass + driver vs non-driver chain (`tee-miss-cost.ts`)
 *
 * PURE: no Supabase, no `server-only`. `load-angle-data.ts` reads the rows
 * (countable rounds only) and every angle computes from the same
 * {@link AngleData}, so the four generators cost one read per player.
 *
 * All four sit behind ONE flag, {@link INSIGHT_ANGLES_FLAG} (default off).
 */

import {
  COUNTERFACTUAL_MAX_STROKES_PER_ROUND,
  COUNTERFACTUAL_SUPPRESS_THRESHOLD,
  type CounterfactualProjection,
} from '@/lib/coachhelm/v3/counterfactual/types';
import { shotSgForRound, type RawShotRow } from '@/lib/coachhelm/root-map/approach-context';

/** The one flag the four angle generators share (config/feature-flags.yml). */
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
  /** `sg_scale_for_player` (1 when unreadable). */
  scale: number;
  /** Scoring baseline for the counterfactual line (null → projection suppressed). */
  scoringBaseline: number | null;
}

/** One teammate's countable rounds, for the peer benchmarks. */
export interface PeerRound {
  player_id: string;
  date: string;
  holes: number;
  sg_total: number | null;
  /** `golf_rounds.score_to_par` (raw; a 9-hole round is a 9-hole total). */
  score_to_par: number | null;
  fairways_hit: number | null;
  fairways_total: number | null;
}

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
 * (`root-map/approach-context.ts#shotSgForRound`), with the player's
 * `sg_scale_for_player`.
 */
export function shotSgById(data: Pick<AngleData, 'shots' | 'holes' | 'scale'>): Map<string, number> {
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
    for (const sg of shotSgForRound(list, parByHoleId, data.scale)) out.set(sg.shotId, sg.sg);
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
