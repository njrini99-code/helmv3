import { grep } from '../lib/repo.mjs';
import { FINDINGS, ZERO_FINDINGS_VERIFIED, NO_SIGNAL } from '../lib/verdicts.mjs';

export const CLASS_ID = 'dead_flags';
export const TITLE = 'Dead feature flags';
const PATTERN = 'featureFlag|isFlagEnabled|FEATURE_FLAG';

/**
 * memory/registry.yml (the "Feature-flag module" row in the plan's own
 * EXISTS/MISSING ledger) records that this repo has ZERO production code
 * matching `featureFlag`/`isFlagEnabled`/`FEATURE_FLAG` — no flag module
 * exists at all. This class does not treat that as "checked, found no dead
 * flags": there is nothing here to CALL dead, because there is no flag
 * substrate to scan. NO_SIGNAL is the honest verdict; a future flag module
 * (config/feature-flags.yml, per the same ledger row) would give this class
 * something real to check.
 */
export function run({ repoRoot }) {
  const hits = grep(repoRoot, PATTERN, ['src/**/*.ts', 'src/**/*.tsx']);

  if (hits.length === 0) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: NO_SIGNAL,
      note: 'No feature-flag module or convention exists in src/ at all (grep for featureFlag|isFlagEnabled|FEATURE_FLAG returns nothing) — there is nothing to classify as dead.',
      evidenceCommand: `git grep -n -E '${PATTERN}' -- src/**/*.ts src/**/*.tsx`,
    };
  }

  // A flag module DOES exist (this repo did not, at the time this classifier
  // was written) — group hits by the flag-like identifier they reference and
  // flag any identifier referenced in exactly one place as a dead-flag
  // candidate (defined/read once, never toggled or checked a second time).
  const byFile = new Map();
  for (const hit of hits) {
    if (!byFile.has(hit.file)) byFile.set(hit.file, []);
    byFile.get(hit.file).push(hit);
  }
  const singleRefFiles = [...byFile.entries()].filter(([, refs]) => refs.length === 1);

  if (singleRefFiles.length === 0) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: ZERO_FINDINGS_VERIFIED,
      note: `${hits.length} flag-related reference(s) found across ${byFile.size} file(s); every file references flag machinery more than once, so no single-reference dead-flag candidate was found.`,
      evidenceCommand: `git grep -n -E '${PATTERN}' -- src/**/*.ts src/**/*.tsx`,
    };
  }

  return {
    classId: CLASS_ID,
    title: TITLE,
    verdict: FINDINGS,
    evidenceCommand: `git grep -n -E '${PATTERN}' -- src/**/*.ts src/**/*.tsx`,
    findings: singleRefFiles.slice(0, 10).map(([file, refs], i) => ({
      id: `${CLASS_ID}-${i}`,
      summary: `${file}:${refs[0].lineNo} is the only flag reference in this file`,
      detail: refs[0].text.trim(),
      scope: file,
      confidence: 'low', // a single reference is a heuristic, not proof the flag is dead
      sizeOfChange: 'small',
      proposedPr: `Confirm whether the flag referenced at ${file}:${refs[0].lineNo} is still read anywhere else (config, remote flag service); if not, remove it and the dead branch it guards.`,
    })),
  };
}
