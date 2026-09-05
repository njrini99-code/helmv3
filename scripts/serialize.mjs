#!/usr/bin/env node
// scripts/serialize.mjs — machine-wide scheduler for the heavy gates.
//
// Usage:  node scripts/serialize.mjs -- <command> [args...]
//
// Every worktree on this machine shares one lock directory (~/.helm-gates by
// default). At most HELM_GATE_SLOTS (default 2) commands wrapped by this
// script run at the same time; the others wait for a slot and then run. The
// wrapped command's exit code is passed through untouched, so a gate can never
// read as green because of the wrapper.
//
// Why this exists (measured 2026-09-05 on the owner's 16 GB laptop): one
// `tsc --noEmit` loads ~8,700 files and costs ~2.85 GB; vitest forks up to ten
// workers per run; `next build` spawns up to nine. Five agent worktrees running
// gates at once put the machine at 3.8 GB of a 4 GB swap and a load average of
// 26. Nothing was slow; everything was running at the same time.
//
// Locks name a pid. A lock whose pid is gone is removed on the next scan, so a
// crashed gate never blocks anyone. Set HELM_GATE_NOWAIT=1 to bypass the queue
// for a one-off, or HELM_GATE_SLOTS=<n> to change the width on a bigger box.

import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SLOTS = Math.max(1, Number(process.env.HELM_GATE_SLOTS ?? 2));
const DIR = process.env.HELM_GATE_DIR ?? join(homedir(), '.helm-gates');
const MAX_WAIT_MS = Number(process.env.HELM_GATE_MAX_WAIT_MS ?? 20 * 60 * 1000);
const POLL_MS = 2000;

const sep = process.argv.indexOf('--');
const cmd = process.argv.slice(sep >= 0 ? sep + 1 : 2);
if (cmd.length === 0) {
  console.error('usage: node scripts/serialize.mjs -- <command> [args...]');
  process.exit(2);
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === 'EPERM';
  }
}

function holders() {
  mkdirSync(DIR, { recursive: true });
  const out = [];
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith('.lock')) continue;
    const file = join(DIR, f);
    let pid = NaN;
    try {
      pid = Number(readFileSync(file, 'utf8').split('\n')[0]);
    } catch {
      /* unreadable: treat as stale */
    }
    if (!Number.isInteger(pid) || !alive(pid)) {
      try {
        unlinkSync(file);
      } catch {
        /* already gone */
      }
      continue;
    }
    out.push({ file, pid, mtime: statSync(file).mtimeMs });
  }
  return out;
}

async function acquire() {
  const mine = join(DIR, `${process.pid}-${Date.now()}.lock`);
  const started = Date.now();
  let warned = false;
  for (;;) {
    const running = holders();
    if (running.length < SLOTS) {
      writeFileSync(mine, `${process.pid}\n${cmd.join(' ')}\n${process.cwd()}\n`);
      // Two waiters can pass the check together; the newer one yields.
      const all = holders().sort((a, b) => a.mtime - b.mtime);
      const idx = all.findIndex((x) => x.file === mine);
      if (idx >= 0 && idx < SLOTS) {
        const release = () => {
          try {
            unlinkSync(mine);
          } catch {
            /* already gone */
          }
        };
        process.on('exit', release);
        return;
      }
      try {
        unlinkSync(mine);
      } catch {
        /* already gone */
      }
    }
    if (!warned) {
      console.error(
        `[serialize] ${running.length} heavy gate(s) already running on this machine; waiting for one of ${SLOTS} slot(s)…`,
      );
      warned = true;
    }
    if (Date.now() - started > MAX_WAIT_MS) {
      console.error('[serialize] waited past HELM_GATE_MAX_WAIT_MS; running anyway');
      return;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

function run() {
  const child = spawn(cmd[0], cmd.slice(1), { stdio: 'inherit', env: process.env });
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => child.kill(sig));
  }
  child.on('error', (e) => {
    console.error(`[serialize] could not start ${cmd[0]}: ${e.message}`);
    process.exit(127);
  });
  child.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
}

if (process.env.HELM_GATE_NOWAIT === '1') {
  run();
} else {
  acquire().then(run);
}
