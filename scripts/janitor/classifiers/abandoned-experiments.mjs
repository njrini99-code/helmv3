import { grep } from '../lib/repo.mjs';
import { FINDINGS, ZERO_FINDINGS_VERIFIED } from '../lib/verdicts.mjs';

export const CLASS_ID = 'abandoned_experiments';
export const TITLE = 'Abandoned experiments (expired removal dates / EXPERIMENT markers)';
// [0-9], not \d: `git grep -E` uses POSIX Extended Regular Expressions,
// which do not support Perl-style \d — it silently matches nothing rather
// than erroring, so this is a false-ZERO trap of exactly the kind
// .claude/rules/feedback_semgrep_false_zero_traps.md warns about for a
// different tool. Caught by scripts/janitor/__tests__/classifiers-grep.test.mjs.
const MARKER_PATTERN = 'EXPERIMENTAL?|remove (after|by) [0-9]{4}-[0-9]{2}-[0-9]{2}';
const DATE_RE = /(?:remove (?:after|by) )(\d{4}-\d{2}-\d{2})/i; // JS regex — \d IS supported here
const MAX_FINDINGS = 12;

/**
 * Two sub-signals, both grep-only (no filesystem walk, no external tool):
 *   1. A literal EXPERIMENT/EXPERIMENTAL marker anywhere in src/ — flagged
 *      always, at low confidence, since it names itself as provisional.
 *   2. A "remove after/by YYYY-MM-DD" comment whose date has already
 *      passed — flagged at high confidence, since a previous author
 *      already committed to a specific removal date and it lapsed.
 * This class always produces a definitive answer (the grep either matches
 * or it doesn't), so unlike dead-flags/unused-tests it is never NO_SIGNAL —
 * there is no missing substrate here, only "checked, found nothing" or
 * "checked, found something".
 */
export function run({ repoRoot }) {
  const hits = grep(repoRoot, MARKER_PATTERN, ['src/**/*.ts', 'src/**/*.tsx'], { caseInsensitive: true });

  if (hits.length === 0) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: ZERO_FINDINGS_VERIFIED,
      evidenceCommand: `git grep -n -i -E '${MARKER_PATTERN}' -- src/**/*.ts src/**/*.tsx`,
    };
  }

  const today = new Date();
  const findings = hits.map((hit, i) => {
    const dateMatch = DATE_RE.exec(hit.text);
    const isExpired = dateMatch ? new Date(dateMatch[1]) < today : false;
    return {
      id: `${CLASS_ID}-${i}`,
      summary: dateMatch
        ? `${hit.file}:${hit.lineNo} — removal date ${dateMatch[1]}${isExpired ? ' has PASSED' : ' has not passed yet'}`
        : `${hit.file}:${hit.lineNo} — EXPERIMENT(AL) marker, no removal date given`,
      detail: hit.text.trim(),
      scope: hit.file,
      confidence: isExpired ? 'high' : 'low',
      sizeOfChange: 'small',
      proposedPr: isExpired
        ? `The removal date at ${hit.file}:${hit.lineNo} (${dateMatch[1]}) has passed — decide to actually remove the experiment or update the date with a reason.`
        : `Confirm whether the experiment at ${hit.file}:${hit.lineNo} is still active; if abandoned, remove it and give it a real removal date if it should stay a little longer.`,
      _expired: isExpired,
    };
  });

  // Only the expired ones are proposed as PRs at high confidence — the rest
  // are still reported (this class is exhaustive over what it can see) but
  // ranked low, since a bare EXPERIMENT marker with no date is not evidence
  // of abandonment, only of "this was provisional at some point".
  const filtered = findings
    .sort((a, b) => Number(b._expired) - Number(a._expired))
    .map(({ _expired, ...f }) => f);

  return {
    classId: CLASS_ID,
    title: TITLE,
    verdict: FINDINGS,
    note: filtered.length > MAX_FINDINGS ? `Showing top ${MAX_FINDINGS} of ${filtered.length} (expired-date markers first).` : undefined,
    evidenceCommand: `git grep -n -i -E '${MARKER_PATTERN}' -- src/**/*.ts src/**/*.tsx`,
    findings: filtered.slice(0, MAX_FINDINGS),
  };
}
