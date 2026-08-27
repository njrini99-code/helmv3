#!/usr/bin/env node
// .claude/hooks/lib/stop-check.mjs — Stop-time analysis, invoked by
// stop-verify.sh and consumed as JSON (stop-verify.sh stays bash for its
// proven loop-safety/exit-code machinery; this does the session-state-aware
// analysis that machinery didn't need to know about before).
//
// Usage: node .claude/hooks/lib/stop-check.mjs <session_id>
// Reads .claude/session-state/<session_id>.jsonl (already fully populated by
// the PreToolUse/PostToolUse hooks that ran during this session — this script
// does no mapping of its own beyond what those events already recorded,
// EXCEPT for governed/excluded classification, which must match
// guard-feature-context.mjs exactly and is shared from lib/feature-map.mjs
// for that reason).
//
// Outputs one JSON object to stdout, always exit 0 — this is a report, not a
// gate; stop-verify.sh makes the block/allow decision from its contents.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readEvents, foldState } from './session-state.mjs';
import { getRegistry, isGoverned, isExcluded } from './feature-map.mjs';
import { resolveActiveRoot } from './workspace-identity.mjs';

// Ledger-style files whose entries must carry an explicit YYYY-MM-DD date —
// owner directive, 2026-08-21: explicit dates on everything, applied here as
// a formatting invariant, not a new subsystem.
const LEDGER_PATTERNS = [
  /^memory\/ledgers\/changes\//,
  /^memory\/ledgers\/tests\//,
  /^memory\/incidents\/.*\/INC-/,
  /^memory\/decisions\/ADR-/,
];
const DATE_RE = /\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/;

async function main() {
  const sessionId = process.argv[2];
  // ACTIVE worktree. Verifying the wrong checkout is how a Stop gate passes
  // while the work it was meant to verify sits in another tree.
  const repoRoot = resolveActiveRoot();

  if (!sessionId) {
    output({ error: 'missing session_id argument', touchedFiles: [] });
    return;
  }

  const events = readEvents(repoRoot, sessionId);
  const state = foldState(events);
  const registry = await getRegistry(repoRoot);

  const touchedFiles = [...state.touchedFiles.entries()].map(([path, v]) => ({
    path,
    feature_ids: v.feature_ids,
    ts: v.ts,
  }));

  // DELEGATED vs VERIFIABLE. A file covered by a delegated_verification event
  // was already gated and CI-checked on a different session/branch (a
  // subagent's own PR, a teammate's worker session) — this session has no
  // local context to re-verify it and must not be asked to. Every downstream
  // gap check below operates on verifiableFiles only.
  const delegatedFiles = touchedFiles
    .filter((f) => state.delegatedVerifications.has(f.path))
    .map((f) => ({ path: f.path, ...state.delegatedVerifications.get(f.path) }));
  const delegatedPaths = new Set(delegatedFiles.map((f) => f.path));
  const verifiableFiles = touchedFiles.filter((f) => !delegatedPaths.has(f.path));

  // 1. MAPPING: a touched file under a governed root with zero feature_ids
  //    and no acknowledged gap. In normal operation guard-feature-context.mjs
  //    already prevented this at edit time — this is a retroactive
  //    cross-check, not the primary enforcement point.
  const mappingGaps = verifiableFiles
    .filter((f) => !isExcluded(f.path) && isGoverned(f.path) && f.feature_ids.length === 0)
    .filter((f) => !state.unmappedAcknowledged.has(f.path))
    .map((f) => f.path);

  // 2. CONTEXT: every feature_id a touch event carries must have a
  //    context_load event for that same feature_id at or before that touch's
  //    timestamp. Same cross-check relationship to guard-feature-context.mjs
  //    as the mapping check above.
  const contextGaps = [];
  for (const f of verifiableFiles) {
    for (const featureId of f.feature_ids) {
      const hasPriorLoad = state.contextLoadEvents.some(
        (e) => (e.feature_ids ?? []).includes(featureId) && e.ts <= f.ts,
      );
      if (!hasPriorLoad) contextGaps.push({ path: f.path, feature_id: featureId });
    }
  }

  // 3. MEMORY: for every DISTINCT feature_id touched this session, either its
  //    canonical doc was also touched this session, or a valid
  //    no_memory_change_reason event exists. Session-scoped, not
  //    per-feature-scoped — the spec/audit did not define a per-feature
  //    linkage for the reason event, so one valid reason event covers every
  //    feature touched this session. Documented simplification, not an
  //    oversight.
  const touchedFeatureIds = [...new Set(verifiableFiles.flatMap((f) => f.feature_ids))];
  const touchedPaths = new Set(verifiableFiles.map((f) => f.path));
  const hasAnyValidReason = state.noMemoryChangeReasons.length > 0;

  const memoryGaps = [];
  for (const featureId of touchedFeatureIds) {
    const feature = registry.features?.[featureId];
    const docPath = feature?.docs?.feature;
    const memoryTouched = docPath ? touchedPaths.has(docPath.replace(/^\.\//, '')) : false;
    if (!memoryTouched && !hasAnyValidReason) {
      memoryGaps.push({ feature_id: featureId, doc: docPath || `memory/features/${featureId}.md` });
    }
  }

  // 4. DATE: any touched ledger-style entry (memory/ledgers/changes,
  //    memory/ledgers/tests, memory/incidents/*/INC-*, memory/decisions/ADR-*)
  //    must carry an explicit YYYY-MM-DD date in its new content. Checked
  //    against the file's diff vs HEAD (added lines only) when it has git
  //    history; a brand-new/untracked file is checked in full, since every
  //    line in it is new from this session's perspective.
  const dateGaps = verifiableFiles.filter((f) => LEDGER_PATTERNS.some((re) => re.test(f.path))).filter(
    (f) => !hasDateInAddedContent(repoRoot, f.path),
  ).map((f) => f.path);

  // Bonus, cheap given the data is already here: evidence-based RLS/migration
  // and AUTOGEN-source reminders instead of the old unconditional boilerplate
  // text (audit flagged this as a real gap, optional for Phase 2 — building
  // it costs nothing extra once touchedFiles exists).
  const rlsRelevant = verifiableFiles.some((f) => /^supabase\/migrations\//.test(f.path) || f.path.endsWith('.sql'));
  const autogenRelevant = verifiableFiles.some(
    (f) =>
      f.path === 'src/lib/types/database.ts' ||
      f.path === 'src/lib/golf/surface-registry.ts' ||
      /^src\/app\/.*\/page\.tsx$/.test(f.path) ||
      /^src\/app\/.*\/actions\/.*\.ts$/.test(f.path) ||
      /^src\/hooks\/.*\.ts$/.test(f.path),
  );

  output({
    touchedFiles: touchedFiles.map((f) => f.path),
    verifiableFiles: verifiableFiles.map((f) => f.path),
    delegatedFiles,
    touchedFeatureIds,
    mappingGaps,
    contextGaps,
    memoryGaps,
    dateGaps,
    noMemoryChangeReasons: state.noMemoryChangeReasons.map((r) => r.reason),
    rlsRelevant,
    autogenRelevant,
  });
}

/** Added lines vs HEAD contain a date; falls back to full-content check for
 * a file with no git history yet (brand new, never `git add`ed). */
function hasDateInAddedContent(repoRoot, relPath) {
  try {
    const diff = execFileSync('git', ['diff', 'HEAD', '--', relPath], { cwd: repoRoot, encoding: 'utf8' });
    if (diff.trim()) {
      const addedLines = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
      return addedLines.some((l) => DATE_RE.test(l));
    }
  } catch {
    // No HEAD yet, or git unavailable — fall through to the full-file check.
  }
  const abs = join(repoRoot, relPath);
  if (!existsSync(abs)) return true; // deleted/moved since — nothing to check, don't false-block
  try {
    return DATE_RE.test(readFileSync(abs, 'utf8'));
  } catch {
    return true; // unreadable — don't false-block on an I/O error
  }
}

function output(obj) {
  process.stdout.write(JSON.stringify(obj));
}

main().catch((err) => {
  // stop-verify.sh must degrade gracefully, not crash, if this analysis
  // fails — emit an empty-findings report rather than blocking the turn.
  output({ error: String(err?.message ?? err), touchedFiles: [] });
});
