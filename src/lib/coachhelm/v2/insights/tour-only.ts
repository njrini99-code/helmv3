import type { InsightEvidence } from './types';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Q-88: CoachHelm compares with the team's Tour and never a college number.
 * Stored insights written before the change can carry a college comparison:
 * a division target (`d2_avg` on 13 live rows), the old women's-college
 * estimate (`estimated_target`) or a `cohort_avg`. At render such a tick is
 * dropped: a Tour secondary is promoted to primary when there is one,
 * otherwise no comparison is drawn. Every other source is unchanged.
 */
const COLLEGE_SOURCES: ReadonlySet<string> = new Set([
  'd1_avg', 'd2_avg', 'd3_avg', 'naia_avg', 'juco_avg', 'cohort_avg', 'estimated_target',
]);

export function tourOnlyEvidence(evidence: InsightEvidence): InsightEvidence {
  const college = COLLEGE_SOURCES.has(evidence.comparison_source);
  const secondaryCollege = evidence.secondary_source != null && COLLEGE_SOURCES.has(evidence.secondary_source);
  if (!college && !secondaryCollege) return evidence;
  const { secondary_value, secondary_label, secondary_source, ...rest } = evidence;
  if (!college) return rest as InsightEvidence;
  if (secondary_source === 'pga_baseline' && isFiniteNumber(secondary_value)) {
    return {
      ...rest,
      comparison_value: secondary_value,
      comparison_label: secondary_label ?? 'Tour avg',
      comparison_source: 'pga_baseline',
    } as InsightEvidence;
  }
  return { ...rest, comparison_value: undefined, comparison_label: undefined } as unknown as InsightEvidence;
}
