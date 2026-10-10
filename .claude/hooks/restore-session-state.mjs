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

import { execFileSync } from 'node:child_process';
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

/**
 * Render the restored state as a single line of additionalContext, or null.
 *
 * session-context.sh already prints the live branch, dirty count and distance
 * from origin/main on every SessionStart, so this line adds only what that one
 * cannot know: when the snapshot was taken, the open PRs it recorded, how much
 * STATE tail was saved, and where the live checkout has MOVED since (branch or
 * worktree differing from the snapshot). `live` is `{ branch, worktree }` as
 * read now; without it nothing is claimed about drift.
 */
export function renderContext(state, live = {}) {
  if (!state) return null;
  const tailCount = Array.isArray(state.stateFileTail) ? state.stateFileTail.length : 0;
  const parts = [];
  if (live.branch && state.branch && live.branch !== state.branch) {
    parts.push(`branch was ${state.branch} at save, now ${live.branch}`);
  }
  if (live.worktree && state.worktree && live.worktree !== state.worktree) {
    parts.push(`worktree was ${state.worktree} at save`);
  }
  parts.push(`openPRsByAuthor=${state.openPrNumbersByAuthor ?? 'unknown'}`);
  parts.push(`stateTail=${tailCount} line(s)`);
  return `Restored pre-compaction session state (saved ${state.savedAt}): ${parts.join(', ')}.`;
}

function liveCheckout(cwd) {
  if (!cwd) return {};
  try {
    const branch = execFileSync('git', ['-C', cwd, 'branch', '--show-current'], {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const worktree = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return { branch, worktree };
  } catch {
    return {};
  }
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
    const context = renderContext(state, liveCheckout(input?.cwd));
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
