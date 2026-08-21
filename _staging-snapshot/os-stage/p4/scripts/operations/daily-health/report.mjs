#!/usr/bin/env node
// daily-health/report.mjs — renders collect.mjs's normalized JSON into the
// spec §24 final-output shape (docs/ai-system/GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md):
// "production unchanged SHA; repairs queued; new actionable incidents;
// incidents updated; no-action signals; release slots remaining."
//
//   node scripts/operations/daily-health/report.mjs                    # runs collect.mjs itself
//   node scripts/operations/daily-health/report.mjs --in health.json   # reuses an already-collected run
//   node scripts/operations/daily-health/report.mjs --from X --to Y    # passed through to collect.mjs
//
// SCOPE — read this before extending "new actionable" logic.
// ---------------------------------------------------------------------
// collect.mjs's signals[] carry classification (new | recurring |
// resolved-recur) but deliberately NOT severity/actionability — that call
// (real defect vs TELEMETRY_DEFECT vs expected/non-actionable, spec §18)
// requires reading the affected feature's invariants and current-state
// memory, which is exactly the judgment .claude/skills/golfhelm-daily-
// reliability/SKILL.md's operating procedure exists to make. Hardcoding a
// severity/keyword heuristic here would let a script silently decide
// "no action needed" with no feature context behind it — precisely the
// "quieter dashboard, not more accurate truth" failure spec §42 rejects.
//
// So this script produces a CANDIDATE grouping, not a verdict:
//   - candidate_new_actionable: classification 'new' or 'resolved-recur'
//     (first sighting, or a regression of something previously closed —
//     both presumptively worth the skill's attention).
//   - incidents_updated: classification 'recurring' (§18: bump count/
//     last_seen on the existing incident, do not open a new one).
//   - no_action_signals: left `null` with an explanatory note — deciding
//     "expected, no action" is the skill's job after it has read feature
//     context, not this script's.
//
// NO MUTATIONS: reads collect.mjs's output, memory/operations/release-queue.yml,
// and (optionally) scripts/release/check-release-budget.mjs --json. Writes
// nothing. Never invokes anything deploy/promote/rollback-shaped.

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');

export function parseArgs(argv) {
  const out = { in: null, from: null, to: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in') out.in = argv[++i] ?? null;
    else if (a === '--from') out.from = argv[++i] ?? null;
    else if (a === '--to') out.to = argv[++i] ?? null;
    else if (a === '--out') out.out = argv[++i] ?? null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// memory/operations/release-queue.yml — minimal, tolerant reader
// ---------------------------------------------------------------------------

/**
 * Pure. Deliberately NOT a general YAML parser — release-queue.yml (spec
 * §17) is a flat list of mappings with no nesting deeper than one level, so
 * a small line-scanner is enough and avoids adding a `yaml` dependency this
 * campaign's house rules don't allow. Recognizes entries introduced by a
 * `- id: <value>` line; every subsequent `  key: value` line (until the next
 * `- id:` or EOF) is attached to that entry. Anything it cannot confidently
 * parse is simply not attached to a field — never guessed.
 */
export function parseReleaseQueueEntries(text) {
  const entries = [];
  let current = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const idMatch = line.match(/^-\s+id:\s*(.+)$/);
    if (idMatch) {
      current = { id: idMatch[1].trim() };
      entries.push(current);
      continue;
    }
    if (!current) continue;

    const propMatch = line.match(/^\s+([a-z_]+):\s*(.*)$/);
    if (propMatch) {
      const key = propMatch[1];
      let value = propMatch[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      current[key] = value;
    }
  }
  return entries;
}

function readReleaseQueue(repoRoot) {
  const path = join(repoRoot, 'memory', 'operations', 'release-queue.yml');
  if (!existsSync(path)) {
    return {
      status: 'unconfigured',
      note: 'memory/operations/release-queue.yml not present yet (Phase 1/3 not installed)',
      entries: [],
    };
  }
  try {
    const text = readFileSync(path, 'utf8');
    return { status: 'ok', note: null, entries: parseReleaseQueueEntries(text) };
  } catch (err) {
    return {
      status: 'error',
      note: `release-queue read failed — ${err instanceof Error ? err.message : String(err)}`,
      entries: [],
    };
  }
}

/** Pure. Count release-queue entries by status. */
export function tallyReleaseQueue(entries) {
  const byStatus = {};
  for (const entry of entries) {
    const status = entry.status ?? 'unknown';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }
  return byStatus;
}

// ---------------------------------------------------------------------------
// scripts/release/check-release-budget.mjs --json — Phase 3 dependency
// ---------------------------------------------------------------------------

function readReleaseBudget(repoRoot) {
  const scriptPath = join(repoRoot, 'scripts', 'release', 'check-release-budget.mjs');
  if (!existsSync(scriptPath)) {
    return {
      status: 'unconfigured',
      note: 'scripts/release/check-release-budget.mjs not found — Phase 3 not installed yet',
      deploys_this_week: null,
      routine_slots_remaining: null,
    };
  }
  try {
    const out = execFileSync('node', [scriptPath, '--json'], { cwd: repoRoot, encoding: 'utf8', timeout: 15_000 });
    const parsed = JSON.parse(out);
    return {
      status: 'ok',
      note: null,
      deploys_this_week: parsed.deploys_this_week ?? null,
      routine_slots_remaining: parsed.routine_slots_remaining ?? null,
    };
  } catch (err) {
    return {
      status: 'error',
      note: `release budget check failed — ${err instanceof Error ? err.message : String(err)}`,
      deploys_this_week: null,
      routine_slots_remaining: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Collector JSON acquisition
// ---------------------------------------------------------------------------

function loadCollectorOutput(args, repoRoot) {
  if (args.in) {
    return JSON.parse(readFileSync(args.in, 'utf8'));
  }
  const collectScript = join(repoRoot, 'scripts', 'operations', 'daily-health', 'collect.mjs');
  const collectArgs = ['--compact'];
  if (args.from) collectArgs.push('--from', args.from);
  if (args.to) collectArgs.push('--to', args.to);
  const out = execFileSync('node', [collectScript, ...collectArgs], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(out);
}

// ---------------------------------------------------------------------------
// Report assembly (pure)
// ---------------------------------------------------------------------------

/**
 * Pure. `collectorOutput` is collect.mjs's JSON document; `releaseQueue` and
 * `budget` are the (possibly degraded) reads above. Produces the spec §24
 * final-output shape.
 */
export function buildReport({ collectorOutput, releaseQueue, budget }) {
  const signals = collectorOutput.signals ?? [];
  const candidateNewActionable = signals.filter(
    (s) => s.classification === 'new' || s.classification === 'resolved-recur',
  );
  const incidentsUpdated = signals.filter((s) => s.classification === 'recurring');

  const queueTally = tallyReleaseQueue(releaseQueue.entries);
  const degradedSources = Object.entries(collectorOutput.sources ?? {})
    .filter(([, v]) => v && v.status !== 'ok')
    .map(([name, v]) => ({ source: name, status: v.status, note: v.note }));

  return {
    generated_at: new Date().toISOString(),
    window: collectorOutput.window,
    production: {
      unchanged_sha: collectorOutput.production?.git_sha ?? null,
      resolved_via: collectorOutput.production?.resolved_via ?? 'unknown',
      note: collectorOutput.production?.note ?? null,
    },
    repairs_queued: {
      status: releaseQueue.status,
      note: releaseQueue.note,
      queued_for_release: queueTally.queued_for_release ?? 0,
      by_status: queueTally,
    },
    new_actionable_incidents: {
      note: 'CANDIDATE grouping (new + resolved-recur signals) — the daily-reliability skill confirms real vs TELEMETRY_DEFECT vs expected before treating any of these as a work item. See this file\'s header.',
      count: candidateNewActionable.length,
      signals: candidateNewActionable,
    },
    incidents_updated: {
      note: 'classification=recurring — same fingerprint as an already-open incident; count/last_seen only, no new work item per spec §18.',
      count: incidentsUpdated.length,
      signals: incidentsUpdated,
    },
    no_action_signals: {
      note: 'Not computed here — requires feature-context judgment (spec §18 TELEMETRY_DEFECT / expected classification). The skill records this after investigation.',
      count: null,
    },
    release_slots_remaining: {
      status: budget.status,
      note: budget.note,
      deploys_this_week: budget.deploys_this_week,
      routine_slots_remaining: budget.routine_slots_remaining,
    },
    degraded_sources: degradedSources,
    classification_basis: collectorOutput.classification_basis ?? null,
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = REPO_ROOT;

  const collectorOutput = loadCollectorOutput(args, repoRoot);
  const releaseQueue = readReleaseQueue(repoRoot);
  const budget = readReleaseBudget(repoRoot);

  const report = buildReport({ collectorOutput, releaseQueue, budget });
  const json = JSON.stringify(report, null, 2);

  if (args.out) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(args.out, json + '\n', 'utf8');
    process.stderr.write(`Wrote ${args.out}\n`);
  } else {
    process.stdout.write(json + '\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`daily-health/report.mjs failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
  });
}
