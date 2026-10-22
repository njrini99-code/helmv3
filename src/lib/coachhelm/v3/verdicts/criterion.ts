/**
 * The criterion generator (03-usefulness §4.2, 04 §1.3 and §2).
 *
 * From a read's baseline (count and rate) and the team prior it produces the
 * prescription fields the verdict is later judged on:
 *
 * - `baseline_shrunk = (n·y + κ·μ)/(n + κ)` (02 §4): what the player would
 *   be expected to drift to with no coaching at all (regression to the mean).
 * - `threshold = baseline_shrunk + max(0.5 × gap_to_team, SWC)`, in the
 *   improving direction, rounded to a whole percent away from the baseline.
 *   A coach-set threshold on the improving side of the shrunk baseline wins.
 * - the horizon in attempts: the n at which a post rate exactly at the
 *   threshold would put the one-sided 90% bound past `baseline_shrunk`,
 *   `n = z²·t(1−t)/(t − b)²`, rounded up to 5 and held between the family's
 *   say floor and Clear floor (04 §2). That reproduces 03 §4.2's "75% needs
 *   25; 70% needs 40" for a 0.635 baseline (the 70% case is capped at the
 *   Clear floor, so `separable` is false: the post rate has to clear the
 *   threshold by enough for the bound to separate).
 * - `check_after_rounds` = 3 (04 §1.3 default).
 *
 * All rates are proportions (0-1). Pure.
 */
import { Z_ONE_SIDED_90 } from './bounds';
import type { VerdictMetricDef } from './metrics';
import { keptShare, shrinkToward } from '@/lib/coachhelm/v3/support/shrink';

/**
 * Smallest worthwhile change for a make rate when the team spread is not
 * known: 5 percentage points. 02 §11 defines SWC as 0.2 × the team's
 * between-player SD; that SD is Slice 7's team pool work, so until then this
 * default (the focus-area catalog's own `improveStep` for percent metrics)
 * stands in. Callers that have the SD pass `swc`.
 */
export const DEFAULT_SWC_PCT = 0.05;

export const DEFAULT_CHECK_AFTER_ROUNDS = 3;

export type PriorSource = 'team_pool' | 'band_prior';

export type Criterion = {
  direction: 'higher' | 'lower';
  /** Proportion (0-1) for `unit: 'pct'`. */
  threshold: number;
  unit: 'pct';
  /** Where the threshold came from and what the shrunk baseline leaned on. */
  basis: {
    threshold_source: 'engine' | 'coach';
    kappa: number;
    prior: number;
    prior_source: PriorSource;
    /** n / (n + κ): the share of the player's own rate kept. */
    kept_share: number;
  };
};

export type Horizon = {
  attempts?: number;
  rounds?: number;
};

/** The new `golf_player_focus_areas` columns this generator fills. */
export type PrescriptionFields = {
  baseline_n: number;
  baseline_shrunk: number;
  criterion: Criterion;
  horizon: Horizon;
  check_after_rounds: number;
};

export interface CriterionInput {
  def: VerdictMetricDef;
  /** The read's rate (proportion) and the attempts behind it. */
  baseline: { value: number; n: number };
  /** The shrinkage prior (team pool rate, proportion). */
  prior: { value: number; source: PriorSource };
  /** Smallest worthwhile change, proportion; defaults to {@link DEFAULT_SWC_PCT}. */
  swc?: number | null;
  /** A coach-set target (proportion); used when it is on the improving side. */
  coachThreshold?: number | null;
}

export interface CriterionResult {
  fields: PrescriptionFields;
  /** Attempts needed for a post rate at the threshold to separate. */
  requiredAttempts: number;
  /** True when the horizon is long enough for that separation. */
  separable: boolean;
}

const isRate = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

const round4 = (v: number): number => Math.round(v * 10_000) / 10_000;

/** Whole-percent rounding away from the baseline (a target is never softened by rounding). */
function roundAwayToPercent(value: number, direction: 'higher' | 'lower'): number {
  const pct = value * 100;
  const whole = direction === 'higher' ? Math.ceil(pct - 1e-9) : Math.floor(pct + 1e-9);
  return whole / 100;
}

/** n at which a post rate at `threshold` puts the one-sided 90% bound past `baselineShrunk`. */
export function requiredAttemptsFor(threshold: number, baselineShrunk: number): number {
  const delta = Math.abs(threshold - baselineShrunk);
  if (!(delta > 0)) return Number.POSITIVE_INFINITY;
  const z = Z_ONE_SIDED_90;
  return Math.ceil((z * z * threshold * (1 - threshold)) / (delta * delta));
}

/** The default horizon for a threshold: required n rounded up to 5, between the say and Clear floors. */
export function horizonAttemptsFor(def: VerdictMetricDef, threshold: number, baselineShrunk: number): number {
  const required = requiredAttemptsFor(threshold, baselineShrunk);
  const rounded = Number.isFinite(required) ? Math.ceil(required / 5) * 5 : def.clearFloor;
  return Math.min(def.clearFloor, Math.max(def.sayFloor, rounded));
}

/**
 * Build the prescription fields for one read, or null when the inputs cannot
 * support a criterion (rates outside 0-1, no attempts behind the baseline).
 */
export function generateCriterion(input: CriterionInput): CriterionResult | null {
  const { def, baseline, prior } = input;
  if (!isRate(baseline.value) || !isRate(prior.value)) return null;
  if (!(Number.isInteger(baseline.n) && baseline.n > 0)) return null;

  const sign = def.direction === 'higher' ? 1 : -1;
  const shrunk = shrinkToward(baseline.value, baseline.n, prior.value, def.kappa);
  const gapToTeam = Math.max(0, sign * (prior.value - shrunk));
  const swc = typeof input.swc === 'number' && input.swc > 0 ? input.swc : DEFAULT_SWC_PCT;
  const step = Math.max(0.5 * gapToTeam, swc);
  const engineThreshold = Math.min(0.99, Math.max(0.01, roundAwayToPercent(shrunk + sign * step, def.direction)));

  const coach = input.coachThreshold;
  const coachUsable = isRate(coach) && coach > 0 && coach < 1 && sign * (coach - shrunk) > 0;
  const threshold = coachUsable ? coach : engineThreshold;

  const requiredAttempts = requiredAttemptsFor(threshold, shrunk);
  const attempts = horizonAttemptsFor(def, threshold, shrunk);

  return {
    fields: {
      baseline_n: baseline.n,
      baseline_shrunk: round4(shrunk),
      criterion: {
        direction: def.direction,
        threshold: round4(threshold),
        unit: def.unit,
        basis: {
          threshold_source: coachUsable ? 'coach' : 'engine',
          kappa: def.kappa,
          prior: round4(prior.value),
          prior_source: prior.source,
          kept_share: round4(keptShare(baseline.n, def.kappa)),
        },
      },
      horizon: { attempts },
      check_after_rounds: DEFAULT_CHECK_AFTER_ROUNDS,
    },
    requiredAttempts,
    separable: requiredAttempts <= attempts,
  };
}
