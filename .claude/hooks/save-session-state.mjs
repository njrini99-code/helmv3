#!/usr/bin/env node
// .claude/hooks/save-session-state.mjs — PreCompact
//
// Compaction throws away the transcript. This snapshots the facts a resumed
// session needs to reorient — branch, how many files are dirty, this
// session's own STATE file tail, and (best-effort) open PR numbers — to a
// PER-SESSION file under the OS scratch directory, keyed by session_id so
// concurrent sessions never collide and a restart of the SAME session can
// still find its own snapshot. restore-session-state.mjs reads it back on
// the next SessionStart(compact|resume) and hands it back as
// `additionalContext`.
//
// WHY THE OS TMPDIR AND NOT `.helm/session-state.json` IN THE WORKTREE: the
// worktree is shared across however many sessions have it open, and a single
// path there is exactly the shared-mutable-state race this repo's other
// session-state file (.claude/hooks/lib/session-state.mjs) was designed
// around avoiding. Keying by session_id under `os.tmpdir()` gives each
// session its own file with no lock needed.
//
// NO NETWORK: "open PR numbers by this author" would need `gh pr list`,
// which is a network call. This hook deliberately does not make one —
// PreCompact must never risk hanging compaction on a network round trip, and
// the async-ledger rule this repo follows elsewhere (write-and-exit, no
// network) applies in spirit here even though this isn't a ledger append.
// The field is recorded as unavailable, with the reason, rather than
// silently omitted or guessed.
//
// Never blocks compaction — any failure here degrades to no state saved,
// never a thrown error.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveActiveRoot } from './lib/workspace-identity.mjs';
import { sessionStatePath } from './lib/session-state.mjs';

const SCRATCH_DIR = join(tmpdir(), 'helm-session-state');

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

function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function safeId(sessionId) {
  return String(sessionId || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_');
}

/** The per-session scratch file this hook writes and restore-session-state.mjs reads. */
export function scratchStatePath(sessionId) {
  return join(SCRATCH_DIR, `${safeId(sessionId)}.json`);
}

/** Last `n` non-empty lines of this session's STATE (JSONL event log), or []. */
export function tailStateFile(repoRoot, sessionId, n = 20) {
  const path = sessionStatePath(repoRoot, sessionId);
  if (!existsSync(path)) return [];
  try {
    const lines = readFileSync(path, 'utf-8').split('\n').filter((l) => l.trim());
    return lines.slice(-n);
  } catch {
    return [];
  }
}

async function run() {
  const input = await readStdinJson();
  const root = resolveActiveRoot(input);
  const sessionId = input?.session_id || 'unknown';

  try {
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], root);
    const statusRaw = git(['status', '--porcelain'], root) || '';
    const dirtyFileCount = statusRaw.split('\n').filter(Boolean).length;
    const stateTail = tailStateFile(root, sessionId, 20);

    const state = {
      schema: 1,
      savedAt: new Date().toISOString(),
      sessionId,
      branch,
      worktree: root,
      dirtyFileCount,
      // No network call from this hook — see header. A resumed session can
      // run `gh pr list --author @me --state open` itself if it needs this.
      openPrNumbersByAuthor: null,
      openPrNumbersByAuthorNote: 'not collected — hooks avoid network calls (see file header)',
      stateFileTail: stateTail,
    };

    mkdirSync(SCRATCH_DIR, { recursive: true });
    writeFileSync(scratchStatePath(sessionId), JSON.stringify(state, null, 2));
  } catch {
    // PreCompact must never block compaction.
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
