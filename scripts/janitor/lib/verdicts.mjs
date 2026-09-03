/**
 * Shared verdict vocabulary for every Janitor classifier.
 *
 * Three verdicts, not two — this is the same UNKNOWN-never-becomes-PASS
 * discipline `scripts/control-plane-verify.mjs` applies to the control
 * plane, applied here to the Janitor's own output:
 *
 *   FINDINGS               the class was checked and it found something.
 *   ZERO_FINDINGS_VERIFIED  the class was checked FULLY and definitively
 *                           found nothing — always paired with the exact
 *                           command a human can re-run to reproduce that.
 *   NO_SIGNAL               the substrate this class needs does not exist
 *                           in this repo (a baseline file that has never
 *                           been populated, a companion tool's output that
 *                           was never committed, a convention — feature
 *                           flags, a telemetry vocabulary — that has not
 *                           been introduced yet). This is NOT "zero
 *                           findings": a class with no report to read looks
 *                           identical to a genuinely clean class unless it
 *                           says so, and that is exactly the failure this
 *                           file exists to stop this generator from making
 *                           of its own output.
 *
 * A classifier that cannot tell the difference between "checked, found
 * nothing" and "could not check" must return NO_SIGNAL, never
 * ZERO_FINDINGS_VERIFIED with a shrug.
 */
export const FINDINGS = 'FINDINGS';
export const ZERO_FINDINGS_VERIFIED = 'ZERO_FINDINGS_VERIFIED';
export const NO_SIGNAL = 'NO_SIGNAL';

export const VALID_VERDICTS = new Set([FINDINGS, ZERO_FINDINGS_VERIFIED, NO_SIGNAL]);

/**
 * Confidence -> numeric weight used only for ranking (see rank.mjs). Not a
 * statement of truth, a statement of how likely a human reviewing the
 * finding is to agree with it without further digging.
 */
export const CONFIDENCE_WEIGHT = { high: 3, medium: 2, low: 1 };

/**
 * Proposed-PR size -> numeric weight, also ranking-only. Every finding
 * class in this generator is scoped to propose SMALL PRs (per the
 * control-plane plan's Phase K.4.5), so 'large' should be rare; when it
 * shows up it is a signal the finding needs splitting before it becomes a
 * proposal, not a reason to skip ranking it.
 */
export const SIZE_WEIGHT = { small: 1, medium: 2, large: 3 };

/**
 * Validate a classifier's return shape at the boundary, so a bug in one
 * classifier fails loudly (and names which one) instead of corrupting the
 * aggregate report silently.
 */
export function assertClassifierResult(result, classId) {
  if (!result || typeof result !== 'object') {
    throw new Error(`classifier "${classId}" returned a non-object result`);
  }
  if (!VALID_VERDICTS.has(result.verdict)) {
    throw new Error(`classifier "${classId}" returned an invalid verdict: ${JSON.stringify(result.verdict)}`);
  }
  if (result.verdict === FINDINGS && (!Array.isArray(result.findings) || result.findings.length === 0)) {
    throw new Error(`classifier "${classId}" returned verdict FINDINGS with no findings array`);
  }
  if (result.verdict !== FINDINGS && Array.isArray(result.findings) && result.findings.length > 0) {
    throw new Error(`classifier "${classId}" returned findings but verdict ${result.verdict} — should be FINDINGS`);
  }
  if (typeof result.evidenceCommand !== 'string' || result.evidenceCommand.length === 0) {
    throw new Error(`classifier "${classId}" did not name a command that reproduces its verdict`);
  }
  return result;
}
