#!/usr/bin/env node
// .claude/hooks/restore-session-state.mjs — SessionStart, matcher `compact|resume`
//
// Reads back the per-session snapshot save-session-state.mjs (PreCompact)
// wrote to the OS scratch directory, and surfaces it as `additionalContext`
// when it exists, matches this session_id, and is under 24h old. Silent
// no-op otherwise — a missing or stale file is not an error, and this must
// never fail session start.
//
// The event name emitted in `hookSpecificOutput` is `SessionStart` — the
// real hook event this fires under. `PostCompact` is not a Claude Code hook
// event; an earlier draft of this file emitted that name, which no consumer
// recognizes.

import { readFileSync, statSync, existsSync } from 'node:fs';
import { scratchStatePath } from './save-session-state.mjs';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function readStdinJson() {
  return new Promise((resolvePromise) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      try {
        resolvePromise(JSON.parse(data || '{}'));
      } catch {
        resolvePromise({});
      }
    });
    process.stdin.on('error', () => resolvePromise({}));
  });
}

function emit(additionalContext) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext },
    }),
  );
}

/** Render the restored state as a single line of additionalContext, or null. */
export function renderContext(state) {
  if (!state) return null;
  const tailCount = Array.isArray(state.stateFileTail) ? state.stateFileTail.length : 0;
  return (
    `Restored pre-compaction session state (saved ${state.savedAt}): ` +
    `branch=${state.branch}, worktree=${state.worktree}, ` +
    `dirty=${state.dirtyFileCount ?? 'unknown'} file(s), ` +
    `openPRsByAuthor=${state.openPrNumbersByAuthor ?? 'unknown'}, ` +
    `stateTail=${tailCount} line(s).`
  );
}

async function run() {
  const input = await readStdinJson();
  const sessionId = input?.session_id || 'unknown';
  const statePath = scratchStatePath(sessionId);

  try {
    if (!existsSync(statePath)) {
      process.exit(0);
      return;
    }
    const st = statSync(statePath);
    if (Date.now() - st.mtimeMs > MAX_AGE_MS) {
      process.exit(0);
      return;
    }
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    const context = renderContext(state);
    if (context) emit(context);
  } catch {
    // SessionStart must never fail on a bad or missing state file.
  }
  process.exit(0);
}

import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
if (process.argv[1] && (() => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})()) {
  run().catch(() => process.exit(0));
}
