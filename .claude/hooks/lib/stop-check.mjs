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
//
// HISTORY IS NOT THE QUEUE (Phase 7B, 2026-08-28). The session ledger's
// touchedFiles Map only ever grows — session-state.mjs has no delete, expire
// or prune path of any kind, by design, because it is append-only evidence of
// what happened. Using that Map directly as the verification queue conflated
// two different questions, and the gate kept demanding `npm test` for work
// that had already merged. Measured on the live ledger the day this was
// written: 9 unique touched paths, 9 of them byte-identical to origin/main,
// two of those deleted on BOTH sides — and all 9 still demanded. One,
// src/test/hooks/guard-bash-worktree.test.ts, had been deleted in #1641 and
// existed in neither the working tree nor main.
//
//     touchedFiles              which paths did this session touch   HISTORY
//     outstandingTouchedFiles   which of them still differ from
//                               origin/main RIGHT NOW                CURRENT
//
// So the fold stays append-only and this file reconciles it against current
// truth at READ time. Deliberately NOT a durable `touch_retired` event: that
// would record "settled at time T", which is false the moment the path
// diverges again — the same staleness bug one layer up, needing an
// invalidation protocol of its own. A derived answer just returns the new
// answer (case F in stop-touch-reconciliation.test.ts pins exactly that).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readEvents, foldState } from './session-state.mjs';
import { getRegistry, isGoverned, isExcluded } from './feature-map.mjs';
import { workspaceIdentity } from './workspace-identity.mjs';

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
  // ACTIVE worktree + integration reference, from the ONE authority that owns
  // both. `baseRef`/`baseSha` are consumed, never re-derived here: a second
  // base policy is how "which trunk are we measuring against" drifted before.
  // Note it is origin/main, not local main — local main can itself be stale,
  // and it never fetches, so Stop stays offline.
  const identity = workspaceIdentity();
  const repoRoot = identity.root;

  if (!sessionId) {
    output({ error: 'missing session_id argument', touchedFiles: [], outstandingTouchedFiles: [], settledTouchedFiles: [] });
    return;
  }

  const events = readEvents(repoRoot, sessionId);
  const state = foldState(events);
  const registry = await getRegistry(repoRoot);

  // HISTORICAL — every path this session ever touched. Never filtered.
  const touchedFiles = [...state.touchedFiles.entries()].map(([path, v]) => ({
    path,
    feature_ids: v.feature_ids,
    ts: v.ts,
  }));

  // OUTSTANDING vs SETTLED — reconciled against current truth, see header.
  const { outstanding, settled, unknown } = reconcile(
    repoRoot,
    identity.baseSha,
    touchedFiles.map((f) => f.path),
  );
  const outstandingPaths = new Set(outstanding);
  const outstandingFiles = touchedFiles.filter((f) => outstandingPaths.has(f.path));

  // DELEGATED vs VERIFIABLE. A file covered by a delegated_verification event
  // was already gated and CI-checked on a different session/branch (a
  // subagent's own PR, a teammate's worker session) — this session has no
  // local context to re-verify it and must not be asked to. Every downstream
  // gap check below operates on verifiableFiles only.
  //
  // Derived from OUTSTANDING, not from history: once a path matches the
  // integration ref it is nobody's verification problem, delegated or not, and
  // stop-verify.sh's "N file(s) are DELEGATED" note must not list it.
  //
  // And bounded IN TIME (Phase 7C) — see `delegationCovers`.
  const delegatedFiles = outstandingFiles
    .filter((f) => delegationCovers(state.delegatedVerifications.get(f.path), f.ts))
    .map((f) => ({ path: f.path, ...state.delegatedVerifications.get(f.path) }));
  const delegatedPaths = new Set(delegatedFiles.map((f) => f.path));
  const verifiableFiles = outstandingFiles.filter((f) => !delegatedPaths.has(f.path));

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
    outstandingTouchedFiles: outstandingFiles.map((f) => f.path),
    settledTouchedFiles: settled,
    baseRef: identity.baseRef,
    baseSha: identity.baseSha,
    reconciliationUnknown: unknown,
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

/**
 * Does this delegation still cover the work currently on the path?
 *
 * A `delegated_verification` says "a different session's PR already gated and
 * CI-checked this path". That is a claim about the work AS IT STOOD when the
 * event was written — it says nothing about whatever gets written next. Before
 * Phase 7C the mere existence of the event suppressed the path forever, which
 * was reproduced on real events (2026-08-28):
 *
 *     10:00  touch P
 *     10:05  delegated_verification P
 *     18:00  touch P again, brand-new unverified content
 *            -> outstanding (correct) but NOT verifiable (wrong)
 *
 * Eight hours later, a delegation was still silencing the gate for work it
 * never saw. It is the same staleness Phase 7B declined to introduce with a
 * `touch_retired` event — except this one already existed.
 *
 * The fix needs no new event and no new clock. `foldState` already keeps
 * last-write-wins timestamps on both sides, so the LATEST touch and the LATEST
 * delegation are both in hand and the answer is derivable from event order:
 *
 *     latestTouch <= delegatedAt   still covered
 *     latestTouch >  delegatedAt   stale; the path stays verifiable
 *
 * Self-correcting, exactly like Phase 7B: re-delegating after the new touch
 * makes the delegation newer again, with no invalidation protocol to run.
 *
 * Either timestamp missing or unparseable => NOT covered. A delegation that
 * cannot prove it is newer than the work has not earned the right to silence
 * the gate, and this is a suppression path — the direction to fail is toward
 * verifying.
 */
function delegationCovers(delegation, latestTouchTs) {
  if (!delegation) return false;
  const delegatedAt = Date.parse(delegation.ts ?? '');
  const touchedAt = Date.parse(latestTouchTs ?? '');
  if (!Number.isFinite(delegatedAt) || !Number.isFinite(touchedAt)) return false;
  return touchedAt <= delegatedAt;
}

// ---------------------------------------------------------------------------
// Reconciliation: historical touch set -> what is still different RIGHT NOW.
//
// Three settled reasons, and no more. Each is a statement about current truth
// that is recomputed on every read, so none of them can go stale.
const SETTLED_MATCHES = 'matches_integration_ref';
const SETTLED_ABSENT = 'absent_in_workspace_and_integration_ref';
const SETTLED_IGNORED = 'ignored_by_git';

/**
 * Git pathspecs are NOT literal paths, and this repo's route tree contains
 * real files like `feature-a-[id].ts`.
 *
 * Measured on git 2.55 rather than assumed: a bare `[id]` pathspec does NOT
 * miss the literal file — git matches it literally AND as a character class,
 * so `a/feature-[id].ts` also drags in `a/feature-i.ts`. It over-matches.
 *
 * That over-match cannot change a verdict below, because every probe is read
 * as "is THIS path among the names git printed", never as "did the pathspec
 * produce output" — an extra name in the set is simply never queried. So
 * `:(literal)` is hardening, not a live bug fix, and an injection removing it
 * correctly leaves the suite green.
 *
 * It stays anyway: it makes each probe do only the work asked of it, and it
 * removes the footgun for whoever later rewrites one of these three probes in
 * terms of output emptiness, where the over-match WOULD flip results.
 */
function literalSpecs(paths) {
  return paths.map((p) => `:(literal)${p}`);
}

/** NUL-delimited git output. THROWS on git failure — callers treat that as
 * UNKNOWN rather than reading a failed command as "no differences". */
function gitZ(root, args) {
  const out = execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 32 * 1024 * 1024,
  });
  return new Set(out.split('\0').filter(Boolean));
}

/**
 * Which of `paths` exist in the base commit.
 *
 * `cat-file --batch-check` rather than `ls-tree -- <pathspec>` on purpose:
 * it takes literal `<sha>:<path>` on stdin with no pathspec semantics to get
 * wrong, and emits exactly one line per input line in order — `<oid> <type>
 * <size>` when present, `<input> missing` when not.
 */
function baseMembership(root, baseSha, paths) {
  const out = execFileSync('git', ['cat-file', '--batch-check'], {
    cwd: root,
    input: `${paths.map((p) => `${baseSha}:${p}`).join('\n')}\n`,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
    maxBuffer: 32 * 1024 * 1024,
  });
  const lines = out.split('\n').filter(Boolean);
  const present = new Set();
  lines.forEach((line, i) => {
    if (!/\smissing$/.test(line) && paths[i] !== undefined) present.add(paths[i]);
  });
  return present;
}

/**
 * Classify each touched path as OUTSTANDING or SETTLED against the
 * integration ref.
 *
 * UNKNOWN — the ref will not resolve, or a git command fails — is folded into
 * OUTSTANDING, never into SETTLED. Failing the other way would make every
 * misconfigured checkout a silently green gate, which is the one outcome a
 * verification gate must never produce.
 *
 * Three probes, batched (four git invocations total regardless of how many
 * paths, instead of three per path):
 *
 *   base -> worktree   catches ordinary edits, and local-only deletions
 *   base -> index      catches a staged change whose worktree copy was
 *                      restored to the ref's content
 *   untracked          catches brand-new files, which NEITHER diff can see —
 *                      `git diff <ref> -- <path>` reports nothing for a file
 *                      git does not track, so a classifier built on diff
 *                      alone settles new work. That is the most dangerous
 *                      false negative available here, since unverified new
 *                      code is precisely what the gate exists for.
 *
 * `--name-only` output emptiness, never `--quiet`'s exit code: `--quiet` skips
 * the content comparison and can report a difference from stale stat metadata
 * alone. That artifact was observed on workspace-identity.mjs while
 * `git diff --stat` was empty, and a classifier inheriting it would call a
 * settled file outstanding forever.
 */
function reconcile(root, baseSha, paths) {
  if (paths.length === 0) return { outstanding: [], settled: [], unknown: false };
  // No integration ref (no remote, never fetched, renamed trunk) — cannot
  // compare, so nothing may be dropped.
  if (!baseSha) return { outstanding: [...paths], settled: [], unknown: true };

  let inBase;
  let diffWorktree;
  let diffIndex;
  let untracked;
  try {
    const specs = literalSpecs(paths);
    inBase = baseMembership(root, baseSha, paths);
    diffWorktree = gitZ(root, ['diff', '--name-only', '-z', baseSha, '--', ...specs]);
    diffIndex = gitZ(root, ['diff', '--name-only', '-z', '--cached', baseSha, '--', ...specs]);
    untracked = gitZ(root, ['ls-files', '-z', '--others', '--exclude-standard', '--', ...specs]);
  } catch {
    return { outstanding: [...paths], settled: [], unknown: true };
  }

  const outstanding = [];
  const settled = [];
  for (const p of paths) {
    if (diffWorktree.has(p) || diffIndex.has(p) || untracked.has(p)) {
      outstanding.push(p);
    } else if (inBase.has(p)) {
      settled.push({ path: p, reason: SETTLED_MATCHES });
    } else if (!existsSync(join(root, p))) {
      // In neither place. The real guard-bash-worktree.test.ts shape: touched,
      // then deleted by a PR that merged.
      settled.push({ path: p, reason: SETTLED_ABSENT });
    } else {
      // Present locally, absent from the ref, and invisible to
      // `ls-files --others --exclude-standard` — which leaves exactly one
      // explanation: git ignores it. record-session-touch.mjs filters only on
      // isWithinRepo, so an in-repo ignored path can reach the ledger. It can
      // never appear in a PR, so it is not a verification demand; but calling
      // it `matches_integration_ref` would be a lie, since it is in no ref.
      settled.push({ path: p, reason: SETTLED_IGNORED });
    }
  }
  return { outstanding, settled, unknown: false };
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
  output({ error: String(err?.message ?? err), touchedFiles: [], outstandingTouchedFiles: [], settledTouchedFiles: [] });
});
