import { grep } from '../lib/repo.mjs';
import { FINDINGS, ZERO_FINDINGS_VERIFIED, NO_SIGNAL } from '../lib/verdicts.mjs';

export const CLASS_ID = 'mock_inflation';
export const TITLE = 'Mock-heavy test files';
const PATTERN = '(vi|jest|vitest)\\.mock\\(';
const MOCK_COUNT_THRESHOLD = 10;
const MAX_FINDINGS = 10;

/**
 * Counts `vi.mock(` / `jest.mock(` / `vitest.mock(` calls per test file. A
 * file with a lot of mocks is not automatically wrong — some integration
 * seams genuinely need many — but a cluster of them is a real "how much of
 * this test is testing the mocks" signal worth a human look.
 */
export function run({ repoRoot }) {
  const hits = grep(repoRoot, PATTERN, ['src/**/*.test.ts', 'src/**/*.test.tsx']);

  if (hits.length === 0) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: NO_SIGNAL,
      note: 'No vi.mock()/jest.mock()/vitest.mock() call found anywhere under src/**/*.test.{ts,tsx} — this repo\'s test suite does not use that mocking convention (or none at all), so there is nothing to call inflated.',
      evidenceCommand: `git grep -c -E '${PATTERN}' -- src/**/*.test.ts src/**/*.test.tsx`,
    };
  }

  const byFile = new Map();
  for (const hit of hits) byFile.set(hit.file, (byFile.get(hit.file) ?? 0) + 1);

  const heavy = [...byFile.entries()]
    .filter(([, count]) => count >= MOCK_COUNT_THRESHOLD)
    .sort((a, b) => b[1] - a[1]);

  if (heavy.length === 0) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: ZERO_FINDINGS_VERIFIED,
      note: `${hits.length} mock call(s) across ${byFile.size} file(s); none reached the ${MOCK_COUNT_THRESHOLD}-per-file threshold.`,
      evidenceCommand: `git grep -c -E '${PATTERN}' -- src/**/*.test.ts src/**/*.test.tsx | sort -t: -k2 -rn | head -20`,
    };
  }

  return {
    classId: CLASS_ID,
    title: TITLE,
    verdict: FINDINGS,
    note: `Threshold: ${MOCK_COUNT_THRESHOLD}+ mock() calls in one test file.` + (heavy.length > MAX_FINDINGS ? ` Showing top ${MAX_FINDINGS} of ${heavy.length}.` : ''),
    evidenceCommand: `git grep -c -E '${PATTERN}' -- src/**/*.test.ts src/**/*.test.tsx | sort -t: -k2 -rn | head -20`,
    findings: heavy.slice(0, MAX_FINDINGS).map(([file, count], i) => ({
      id: `${CLASS_ID}-${i}`,
      summary: `${file} mocks ${count} modules`,
      detail: `${count} vi.mock()/jest.mock()/vitest.mock() calls`,
      scope: file,
      confidence: 'low',
      sizeOfChange: 'medium',
      proposedPr: `Read ${file} (${count} mocked modules) and check whether it should be an integration test against real collaborators instead, or split into smaller unit tests each mocking less.`,
    })),
  };
}
