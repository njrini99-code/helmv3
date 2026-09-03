import { join } from 'node:path';
import { readJsonIfExists } from '../lib/repo.mjs';
import { FINDINGS, ZERO_FINDINGS_VERIFIED, NO_SIGNAL } from '../lib/verdicts.mjs';

export const CLASS_ID = 'duplicate_helpers';
export const TITLE = 'Duplicate helpers';
const MAX_FINDINGS = 8;

/**
 * Reuses `.duplicate-exports-baseline.json` (the live ratchet baseline for
 * `npm run lint:duplicate-exports` / `scripts/check-duplicate-exports.mjs`)
 * rather than re-implementing duplicate-export detection. Scope note: that
 * baseline only covers `src/app/**` (its own $comment says so), so a
 * ZERO_FINDINGS_VERIFIED verdict here is scoped to that subtree, not the
 * whole repo.
 */
export function run({ repoRoot }) {
  const path = join(repoRoot, '.duplicate-exports-baseline.json');
  const baseline = readJsonIfExists(path);

  if (!baseline || typeof baseline.total !== 'number' || !Array.isArray(baseline.entries)) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: NO_SIGNAL,
      note: '.duplicate-exports-baseline.json is missing or malformed — the substrate this class reads does not exist.',
      evidenceCommand: 'npm run lint:duplicate-exports',
    };
  }

  if (baseline.total === 0) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: ZERO_FINDINGS_VERIFIED,
      note: 'Scoped to src/app/** (the baseline\'s own scope) — a function name exported from two files elsewhere would not appear here.',
      evidenceCommand: 'npm run lint:duplicate-exports',
    };
  }

  const findings = baseline.entries.slice(0, MAX_FINDINGS).map((entry, i) => {
    const [name, filesPart] = entry.split(' :: ');
    const files = (filesPart ?? '').split(' + ');
    return {
      id: `${CLASS_ID}-${i}-${(name ?? 'unknown').replace(/[^a-zA-Z0-9]/g, '')}`,
      summary: `"${name}" is exported from ${files.length} files under src/app`,
      detail: `Files: ${files.join(', ')}. Baseline: ${filesPart}`,
      scope: files[0] ?? 'src/app/**',
      confidence: 'high', // baseline is a live, ratcheted, already-enforced signal
      sizeOfChange: files.length <= 2 ? 'small' : 'medium',
      proposedPr: `Pick a survivor for "${name}" among ${files.join(', ')}, re-export from the survivor, delete the duplicate copy (never rename one to hide the duplication — .duplicate-exports-baseline.json's own $comment).`,
    };
  });

  return {
    classId: CLASS_ID,
    title: TITLE,
    verdict: FINDINGS,
    note:
      baseline.total > MAX_FINDINGS
        ? `Showing top ${MAX_FINDINGS} of ${baseline.total} baseline entries — see the full file for the rest.`
        : undefined,
    evidenceCommand: 'cat .duplicate-exports-baseline.json',
    findings,
  };
}
