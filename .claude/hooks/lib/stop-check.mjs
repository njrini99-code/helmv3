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
import { readEvents, foldState } from './session-state.mjs';
import { getRegistry, isGoverned, isExcluded } from './feature-map.mjs';

async function main() {
  const sessionId = process.argv[2];
  const repoRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

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

  // 1. MAPPING: a touched file under a governed root with zero feature_ids
  //    and no acknowledged gap. In normal operation guard-feature-context.mjs
  //    already prevented this at edit time — this is a retroactive
  //    cross-check, not the primary enforcement point.
  const mappingGaps = touchedFiles
    .filter((f) => !isExcluded(f.path) && isGoverned(f.path) && f.feature_ids.length === 0)
    .filter((f) => !state.unmappedAcknowledged.has(f.path))
    .map((f) => f.path);

  // 2. CONTEXT: every feature_id a touch event carries must have a
  //    context_load event for that same feature_id at or before that touch's
  //    timestamp. Same cross-check relationship to guard-feature-context.mjs
  //    as the mapping check above.
  const contextGaps = [];
  for (const f of touchedFiles) {
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
  const touchedFeatureIds = [...new Set(touchedFiles.flatMap((f) => f.feature_ids))];
  const touchedPaths = new Set(touchedFiles.map((f) => f.path));
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

  // Bonus, cheap given the data is already here: evidence-based RLS/migration
  // and AUTOGEN-source reminders instead of the old unconditional boilerplate
  // text (audit flagged this as a real gap, optional for Phase 2 — building
  // it costs nothing extra once touchedFiles exists).
  const rlsRelevant = touchedFiles.some((f) => /^supabase\/migrations\//.test(f.path) || f.path.endsWith('.sql'));
  const autogenRelevant = touchedFiles.some(
    (f) =>
      f.path === 'src/lib/types/database.ts' ||
      f.path === 'src/lib/golf/surface-registry.ts' ||
      /^src\/app\/.*\/page\.tsx$/.test(f.path) ||
      /^src\/app\/.*\/actions\/.*\.ts$/.test(f.path) ||
      /^src\/hooks\/.*\.ts$/.test(f.path),
  );

  output({
    touchedFiles: touchedFiles.map((f) => f.path),
    touchedFeatureIds,
    mappingGaps,
    contextGaps,
    memoryGaps,
    noMemoryChangeReasons: state.noMemoryChangeReasons.map((r) => r.reason),
    rlsRelevant,
    autogenRelevant,
  });
}

function output(obj) {
  process.stdout.write(JSON.stringify(obj));
}

main().catch((err) => {
  // stop-verify.sh must degrade gracefully, not crash, if this analysis
  // fails — emit an empty-findings report rather than blocking the turn.
  output({ error: String(err?.message ?? err), touchedFiles: [] });
});
