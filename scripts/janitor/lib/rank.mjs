import { CONFIDENCE_WEIGHT, SIZE_WEIGHT } from './verdicts.mjs';

/**
 * Ranking basis, stated once and printed verbatim in the report header
 * (docs/generated/JANITOR_REPORT.md) so the order is reviewable, not
 * assumed:
 *
 *   score = confidence_weight * 10 - size_weight
 *
 * High-confidence findings sort first because a reviewer can act on them
 * without further digging; within the same confidence tier, a SMALLER
 * proposed change sorts first, because every finding here is scoped to
 * become one small PR (Phase K.4.5) and the smallest high-confidence
 * changes are the cheapest wins to actually ship.
 */
export const RANKING_BASIS =
  'score = confidence_weight(high=3, medium=2, low=1) * 10 - size_weight(small=1, medium=2, large=3); ' +
  'higher confidence first, smaller proposed change breaks ties.';

export function findingScore(finding) {
  const c = CONFIDENCE_WEIGHT[finding.confidence] ?? CONFIDENCE_WEIGHT.low;
  const s = SIZE_WEIGHT[finding.sizeOfChange] ?? SIZE_WEIGHT.large;
  return c * 10 - s;
}

/** Sort findings across ALL classes into one ranked list, stable by classId+id on ties. */
export function rankFindings(classResults) {
  const flat = [];
  for (const result of classResults) {
    if (result.verdict !== 'FINDINGS') continue;
    for (const finding of result.findings) {
      flat.push({ classId: result.classId, classTitle: result.title, ...finding, _score: findingScore(finding) });
    }
  }
  flat.sort((a, b) => b._score - a._score || a.classId.localeCompare(b.classId) || a.id.localeCompare(b.id));
  return flat;
}
