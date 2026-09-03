import { grep } from '../lib/repo.mjs';
import { FINDINGS, ZERO_FINDINGS_VERIFIED } from '../lib/verdicts.mjs';

export const CLASS_ID = 'deprecated_apis';
export const TITLE = 'Deprecated APIs still exported';
const PATTERN = '@deprecated';
const MAX_FINDINGS = 15;

/**
 * git-greps for the standard `@deprecated` JSDoc tag under src/. A marker a
 * previous author already committed to writing is a stronger signal than
 * inferring "deprecated" from naming or usage — this class trusts that
 * marker rather than re-deriving deprecation from scratch.
 */
export function run({ repoRoot }) {
  const hits = grep(repoRoot, PATTERN, ['src/**/*.ts', 'src/**/*.tsx']);

  if (hits.length === 0) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: ZERO_FINDINGS_VERIFIED,
      evidenceCommand: `git grep -n -F '${PATTERN}' -- src/**/*.ts src/**/*.tsx`,
    };
  }

  return {
    classId: CLASS_ID,
    title: TITLE,
    verdict: FINDINGS,
    note: hits.length > MAX_FINDINGS ? `Showing top ${MAX_FINDINGS} of ${hits.length} @deprecated markers.` : undefined,
    evidenceCommand: `git grep -n -F '${PATTERN}' -- src/**/*.ts src/**/*.tsx`,
    findings: hits.slice(0, MAX_FINDINGS).map((hit, i) => ({
      id: `${CLASS_ID}-${i}`,
      summary: `${hit.file}:${hit.lineNo} carries an @deprecated marker`,
      detail: hit.text.trim(),
      scope: hit.file,
      confidence: 'high',
      sizeOfChange: 'medium', // removing a deprecated export needs a callsite check first
      proposedPr: `Confirm ${hit.file}:${hit.lineNo}'s deprecated export has zero remaining callers (grep its export name), then remove it and update callers to the documented replacement.`,
    })),
  };
}
