import { grep } from '../lib/repo.mjs';
import { FINDINGS, ZERO_FINDINGS_VERIFIED, NO_SIGNAL } from '../lib/verdicts.mjs';

export const CLASS_ID = 'duplicate_telemetry';
export const TITLE = 'Duplicate telemetry event names';
// posthog.capture('event_name', ...) / analytics.track('event_name', ...) —
// deliberately scoped to literal-string event names; a template-literal or
// variable event name is invisible to this regex by construction (same
// caveat scripts/find-orphan-mounts.mjs documents for non-literal names).
const PATTERN = "\\.(capture|track)\\(\\s*['\"]([^'\"]+)['\"]";
const LITERAL_RE = /\.(capture|track)\(\s*['"]([^'"]+)['"]/;
// The real PATTERN embeds both quote characters, which is not safely
// copy-pasteable into a shell inside a double-quoted -E argument (the
// embedded `"` closes the outer quoting early). The internal grep() call
// above is unaffected — it passes PATTERN as an execFileSync ARRAY element,
// never through a shell — but the human-facing evidenceCommand needs a
// command a person can actually paste, so it uses a simpler, safe -F search
// for the call prefix instead of reproducing the exact capture regex.
const EVIDENCE_COMMAND =
  "git grep -n -E \"\\.(capture|track)\\(\" -- src/**/*.ts src/**/*.tsx  # then check each hit's string-literal argument for repeats";

/**
 * Finds telemetry event NAMES (PostHog `.capture('name', ...)`, generic
 * `.track('name', ...)`) hard-coded identically in two or more different
 * files — the copy-paste pattern that later drifts into two payload shapes
 * for "the same" event. This repo's PostHog wiring is thin today (per the
 * plan's own EXISTS/MISSING ledger: "pageviews + one demo event") — a
 * single-callsite result is expected, not a bug in this classifier.
 */
export function run({ repoRoot }) {
  const hits = grep(repoRoot, PATTERN, ['src/**/*.ts', 'src/**/*.tsx']);

  if (hits.length === 0) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: NO_SIGNAL,
      note: 'No .capture(\'literal\') / .track(\'literal\') call found under src/ — no telemetry-event-name convention exists to check for duplicates.',
      evidenceCommand: EVIDENCE_COMMAND,
    };
  }

  const byName = new Map();
  for (const hit of hits) {
    const m = LITERAL_RE.exec(hit.text);
    if (!m) continue;
    const name = m[2];
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(hit);
  }

  const dupes = [...byName.entries()].filter(([, occurrences]) => {
    const files = new Set(occurrences.map((o) => o.file));
    return files.size >= 2;
  });

  if (dupes.length === 0) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: ZERO_FINDINGS_VERIFIED,
      note: `${hits.length} literal telemetry call(s) found across ${byName.size} distinct event name(s); none repeated across more than one file.`,
      evidenceCommand: EVIDENCE_COMMAND,
    };
  }

  return {
    classId: CLASS_ID,
    title: TITLE,
    verdict: FINDINGS,
    evidenceCommand: EVIDENCE_COMMAND,
    findings: dupes.map(([name, occurrences], i) => ({
      id: `${CLASS_ID}-${i}`,
      summary: `Event name "${name}" is fired from ${new Set(occurrences.map((o) => o.file)).size} different files`,
      detail: occurrences.map((o) => `${o.file}:${o.lineNo}`).join(', '),
      scope: occurrences[0].file,
      confidence: 'medium',
      sizeOfChange: 'small',
      proposedPr: `Centralize the "${name}" event name into one exported constant and import it at every call site (${occurrences.map((o) => o.file).join(', ')}) so its payload shape cannot drift between copies.`,
    })),
  };
}
