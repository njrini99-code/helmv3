/**
 * Builds the prescription fields for a focus area assigned from a read
 * (04 §1.3): the read's rate and count become the baseline, the read's team
 * standing is the shrinkage prior, and the criterion generator fills the
 * rest. A read that cannot support a criterion still records who assigned
 * the area and the checkpoint cadence; the reason says why there is no
 * criterion, so the audit can show it.
 *
 * Pure: the caller passes the read's `evidence` JSON.
 */
import { generateCriterion, DEFAULT_CHECK_AFTER_ROUNDS, type PrescriptionFields } from './criterion';
import { verdictMetricFor } from './metrics';

export type AssignedBy = 'coach' | 'engine' | 'player';

/** Teammates needed before the team rate is the prior (Slice 1's TEAM_MIN_N). */
export const TEAM_PRIOR_MIN_N = 4;

export type NoCriterionReason =
  | 'no_evidence'
  | 'metric_mismatch'
  | 'no_verdict_metric'
  | 'not_a_percent'
  | 'polarity_mismatch'
  | 'no_baseline'
  | 'no_team_prior';

export type PrescriptionPatch =
  | ({ assigned_by: AssignedBy } & PrescriptionFields & { criterionReason: null })
  | { assigned_by: AssignedBy; check_after_rounds: number; criterionReason: NoCriterionReason };

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export interface BuildPrescriptionInput {
  /** `golf_coach_insights.evidence` of the source read. */
  evidence: unknown;
  /** The focus area's canonical `target_metric`. */
  targetMetric: string | null;
  /** The focus area's `target_value` as the coach set it (percent, 0-100), if any. */
  coachTargetValue?: number | null;
  assignedBy: AssignedBy;
}

export function buildPrescriptionFromRead(input: BuildPrescriptionInput): PrescriptionPatch {
  const none = (criterionReason: NoCriterionReason): PrescriptionPatch => ({
    assigned_by: input.assignedBy,
    check_after_rounds: DEFAULT_CHECK_AFTER_ROUNDS,
    criterionReason,
  });

  const evidence = obj(input.evidence);
  if (!evidence) return none('no_evidence');

  const metric = typeof evidence.metric === 'string' ? evidence.metric : null;
  // The baseline must measure what the focus area targets.
  if (!metric || !input.targetMetric || metric !== input.targetMetric) return none('metric_mismatch');

  const def = verdictMetricFor(metric);
  if (!def) return none('no_verdict_metric');
  if (evidence.unit !== 'percent') return none('not_a_percent');

  // A producer that declares the headline the other way round (approach_miss
  // keeps a feet metric id over a green-hit percent) is not this metric.
  const polarity = evidence.polarity;
  const declared = polarity === 'higher_better' ? 'higher' : polarity === 'lower_better' ? 'lower' : null;
  if (declared && declared !== def.direction) return none('polarity_mismatch');

  const yourValue = num(evidence.your_value);
  const n = num(evidence.sample_n);
  if (yourValue === null || n === null || !Number.isInteger(n) || n <= 0) return none('no_baseline');

  const standing = obj(evidence.standing);
  const teamAvg = num(standing?.team_avg);
  const teamN = num(standing?.team_n) ?? 0;
  if (teamAvg === null || teamN < TEAM_PRIOR_MIN_N) return none('no_team_prior');

  const coachTarget = num(input.coachTargetValue);
  const result = generateCriterion({
    def,
    baseline: { value: yourValue / 100, n },
    prior: { value: teamAvg / 100, source: 'team_pool' },
    coachThreshold: coachTarget === null ? null : coachTarget / 100,
  });
  if (!result) return none('no_baseline');

  return { assigned_by: input.assignedBy, ...result.fields, criterionReason: null };
}

/** The row patch, without the in-memory reason. */
/** The focus-area columns a {@link PrescriptionPatch} writes (everything but the reason). */
export type PrescriptionColumns =
  | ({ assigned_by: AssignedBy } & PrescriptionFields)
  | { assigned_by: AssignedBy; check_after_rounds: number };

export function toColumnPatch(patch: PrescriptionPatch): PrescriptionColumns {
  const { criterionReason: _reason, ...columns } = patch;
  return columns;
}
