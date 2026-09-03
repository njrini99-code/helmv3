import { grep, lastCommitEpoch, daysSince } from '../lib/repo.mjs';
import { FINDINGS, ZERO_FINDINGS_VERIFIED } from '../lib/verdicts.mjs';

export const CLASS_ID = 'stale_todos';
export const TITLE = 'Stale TODO/FIXME/XXX markers';
const PATTERN = 'TODO|FIXME|XXX';
const STALE_DAYS = 180; // ~6 months with no touch to the file at all
const MAX_FINDINGS = 12;

/**
 * git-greps TODO/FIXME/XXX markers under src/, then ages each by the file's
 * last commit (`git log -1 --format=%ct`) — the "git log ages" signal named
 * in the plan. This is a FILE-level age, not a line-level one: git does not
 * cheaply expose "when did THIS LINE last change" without a full blame walk
 * per hit, and a marker inside a file nobody has touched in 180+ days is
 * already a defensible staleness signal on its own. Ranked oldest-file
 * first among the marker hits found.
 */
export function run({ repoRoot }) {
  const hits = grep(repoRoot, PATTERN, ['src/**/*.ts', 'src/**/*.tsx']);

  if (hits.length === 0) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: ZERO_FINDINGS_VERIFIED,
      evidenceCommand: `git grep -n -E '${PATTERN}' -- src/**/*.ts src/**/*.tsx`,
    };
  }

  const aged = hits
    .map((hit) => {
      const epoch = lastCommitEpoch(repoRoot, hit.file);
      return { ...hit, ageDays: daysSince(epoch) };
    })
    .filter((hit) => hit.ageDays !== null && hit.ageDays >= STALE_DAYS)
    .sort((a, b) => b.ageDays - a.ageDays);

  if (aged.length === 0) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: ZERO_FINDINGS_VERIFIED,
      note: `${hits.length} TODO/FIXME/XXX marker(s) found, but every containing file was touched within ${STALE_DAYS} days — none old enough to call stale by this heuristic.`,
      evidenceCommand: `git grep -n -E '${PATTERN}' -- src/**/*.ts src/**/*.tsx`,
    };
  }

  return {
    classId: CLASS_ID,
    title: TITLE,
    verdict: FINDINGS,
    note:
      `Staleness = the CONTAINING FILE's last commit age, not the marker line's — a cheap, defensible proxy, not exact.` +
      (aged.length > MAX_FINDINGS ? ` Showing top ${MAX_FINDINGS} of ${aged.length} by file age.` : ''),
    evidenceCommand: `git grep -n -E '${PATTERN}' -- src/**/*.ts src/**/*.tsx  # then: git log -1 --format=%ct -- <file>`,
    findings: aged.slice(0, MAX_FINDINGS).map((hit, i) => ({
      id: `${CLASS_ID}-${i}`,
      summary: `${hit.file}:${hit.lineNo} — file last touched ${hit.ageDays} days ago`,
      detail: hit.text.trim(),
      scope: hit.file,
      confidence: 'medium',
      sizeOfChange: 'small',
      proposedPr: `Read the TODO at ${hit.file}:${hit.lineNo} (file untouched ${hit.ageDays}d): resolve it, convert it to a tracked issue, or delete it if it no longer applies.`,
    })),
  };
}
