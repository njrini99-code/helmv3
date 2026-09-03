import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lsFiles } from '../lib/repo.mjs';
import { FINDINGS, ZERO_FINDINGS_VERIFIED } from '../lib/verdicts.mjs';

export const CLASS_ID = 'oversized_modules';
export const TITLE = 'Oversized modules';
const LINE_THRESHOLD = 600;
const MAX_FINDINGS = 10;

/**
 * Line count is a blunt, file-size signal — not a complexity metric, and it
 * says nothing about whether a large file is one cohesive concern or five
 * tangled ones. It is still a real, cheap "candidate for decomposition"
 * signal, and it is what the plan names ("file sizes") for this class.
 */
export function run({ repoRoot }) {
  const files = lsFiles(repoRoot, ['src/**/*.ts', 'src/**/*.tsx']);

  const sized = files
    .map((file) => {
      let lines = 0;
      try {
        const content = readFileSync(join(repoRoot, file), 'utf-8');
        lines = content.length === 0 ? 0 : content.split('\n').length;
      } catch {
        return null;
      }
      return { file, lines };
    })
    .filter((entry) => entry !== null && entry.lines >= LINE_THRESHOLD)
    .sort((a, b) => b.lines - a.lines);

  if (sized.length === 0) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: ZERO_FINDINGS_VERIFIED,
      note: `Threshold: ${LINE_THRESHOLD}+ lines. No tracked src/**/*.ts(x) file reached it.`,
      evidenceCommand: `git ls-files -- 'src/**/*.ts' 'src/**/*.tsx' | xargs wc -l | sort -rn | head -20`,
    };
  }

  return {
    classId: CLASS_ID,
    title: TITLE,
    verdict: FINDINGS,
    note:
      `Threshold: ${LINE_THRESHOLD}+ lines, line count only (not a complexity metric).` +
      (sized.length > MAX_FINDINGS ? ` Showing top ${MAX_FINDINGS} of ${sized.length}.` : ''),
    evidenceCommand: `git ls-files -- 'src/**/*.ts' 'src/**/*.tsx' | xargs wc -l | sort -rn | head -20`,
    findings: sized.slice(0, MAX_FINDINGS).map((entry, i) => ({
      id: `${CLASS_ID}-${i}`,
      summary: `${entry.file} is ${entry.lines} lines`,
      detail: `${entry.lines} lines, threshold ${LINE_THRESHOLD}`,
      scope: entry.file,
      confidence: 'low', // size alone doesn't prove the file needs splitting
      sizeOfChange: 'large', // decomposing a 600+ line module is rarely small
      proposedPr: `Read ${entry.file} (${entry.lines} lines) for a natural seam (multiple unrelated exports, a large switch/if-chain) and split it if one exists; if it is one cohesive concern, leave it and note why in the PR that would have split it.`,
    })),
  };
}
