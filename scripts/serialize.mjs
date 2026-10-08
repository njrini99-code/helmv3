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
//
// QUEUE CAP (2026-10-07). A gate waits at most HELM_GATE_MAX_WAIT_MS (default
// 8 minutes). Past that it does NOT run anyway, as it used to after 20 minutes:
// it exits 75 (EX_TEMPFAIL) at once with "queued, retry with: <cmd>". A caller
// that blocks for 20 minutes behind two other gates has nothing to show for it,
// and an agent shell cannot tell a hung gate from a queued one. Exit 75 is
// distinct from a gate that ran and failed, so a wrapper can retry only that.

import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SLOTS = Math.max(1, Number(process.env.HELM_GATE_SLOTS ?? 2));
const DIR = process.env.HELM_GATE_DIR ?? join(homedir(), '.helm-gates');
export const DEFAULT_MAX_WAIT_MS = 8 * 60 * 1000;
/** Exit status for "no slot within the wait cap" (sysexits EX_TEMPFAIL). */
export const QUEUED_EXIT_CODE = 75;
const MAX_WAIT_MS = Number(process.env.HELM_GATE_MAX_WAIT_MS ?? DEFAULT_MAX_WAIT_MS);
const POLL_MS = Math.max(10, Number(process.env.HELM_GATE_POLL_MS ?? 2000));

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
// Gate timings are local runtime telemetry. Keeping them under `.helm/` makes
// the report available in every checkout without turning each passed gate into
// a tracked working-tree change that blocks worktree retirement.
const LEDGER_PATH = process.env.HELM_GATE_LEDGER ?? join(REPO_ROOT, '.helm', 'runtime', 'gates.jsonl');
const LEDGER_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// This file is both the CLI entry point and (for `recordGateTiming`) an
// importable module for its unit test — guard the argv parsing and the
// process.exit()-ing paths so `import { recordGateTiming } from
// './serialize.mjs'` never triggers them.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

const sep = process.argv.indexOf('--');
const cmd = process.argv.slice(sep >= 0 ? sep + 1 : 2);
if (isMain && cmd.length === 0) {
  console.error('usage: node scripts/serialize.mjs -- <command> [args...]');
  process.exit(2);
}

// The npm lifecycle name (e.g. "typecheck", "test", "build") is a stable,
// short gate identifier when this runs via `npm run <script>`; fall back to
// the wrapped command line for a direct invocation.
const GATE_NAME = process.env.npm_lifecycle_event || cmd.join(' ');

/** Quote one argument for a copy-pasteable shell command. */
function shellQuote(arg) {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** The message printed when the queue cap is hit. Pure, so the wording is testable. */
export function queuedMessage({ holders: n, slots, waitedMs, command }) {
  const minutes = Math.round(waitedMs / 6000) / 10;
  return (
    `[serialize] queued: ${n} heavy gate(s) held all ${slots} slot(s) for ${minutes} min, so this gate did not start.\n` +
    `[serialize] retry with: ${command.map(shellQuote).join(' ')}\n` +
    `[serialize] (HELM_GATE_NOWAIT=1 skips the queue for a one-off; HELM_GATE_MAX_WAIT_MS changes the cap.)`
  );
}

/**
 * Append one timing row to the ledger and trim rows older than 30 days.
 * Exported for the unit test; never throws — a ledger write failure must
 * never turn a passing gate into a failing one.
 */
export function recordGateTiming({ ts, gate, waitMs, runMs, slots, ledgerPath = LEDGER_PATH }) {
  try {
    mkdirSync(dirname(ledgerPath), { recursive: true });
    const cutoff = ts - LEDGER_RETENTION_MS;
    let kept = [];
    try {
      kept = readFileSync(ledgerPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((row) => row && typeof row.ts === 'number' && row.ts >= cutoff);
    } catch {
      /* no ledger yet */
    }
    kept.push({ ts, gate, waitMs, runMs, slots });
    writeFileSync(ledgerPath, kept.map((row) => JSON.stringify(row)).join('\n') + '\n');
  } catch (e) {
    console.error(`[serialize] could not write gate timing ledger: ${e.message}`);
  }
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
        return Date.now() - started;
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
      console.error(queuedMessage({ holders: running.length, slots: SLOTS, waitedMs: Date.now() - started, command: cmd }));
      process.exit(QUEUED_EXIT_CODE);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

function run(waitMs) {
  const runStarted = Date.now();
  const child = spawn(cmd[0], cmd.slice(1), { stdio: 'inherit', env: process.env });
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => child.kill(sig));
  }
  child.on('error', (e) => {
    console.error(`[serialize] could not start ${cmd[0]}: ${e.message}`);
    process.exit(127);
  });
  child.on('exit', (code, signal) => {
    recordGateTiming({
      ts: runStarted,
      gate: GATE_NAME,
      waitMs,
      runMs: Date.now() - runStarted,
      slots: SLOTS,
    });
    process.exit(code ?? (signal ? 1 : 0));
  });
}

if (isMain) {
  if (process.env.HELM_GATE_NOWAIT === '1') {
    run(0);
  } else {
    acquire().then(run);
  }
}
