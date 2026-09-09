#!/usr/bin/env node
// .claude/hooks/require-gates.mjs — Stop
//
// ADVISORY ONLY: always exits 0 and never emits a turn-blocking JSON
// decision — it cannot refuse the end of a turn, only print a one-line
// reminder to stderr.
// Fires when this is a task worktree (not the canonical checkout) with
// tracked-file modifications and no entry in the gates ledger
// (`.helm/runtime/gates.jsonl`) newer than the newest modified tracked
// file. Silent otherwise.
//
// One JSON object per line, each carrying at least `ts` as an epoch-millisecond
// number (the serializer's native format) or ISO-8601 timestamp. This hook
// only reads the local runtime telemetry.
//
// TRACKED FILES ONLY: `git diff --name-only HEAD` (working tree vs HEAD,
// covers both staged and unstaged modifications to tracked files) — not raw
// `git status --porcelain`, which also lists untracked files that were never
// meant to trigger a gates reminder.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { workspaceRoots } from './lib/workspace-identity.mjs';

const GATES_LEDGER = '.helm/runtime/gates.jsonl';

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

/** Tracked files modified relative to HEAD (staged + unstaged), repo-relative. */
export function trackedModifiedFiles(root) {
  const out = git(['diff', '--name-only', 'HEAD'], root);
  return (out || '').split('\n').filter(Boolean);
}

function newestMtime(paths, root) {
  let newest = null;
  for (const p of paths) {
    try {
      const st = statSync(join(root, p));
      if (!newest || st.mtimeMs > newest) newest = st.mtimeMs;
    } catch {
      // file may have been deleted since git reported it
    }
  }
  return newest;
}

/** Newest `ts` across the gates ledger's lines, in epoch ms, or null. */
export function newestLedgerEntryMs(root, ledgerPath = GATES_LEDGER) {
  const abs = join(root, ledgerPath);
  if (!existsSync(abs)) return null;
  let text;
  try {
    text = readFileSync(abs, 'utf-8');
  } catch {
    return null;
  }
  let newest = null;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      const raw = entry?.ts;
      const ms = typeof raw === 'number' ? raw : Date.parse(raw);
      if (Number.isFinite(ms) && (newest === null || ms > newest)) newest = ms;
    } catch {
      // skip a malformed line — this ledger is diagnostic, not a database
    }
  }
  return newest;
}

async function run() {
  const input = await readStdinJson();

  try {
    const { activeRoot: root, kind } = workspaceRoots(input);

    // Only a task worktree, never the canonical checkout — mutating work
    // (and the gates that verify it) belongs in a worktree, and this
    // reminder is about verifying a task's changes before it lands.
    if (kind !== 'task') {
      process.exit(0);
      return;
    }

    const modified = trackedModifiedFiles(root);
    if (modified.length === 0) {
      process.exit(0);
      return;
    }

    const newestEdit = newestMtime(modified, root);
    const newestGate = newestLedgerEntryMs(root);

    if (newestGate === null || (newestEdit !== null && newestGate < newestEdit)) {
      process.stderr.write(
        `require-gates: advisory — ${modified.length} tracked file(s) modified with no ` +
          `${GATES_LEDGER} entry newer than the last edit. Run the gates before landing.\n`,
      );
    }
  } catch {
    // Advisory only — never let an internal error look like anything else.
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
