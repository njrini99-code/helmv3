import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { FINDINGS, ZERO_FINDINGS_VERIFIED, NO_SIGNAL } from '../lib/verdicts.mjs';

export const CLASS_ID = 'orphan_routes_actions';
export const TITLE = 'Orphan routes / unreachable components';
const MAX_FINDINGS = 10;

const COUNT_LINE = /^UNREACHABLE component files\s*:\s*(\d+)/m;

/**
 * Reuses `npm run orphans:mounts` (scripts/find-orphan-mounts.mjs) rather
 * than re-implementing its render-graph walk. That script's own header is
 * explicit: "Read the output, don't gate on it" and documents three known
 * false-positive modes (non-literal mount names, a comment-stripper edge
 * case, /vizlab-only components) — every finding from this class is marked
 * confidence: medium for exactly that reason, never high.
 */
export function run({ repoRoot }) {
  const scriptPath = join(repoRoot, 'scripts', 'find-orphan-mounts.mjs');
  let stdout;
  try {
    stdout = execFileSync('node', [scriptPath], { cwd: repoRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: NO_SIGNAL,
      note: `scripts/find-orphan-mounts.mjs failed to run: ${err.message}`,
      evidenceCommand: 'npm run orphans:mounts',
    };
  }

  const match = COUNT_LINE.exec(stdout);
  if (!match) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: NO_SIGNAL,
      note: 'scripts/find-orphan-mounts.mjs ran but its output did not match the expected "UNREACHABLE component files : N" line — its output format may have changed.',
      evidenceCommand: 'npm run orphans:mounts',
    };
  }

  const count = Number(match[1]);
  if (count === 0) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: ZERO_FINDINGS_VERIFIED,
      evidenceCommand: 'npm run orphans:mounts',
    };
  }

  const files = stdout
    .split('\n')
    .filter((line) => line.startsWith('  src/'))
    .map((line) => line.trim());

  return {
    classId: CLASS_ID,
    title: TITLE,
    verdict: FINDINGS,
    note:
      `${count} unreachable component file(s) reported. This detector is "deliberately conservative" per its own header ` +
      'but still carries named false-positive modes (non-literal mount names, /vizlab-only components) — verify each before deleting.' +
      (count > MAX_FINDINGS ? ` Showing top ${MAX_FINDINGS} of ${count}.` : ''),
    evidenceCommand: 'npm run orphans:mounts',
    findings: files.slice(0, MAX_FINDINGS).map((file, i) => ({
      id: `${CLASS_ID}-${i}`,
      summary: `${file} is not reachable from any Next.js route root`,
      detail: file,
      scope: file,
      confidence: 'medium',
      sizeOfChange: 'small',
      proposedPr: `Confirm ${file} is genuinely unmounted (check for a non-literal mount, e.g. COMPONENT_MAP[key], and whether it's only reachable from /vizlab or /fairway-preview by design) and either wire it into a real route or delete it.`,
    })),
  };
}
