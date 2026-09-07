#!/usr/bin/env node
// scripts/gates-report.mjs — median and p95 wait per gate over the ledger.
//
// Reads memory/ledgers/gates.jsonl (written by scripts/serialize.mjs, one
// row per gate run: { ts, gate, waitMs, runMs, slots }) and prints, per gate
// name, the count, median wait, p95 wait, and median run time. `waitMs` is
// time spent queued behind HELM_GATE_SLOTS other gates on this machine
// before running; a rising median wait across gates is the earliest signal
// that the worktree/slot budget is too tight for how the machine is
// actually being used — see docs/operations/WORKSPACES.md.
//
// Usage:  npm run gates:report
//         node scripts/gates-report.mjs [--ledger <path>]

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

function parseArgs(argv) {
  const out = { ledger: join(REPO_ROOT, 'memory', 'ledgers', 'gates.jsonl') };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--ledger' && argv[i + 1]) {
      out.ledger = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

function readRows(ledgerPath) {
  let text = '';
  try {
    text = readFileSync(ledgerPath, 'utf8');
  } catch {
    return [];
  }
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((row) => row && typeof row.gate === 'string' && typeof row.waitMs === 'number');
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function median(sorted) {
  return percentile(sorted, 50);
}

export function buildReport(rows) {
  const byGate = new Map();
  for (const row of rows) {
    if (!byGate.has(row.gate)) byGate.set(row.gate, []);
    byGate.get(row.gate).push(row);
  }
  const report = [];
  for (const [gate, gateRows] of byGate) {
    const waits = gateRows.map((r) => r.waitMs).sort((a, b) => a - b);
    const runs = gateRows.map((r) => r.runMs ?? 0).sort((a, b) => a - b);
    report.push({
      gate,
      count: gateRows.length,
      medianWaitMs: median(waits),
      p95WaitMs: percentile(waits, 95),
      medianRunMs: median(runs),
    });
  }
  report.sort((a, b) => b.p95WaitMs - a.p95WaitMs || a.gate.localeCompare(b.gate));
  return report;
}

export function formatReport(report) {
  if (report.length === 0) {
    return 'No gate timing recorded yet (memory/ledgers/gates.jsonl is empty). Run a gate through scripts/serialize.mjs first.';
  }
  const header = ['gate', 'runs', 'median wait', 'p95 wait', 'median run'];
  const rows = report.map((r) => [
    r.gate,
    String(r.count),
    `${r.medianWaitMs}ms`,
    `${r.p95WaitMs}ms`,
    `${r.medianRunMs}ms`,
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

function main() {
  const { ledger } = parseArgs(process.argv.slice(2));
  const rows = readRows(ledger);
  console.log(formatReport(buildReport(rows)));
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main();
}
