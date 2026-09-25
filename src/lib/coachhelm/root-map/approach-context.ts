/**
 * ============================================================================
 * Root map: approach context (distance-band sizing + the Why view's
 * length / par / shape evidence)
 * ----------------------------------------------------------------------------
 * PURE: no Supabase, no React. `loaders.ts#loadApproachContext` hands in the
 * player's recent countable rounds, their holes and every recorded shot; this
 * module turns them into:
 *
 *  1. BAND SIZING. Approach strokes gained split by distance band, per round,
 *     against the same baseline the stored `golf_rounds.strokes_gained_approach`
 *     is written with. {@link shotSgForRound} is a line-for-line port of the
 *     DB function `calculate_round_strokes_gained(uuid)` (category rules, the
 *     LEAD() fallback for a missing finish, lie normalisation, penalty = -1),
 *     with expected strokes from `getExpectedStrokes` (kept in sync with
 *     `public.sg_expected_strokes()`). Summed over bands it IS the round's
 *     approach SG, so the widths are a decomposition of a stored number, not a
 *     new estimate. That is checked, not assumed: {@link sizeApproachBands}
 *     compares the recomputed total with the stored per-round values over the
 *     same rounds and marks the sizing unreconciled (so the map keeps the
 *     branches unsized) when they differ by more than
 *     {@link BAND_SG_RECONCILE_TOLERANCE} a round. Calibrated 2026-09-25 on
 *     three players (18–27 rounds each): recomputed and stored agree to the
 *     second decimal (e.g. -1.83 vs -1.83, -2.52 vs -2.52, -0.91 vs -0.91).
 *
 *  2. WHY VIEW EVIDENCE per band: the context narrowing
 *     (`v3/engine/context-narrowing.ts`), a par × length grid, the miss
 *     compass (short/long × left/right, coverage stated) and the band
 *     metrics from A2's distance profile — each shown only when its gate
 *     passes.
 *
 * Server-built, plain JSON out. Client components import TYPES only.
 * ========================================================================== */

import { getExpectedStrokes } from '@/lib/utils/golf-stats-calculator-shots';
import type { HoleContext, ShotFact } from '@/lib/coachhelm/v3/context/types';
import {
  NARROW_BANDS,
  NARROW_BAND_LABEL,
  SHAPE_MIN_COVERAGE,
  SHAPE_MIN_COVERED,
  collectBandAttempts,
  evaluateShape,
  narrowApproach,
  sliceId,
  sliceLabel,
  type MissQuadrants,
  type NarrowBand,
  type Narrowing,
} from '@/lib/coachhelm/v3/engine/context-narrowing';
import type { DistanceProfileBandViewModel } from '@/components/golf/coachhelm/game-fingerprint/distance-profile/buildDistanceProfileViewModel';

/* ─────────────────────────────────────────────────────────────────────────
 * 1. Band sizing
 * ──────────────────────────────────────────────────────────────────────── */

/** Where one approach-category stroke is filed. */
export type BandSgKey = NarrowBand | 'inside_50' | 'penalty';

export const BAND_SG_KEYS: readonly BandSgKey[] = ['50_125ft', '125_175ft', '175_plus_ft', 'inside_50', 'penalty'];

export const BAND_SG_LABEL: Record<BandSgKey, string> = {
  ...NARROW_BAND_LABEL,
  inside_50: 'Inside 50 yd',
  penalty: 'Penalty strokes',
};

/** Largest |recomputed − stored| approach SG per round (per 18) for the band
 *  widths to be drawn. */
export const BAND_SG_RECONCILE_TOLERANCE = 0.15;

/** One `golf_shots` row as the loader reads it. */
export interface RawShotRow {
  id: string;
  round_id: string;
  hole_id: string | null;
  hole_number: number | null;
  shot_number: number;
  shot_type: string | null;
  club_type: string | null;
  lie_before: string | null;
  lie_after: string | null;
  result: string | null;
  distance_to_hole_before: number | null;
  distance_unit_before: string | null;
  distance_to_hole_after: number | null;
  distance_unit_after: string | null;
  is_penalty: boolean | null;
  putt_made: boolean | null;
  miss_direction: string | null;
  created_at: string | null;
  /** Putts only: the recorded first-putt distance in feet (the measured What
   *  row's putting bands). Optional so older fixtures stay valid. */
  putt_distance_feet?: number | null;
}

/** One `golf_holes` row as the loader reads it. */
export interface RawHoleRow {
  id: string;
  round_id: string;
  hole_number: number | null;
  par: number | null;
  yardage: number | null;
  score: number | null;
  penalty_strokes: number | null;
  putts: number | null;
  gir: boolean | null;
}

export interface ApproachRoundInput {
  id: string;
  date: string;
  holesPlayed: number;
  /** Stored `golf_rounds.strokes_gained_approach` (raw, not per 18). */
  storedApproach: number | null;
}

/** `public.sg_normalize_lie`. */
export function sgNormalizeLie(lie: string | null): string {
  switch ((lie ?? 'fairway').toLowerCase()) {
    case 'tee':
    case 'teebox':
      return 'tee';
    case 'fairway':
      return 'fairway';
    case 'rough':
    case 'primary_rough':
      return 'rough';
    case 'sand':
    case 'bunker':
    case 'greenside_bunker':
    case 'fairway_bunker':
      return 'sand';
    case 'green':
    case 'fringe':
      return 'green';
    default:
      return 'fairway';
  }
}

function yardsOf(d: number | null, unit: string | null): number | null {
  if (d === null || !Number.isFinite(Number(d))) return null;
  return unit === 'feet' ? Number(d) / 3 : Number(d);
}

function expected(lie: string, yards: number, scale: number): number {
  if (yards <= 0) return 0;
  return lie === 'green' ? getExpectedStrokes('green', yards, yards * 3, scale) : getExpectedStrokes(lie, yards, undefined, scale);
}

export interface ShotSg {
  shotId: string;
  category: 'off_tee' | 'approach' | 'around_green' | 'putting';
  key: BandSgKey | null;
  sg: number;
}

/**
 * Per-shot SG for one round, as `calculate_round_strokes_gained` computes it
 * (see module doc). Shots without a `hole_id`, a `shot_type` or a positive
 * start distance are skipped, exactly as the DB query's join and WHERE do;
 * a shot with no resolvable finish contributes nothing (`has_after`).
 */
export function shotSgForRound(shots: readonly RawShotRow[], parByHoleId: ReadonlyMap<string, number>, scale: number): ShotSg[] {
  const eligible = shots.filter((s) => {
    if (!s.hole_id || !parByHoleId.has(s.hole_id) || !s.shot_type) return false;
    const d = yardsOf(s.distance_to_hole_before, s.distance_unit_before);
    return d !== null && d > 0;
  });
  const byHole = new Map<string, RawShotRow[]>();
  for (const s of eligible) {
    const arr = byHole.get(s.hole_id!) ?? [];
    arr.push(s);
    byHole.set(s.hole_id!, arr);
  }
  const out: ShotSg[] = [];
  for (const [holeId, list] of byHole) {
    const par = parByHoleId.get(holeId)!;
    const sorted = [...list].sort((a, b) => a.shot_number - b.shot_number);
    sorted.forEach((s, i) => {
      const next = sorted[i + 1];
      const pen = s.is_penalty === true;
      const lb = s.shot_type === 'putting' ? 'green' : sgNormalizeLie(s.lie_before);
      const db = yardsOf(s.distance_to_hole_before, s.distance_unit_before)!;
      const holed = s.putt_made === true || s.result === 'holed' || s.result === 'hole';
      let da: number;
      if (holed) da = 0;
      else if (s.distance_to_hole_after !== null) da = yardsOf(s.distance_to_hole_after, s.distance_unit_after) ?? 0;
      else da = next ? (yardsOf(next.distance_to_hole_before, next.distance_unit_before) ?? 0) : 0;
      const la = holed ? 'green' : s.lie_after !== null ? sgNormalizeLie(s.lie_after) : sgNormalizeLie(next?.lie_before ?? null);

      let category: ShotSg['category'];
      if (pen) {
        category = lb === 'tee' ? (par === 3 ? 'approach' : 'off_tee') : lb === 'green' ? 'around_green' : db <= 50 ? 'around_green' : 'approach';
      } else if (s.shot_type === 'putting') category = 'putting';
      else if (s.shot_type === 'tee') category = 'off_tee';
      else if (s.shot_type === 'around_green') category = 'around_green';
      else category = 'approach';

      const hasAfter = pen || holed || da > 0;
      if (!hasAfter) return;
      const before = pen ? 0 : expected(lb, db, scale);
      const after = pen || holed ? 0 : da > 0 ? expected(la, da, scale) : 0;
      let key: BandSgKey | null = null;
      if (category === 'approach') {
        if (pen) key = 'penalty';
        else if (db < 50) key = 'inside_50';
        else if (db < 125) key = '50_125ft';
        else if (db < 175) key = '125_175ft';
        else key = '175_plus_ft';
      }
      out.push({ shotId: s.id, category, key, sg: before - after - 1 });
    });
  }
  return out;
}

export interface ApproachBandSizing {
  rounds: number;
  /** Mean approach SG per round (per 18) filed under each key; negative = lost. */
  perRound: Record<BandSgKey, number>;
  /** Σ perRound — the recomputed approach SG per round. */
  recomputed: number;
  /** Mean stored `strokes_gained_approach` per round (per 18), same rounds. */
  stored: number | null;
  /** True when |recomputed − stored| ≤ tolerance: the widths may be drawn. */
  reconciled: boolean;
}

export function sizeApproachBands(
  rounds: readonly ApproachRoundInput[],
  shots: readonly RawShotRow[],
  holes: readonly RawHoleRow[],
  scale: number,
): ApproachBandSizing | null {
  const used = rounds.filter((r) => r.storedApproach !== null && Number.isFinite(r.storedApproach) && r.holesPlayed > 0);
  if (used.length === 0) return null;
  const parByHoleId = new Map<string, number>();
  for (const h of holes) if (typeof h.par === 'number') parByHoleId.set(h.id, h.par);
  const shotsByRound = new Map<string, RawShotRow[]>();
  for (const s of shots) {
    const arr = shotsByRound.get(s.round_id) ?? [];
    arr.push(s);
    shotsByRound.set(s.round_id, arr);
  }
  const sums: Record<BandSgKey, number> = { '50_125ft': 0, '125_175ft': 0, '175_plus_ft': 0, inside_50: 0, penalty: 0 };
  let storedSum = 0;
  for (const r of used) {
    const k18 = 18 / r.holesPlayed;
    storedSum += (r.storedApproach as number) * k18;
    for (const s of shotSgForRound(shotsByRound.get(r.id) ?? [], parByHoleId, scale)) {
      if (s.category === 'approach' && s.key) sums[s.key] += s.sg * k18;
    }
  }
  const n = used.length;
  const perRound = Object.fromEntries(BAND_SG_KEYS.map((k) => [k, sums[k] / n])) as Record<BandSgKey, number>;
  const recomputed = BAND_SG_KEYS.reduce((t, k) => t + perRound[k], 0);
  const stored = storedSum / n;
  return {
    rounds: n,
    perRound,
    recomputed,
    stored,
    reconciled: Math.abs(recomputed - stored) <= BAND_SG_RECONCILE_TOLERANCE,
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. Why view evidence per band
 * ──────────────────────────────────────────────────────────────────────── */

export interface ApproachGridCell {
  id: string;
  par: 3 | 4 | 5;
  length: 'short' | 'mid' | 'long';
  attempts: number;
  misses: number;
}

export interface ApproachCompass {
  /** The population the compass counts ("long par 4s from 175+ yd"). */
  population: string;
  misses: number;
  covered: number;
  quadrants: MissQuadrants;
  short: number;
  long: number;
  left: number;
  right: number;
  /** Shape label when the shape gate passed, else null. */
  shape: string | null;
}

export interface BandMetricRow {
  band: NarrowBand;
  label: string;
  greensPct: number | null;
  greensHit: number | null;
  attempts: number;
  proximityFt: number | null;
  severePct: number | null;
  /** A2 status of the band's green-hit row. */
  supported: boolean;
}

export interface ApproachWhyView {
  band: NarrowBand;
  bandLabel: string;
  rounds: number;
  narrowing: Pick<Narrowing, 'path' | 'sentence' | 'stoppedAt' | 'excluded'> & {
    steps: Array<{ level: string; passed: boolean; label: string | null; statement: string }>;
  };
  /** Only when the band cleared its population step. */
  grid: { cells: ApproachGridCell[]; selectedId: string | null; selectedLabel: string | null } | null;
  /** Only when the coverage gate passes. */
  compass: ApproachCompass | null;
  /** All three bands (the selected one is the row with `band`). */
  metrics: BandMetricRow[];
  /** Strokes/round lost from this band, when sized; else null. */
  strokesLost: number | null;
}

export interface ApproachRootContext {
  rounds: number;
  sizing: ApproachBandSizing | null;
  why: Partial<Record<NarrowBand, ApproachWhyView>>;
}

function bandMetricRows(profile: readonly DistanceProfileBandViewModel[]): BandMetricRow[] {
  const rows: BandMetricRow[] = [];
  for (const section of profile) {
    const get = (id: string) => section.rows.find((r) => r.metricId === id)?.row ?? null;
    const gh = get('approach_green_hit_rate');
    const px = get('approach_on_green_proximity_feet');
    const sv = get('approach_severe_outcome_rate');
    if (!gh) continue;
    rows.push({
      band: section.band as NarrowBand,
      label: NARROW_BAND_LABEL[section.band as NarrowBand],
      greensPct: gh.status === 'supported' ? gh.value : null,
      greensHit: gh.numerator,
      attempts: gh.denominator,
      proximityFt: px && px.status === 'supported' ? px.value : null,
      severePct: sv && sv.status === 'supported' ? sv.value : null,
      supported: gh.status === 'supported',
    });
  }
  return rows;
}

export function buildApproachWhyView(
  band: NarrowBand,
  facts: readonly ShotFact[],
  holes: readonly HoleContext[],
  rounds: number,
  profile: readonly DistanceProfileBandViewModel[],
  sizing: ApproachBandSizing | null,
): ApproachWhyView {
  const n = narrowApproach(facts, holes, band);
  const popOk = n.steps[0]?.passed === true;

  let grid: ApproachWhyView['grid'] = null;
  if (popOk) {
    const cells: ApproachGridCell[] = [];
    for (const c of n.sliceChecks) {
      if (c.key.length === null) continue;
      cells.push({ id: sliceId(c.key), par: c.key.par, length: c.key.length, attempts: c.attempts, misses: c.failures });
    }
    cells.sort((a, b) => a.par - b.par || ['short', 'mid', 'long'].indexOf(a.length) - ['short', 'mid', 'long'].indexOf(b.length));
    grid = { cells, selectedId: n.slice ? sliceId(n.slice.key) : null, selectedLabel: n.slice ? n.slice.label : null };
  }

  // Compass over the narrowest supported population: the chosen slice, else
  // the whole band. Shown only when enough misses carry a direction.
  let compass: ApproachCompass | null = null;
  if (popOk) {
    const { attempts } = collectBandAttempts(facts, holes, band);
    const misses = attempts.filter(
      (a) => a.failed && (!n.slice || (a.par === n.slice.key.par && (n.slice.key.length === null || a.length === n.slice.key.length))),
    );
    const shape = evaluateShape(misses.map((m) => m.direction));
    if (shape.covered >= SHAPE_MIN_COVERED && shape.coverage >= SHAPE_MIN_COVERAGE - 1e-9) {
      compass = {
        population: n.slice ? `${sliceLabel(n.slice.key)} from ${NARROW_BAND_LABEL[band]}` : `approaches from ${NARROW_BAND_LABEL[band]}`,
        misses: shape.misses,
        covered: shape.covered,
        quadrants: shape.quadrants,
        short: shape.short,
        long: shape.long,
        left: shape.left,
        right: shape.right,
        shape: shape.label,
      };
    }
  }

  const lost = sizing?.reconciled ? sizing.perRound[band] : null;
  return {
    band,
    bandLabel: NARROW_BAND_LABEL[band],
    rounds,
    narrowing: {
      path: n.path,
      sentence: n.sentence,
      stoppedAt: n.stoppedAt,
      excluded: n.excluded,
      steps: n.steps.map((s) => ({ level: s.level, passed: s.passed, label: s.label, statement: s.statement })),
    },
    grid,
    compass,
    metrics: bandMetricRows(profile),
    strokesLost: lost !== null && lost < 0 ? -lost : null,
  };
}

export function buildApproachRootContext(input: {
  rounds: number;
  facts: readonly ShotFact[];
  holes: readonly HoleContext[];
  profile: readonly DistanceProfileBandViewModel[];
  sizing: ApproachBandSizing | null;
}): ApproachRootContext {
  const why: Partial<Record<NarrowBand, ApproachWhyView>> = {};
  for (const band of NARROW_BANDS) {
    why[band] = buildApproachWhyView(band, input.facts, input.holes, input.rounds, input.profile, input.sizing);
  }
  return { rounds: input.rounds, sizing: input.sizing, why };
}

/** `approach_proximity_175_plus_ft` → `175_plus_ft`. */
export function bandOfMetric(metric: unknown): NarrowBand | null {
  if (typeof metric !== 'string') return null;
  const m = metric.match(/^approach_proximity_(50_125ft|125_175ft|175_plus_ft)$/);
  return m ? (m[1] as NarrowBand) : null;
}

/** "175+ yd → par 4s → short" — the WHY root drawn on the map. */
export function contextPathText(path: readonly string[]): string | null {
  return path.length > 1 ? path.join(' → ') : null;
}
