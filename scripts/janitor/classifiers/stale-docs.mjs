import { join } from 'node:path';
import { readJsonIfExists } from '../lib/repo.mjs';
import { FINDINGS, ZERO_FINDINGS_VERIFIED, NO_SIGNAL } from '../lib/verdicts.mjs';

export const CLASS_ID = 'stale_docs_path_drift';
export const TITLE = 'Stale docs (path-drift baseline)';
const MAX_FINDINGS = 10;

/**
 * Reuses `.doc-path-baseline.json`, the live ratchet baseline for
 * `npm run docs:path-drift` (paths named in navigation docs that do not
 * resolve on disk). Does not re-walk docs itself — the baseline IS the
 * generator's output, already run in CI on every PR.
 */
export function run({ repoRoot }) {
  const path = join(repoRoot, '.doc-path-baseline.json');
  const baseline = readJsonIfExists(path);

  if (!baseline || typeof baseline.total !== 'number' || !Array.isArray(baseline.entries)) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: NO_SIGNAL,
      note: '.doc-path-baseline.json is missing or malformed.',
      evidenceCommand: 'npm run docs:path-drift',
    };
  }

  if (baseline.total === 0) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: ZERO_FINDINGS_VERIFIED,
      evidenceCommand: 'npm run docs:path-drift',
    };
  }

  return {
    classId: CLASS_ID,
    title: TITLE,
    verdict: FINDINGS,
    note:
      baseline.total > MAX_FINDINGS
        ? `Showing top ${MAX_FINDINGS} of ${baseline.total} baseline entries.`
        : undefined,
    evidenceCommand: 'npm run docs:path-drift',
    findings: baseline.entries.slice(0, MAX_FINDINGS).map((entry, i) => ({
      id: `${CLASS_ID}-${i}`,
      summary: `Doc-named path does not resolve: ${entry}`,
      detail: entry,
      scope: 'docs/**',
      confidence: 'high',
      sizeOfChange: 'small',
      proposedPr: `Fix or remove the dead path "${entry}" from the doc that names it. Do not bulk-repoint by basename search — see .claude/rules/shipping.md §1.`,
    })),
  };
}
