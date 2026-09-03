import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FINDINGS, ZERO_FINDINGS_VERIFIED, NO_SIGNAL } from '../lib/verdicts.mjs';

export const CLASS_ID = 'unused_tests';
export const TITLE = 'Unused test files (Knip)';
const MAX_FINDINGS = 10;

/**
 * "knip output if a report exists" — and today it does not. `npm run knip`
 * is a devDependency-only script and the weekly CircleCI `knip` job writes
 * `knip-report.txt` ONLY as a build artifact (`.circleci/config.yml`'s
 * `store_artifacts` step) — it is never committed to the repo, and this
 * generator does not run Knip itself (that would mean `npm install
 * --no-save knip` inside a disk-constrained worktree shared with other
 * agents, which this task was explicitly told to avoid). So absent an
 * env-provided path, this class has NO real input and must say so — not
 * silently report zero unused tests, which would look identical to "Knip
 * ran and found none" and is not the same claim.
 *
 * Honors KNIP_REPORT_PATH (or repo-root knip-report.txt) so the weekly
 * CircleCI job — which already runs knip in a SEPARATE job with npm ci —
 * can feed a real report in by copying its artifact next to this one, as a
 * future wiring step; see docs/generated/JANITOR_REPORT.md's own notes on
 * this class for the exact one-line addition.
 */
export function run({ repoRoot }) {
  const path = process.env.KNIP_REPORT_PATH
    ? process.env.KNIP_REPORT_PATH
    : join(repoRoot, 'knip-report.txt');

  if (!existsSync(path)) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: NO_SIGNAL,
      note:
        'No committed knip-report.txt exists in this repo, and this generator does not run Knip itself. ' +
        'The weekly CircleCI `knip` job produces one as a build ARTIFACT only (never committed) — ' +
        'set KNIP_REPORT_PATH to feed a real report into this classifier, e.g. from that job\'s artifact.',
      evidenceCommand: 'npx knip --no-config-hints --reporter compact > knip-report.txt',
    };
  }

  const text = readFileSync(path, 'utf-8');
  const unusedFileLines = text
    .split('\n')
    .filter((line) => /\.(test|spec)\.(ts|tsx)/.test(line) && /unused files?/i.test(text.slice(0, text.indexOf(line))));

  // Fall back to a simpler heuristic: any line under an "Unused files" /
  // "unused exports" section naming a test file, matched line-by-line
  // rather than trying to parse Knip's compact-reporter grammar exactly.
  const testFileHits = text.split('\n').filter((line) => /\.(test|spec)\.(ts|tsx)\b/.test(line));

  const hits = [...new Set([...unusedFileLines, ...testFileHits])];

  if (hits.length === 0) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: ZERO_FINDINGS_VERIFIED,
      note: `Read ${path}; no test-file line found in it.`,
      evidenceCommand: `cat ${path}`,
    };
  }

  return {
    classId: CLASS_ID,
    title: TITLE,
    verdict: FINDINGS,
    note:
      `Parsed from ${path} with a line-level heuristic (any line naming a .test./.spec. file), not Knip's structured JSON — ` +
      'verify each against the real report before acting.' +
      (hits.length > MAX_FINDINGS ? ` Showing top ${MAX_FINDINGS} of ${hits.length}.` : ''),
    evidenceCommand: `cat ${path}`,
    findings: hits.slice(0, MAX_FINDINGS).map((line, i) => ({
      id: `${CLASS_ID}-${i}`,
      summary: line.trim().slice(0, 160),
      detail: line.trim(),
      scope: 'unknown — see detail',
      confidence: 'low',
      sizeOfChange: 'small',
      proposedPr: `Confirm the test file named in "${line.trim().slice(0, 100)}" is genuinely unused (not just unreferenced by name), then remove it or wire it back into the suite that should run it.`,
    })),
  };
}
