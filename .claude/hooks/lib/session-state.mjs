// .claude/hooks/lib/session-state.mjs — session-owned event ledger.
//
// Each Claude session gets an append-only JSONL file at
// .claude/session-state/<session_id>.jsonl (gitignored). This replaces
// stop-verify.sh's old git-diff attribution: a PostToolUse hook that fires at
// the moment of a successful write knows with certainty which session wrote
// which file, where `git status --porcelain` fundamentally cannot (it sees a
// dirty tree shared by every session in this checkout, never who dirtied it).
//
// WHY APPEND-ONLY, NOT A MUTABLE JSON OBJECT (spec §8 says "<session_id>.json",
// singular record — this is a deliberate deviation, not a typo):
// Claude Code's PostToolUse hook "fires once per tool, which means it fires
// concurrently when Claude makes parallel tool calls" (confirmed from the
// live hooks docs). A read-JSON -> mutate -> write-JSON hook on one shared
// file has a real lost-update race the moment two Read or Edit calls land in
// the same turn — not theoretical, the audit that designed this reproduced it
// with its own tool calls. A single `appendFileSync` of one short JSON line
// is atomic on the filesystems this repo runs on and needs no lock file (no
// `flock` binary on macOS by default, and getting a lock protocol right on
// both macOS and Linux CI is exactly the kind of thing not to build when the
// append-only shape sidesteps the problem entirely). Consumers fold the log
// into derived state at READ time instead — cheap at realistic session sizes
// (hundreds of lines, not millions).
//
// Every event carries `schema: 1` and `ts` so a future consumer (the
// Autonomy Control Plane's flight recorder, still pending — see
// docs/ai-system/HELM_AUTONOMY_CONTROL_PLANE.md) can extend the event
// vocabulary without breaking this reader: unknown event `type`s are kept in
// the raw log and simply ignored by foldState below, never rejected.
import { appendFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SCHEMA = 1;

export function sessionStatePath(repoRoot, sessionId) {
  return join(repoRoot, '.claude/session-state', `${safeId(sessionId)}.jsonl`);
}

function safeId(sessionId) {
  return String(sessionId || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_');
}

/** One atomic O_APPEND write per event. Never read-modify-write. */
export function appendEvent(repoRoot, sessionId, event) {
  const path = sessionStatePath(repoRoot, sessionId);
  mkdirSync(dirname(path), { recursive: true });
  const line = `${JSON.stringify({ schema: SCHEMA, ts: new Date().toISOString(), ...event })}\n`;
  appendFileSync(path, line, { encoding: 'utf8', flag: 'a' });
}

/**
 * Tolerant reader. A session-state file is diagnostic state, not a database:
 * one torn/malformed line (e.g. a write that raced a process kill) must not
 * take down every hook that reads it, so a bad line is skipped, not thrown.
 */
export function readEvents(repoRoot, sessionId) {
  const path = sessionStatePath(repoRoot, sessionId);
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf8');
  const events = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // Skip malformed line — see note above.
    }
  }
  return events;
}

/** Fold the raw event log into the derived state every consumer needs. */
export function foldState(events) {
  const loadedFeatureIds = new Set();
  const contextLoadEvents = [];
  const unmappedAcknowledged = new Set();
  const touchedFiles = new Map(); // path -> {feature_ids, ts}
  const noMemoryChangeReasons = [];
  let sessionStart = null;

  for (const e of events) {
    switch (e && e.type) {
      case 'session_start':
        sessionStart = e;
        break;
      case 'context_load':
        contextLoadEvents.push(e);
        for (const id of e.feature_ids ?? []) loadedFeatureIds.add(id);
        if (e.unmapped && e.path) unmappedAcknowledged.add(e.path);
        break;
      case 'touch':
        touchedFiles.set(e.path, { feature_ids: e.feature_ids ?? [], ts: e.ts });
        break;
      case 'no_memory_change':
        noMemoryChangeReasons.push(e);
        break;
      default:
        // Unknown/future event type — preserved in the raw log, ignored here.
        break;
    }
  }

  return {
    sessionStart,
    loadedFeatureIds,
    contextLoadEvents,
    unmappedAcknowledged,
    touchedFiles,
    noMemoryChangeReasons,
  };
}

// Spec §12's enum, verbatim. The Stop gate rejects any reason not in this list
// (and rejects a bare "not needed" outright — there is no such reason here).
export const VALID_NO_MEMORY_CHANGE_REASONS = [
  'format-only',
  'generated-file-refresh',
  'test-only-no-contract-change',
  'comment-correction',
  'mechanical-refactor-with-proven-equivalent-behavior',
];
