#!/usr/bin/env node
// scripts/run-bounded.mjs — run a command under a wall-clock deadline that
// bounds the WHOLE PROCESS TREE.
//
// WHY THIS EXISTS
//
// The Repair LaunchAgent wrapped Claude in `perl -e 'alarm shift; exec @ARGV'`.
// That fires correctly — measured 2026-08-28, on `/bin/sleep 300` and on the
// Claude binary, both interactively and under launchd, dying at the deadline
// with exit 142. So the watchdog was NOT randomly failing, and an earlier
// report that said so was wrong.
//
// What it does NOT do is bound descendants. `exec` replaces perl with the
// child, so SIGALRM reaches exactly one PID. Measured with a
// parent -> grandchild fixture: parent gone at 5s, grandchild still alive.
//
//     direct child died   !=   the run is bounded
//
// A Repair run spawns npm, vitest, tsc and git. Leaving those behind is how a
// "timed out" run keeps holding a worktree, a lockfile and several GB of RAM.
//
// HOW
//
// `detached: true` puts the child in a NEW PROCESS GROUP, so the deadline can
// signal the group (`kill(-pid)`) instead of one process. TERM first, a bounded
// grace period, then KILL — a child that ignores TERM still dies.
//
// Node rather than Python: Node is already a hard dependency of this repo and
// Python 3 is not, and no third-party package is involved either way.
//
// Usage:  node scripts/run-bounded.mjs <seconds> <command> [args...]
// Exit:   124 on timeout (matching timeout(1)), otherwise the child's own code.
import { spawn } from 'node:child_process';

/** timeout(1)'s exit code, so callers can tell a deadline from a failure. */
export const TIMEOUT_EXIT_CODE = 124;
/** How long a process group gets to honour SIGTERM before SIGKILL. */
const GRACE_MS = 2000;

function usage() {
  process.stderr.write('usage: run-bounded.mjs <seconds> <command> [args...]\n');
  process.exit(2);
}

const [rawSeconds, command, ...args] = process.argv.slice(2);
if (!rawSeconds || !command) usage();
const seconds = Number(rawSeconds);
if (!Number.isFinite(seconds) || seconds <= 0) usage();

const child = spawn(command, args, { detached: true, stdio: 'inherit' });

let timedOut = false;
let killTimer;

/** Signal the whole GROUP. Negative pid is the group; a bare pid is one
 *  process, which is the entire bug this file exists to fix. */
function signalGroup(signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    // ESRCH — the group is already gone. Nothing to do, and never a reason to
    // crash the wrapper: the caller still needs an exit code.
  }
}

const deadline = setTimeout(() => {
  timedOut = true;
  process.stderr.write(
    `[run-bounded] deadline of ${seconds}s reached; terminating process group ${child.pid}\n`,
  );
  signalGroup('SIGTERM');
  killTimer = setTimeout(() => signalGroup('SIGKILL'), GRACE_MS);
}, seconds * 1000);

child.on('error', (err) => {
  clearTimeout(deadline);
  clearTimeout(killTimer);
  process.stderr.write(`[run-bounded] failed to start: ${err.message}\n`);
  process.exit(127);
});

child.on('exit', (code, signal) => {
  clearTimeout(deadline);
  clearTimeout(killTimer);
  // A timeout is reported as a timeout even though the child died by signal —
  // the caller needs to distinguish "we stopped it" from "it crashed".
  if (timedOut) {
    // The group may still hold stragglers that ignored TERM; make the KILL
    // unconditional before leaving.
    signalGroup('SIGKILL');
    process.exit(TIMEOUT_EXIT_CODE);
  }
  if (signal) {
    process.stderr.write(`[run-bounded] child terminated by ${signal}\n`);
    process.exit(128 + (signal === 'SIGKILL' ? 9 : 15));
  }
  process.exit(code ?? 0);
});
