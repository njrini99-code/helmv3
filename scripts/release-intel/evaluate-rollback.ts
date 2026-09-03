#!/usr/bin/env tsx
/**
 * evaluate-rollback.ts — read-only, non-executing rollback recommendation.
 *
 * `docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` §4 F.4.3.
 * Compares the last N reliability-snapshot rows (`background_job_logs`,
 * job_type `reliability-snapshot`) for a candidate SHA's window against the
 * prior baseline window, and prints one of KEEP | WATCH | PAUSE_ROLLOUT |
 * ROLLBACK_RECOMMENDED | UNKNOWN with itemized evidence.
 *
 * IT NEVER CALLS A DEPLOY OR ROLLBACK API — same stance as
 * `scripts/release-status.mjs`'s own header ("It never deploys. Promotes
 * are the owner's call") and `config/release-policy.yml`'s
 * `emergency.automatic_override: false`.
 *
 * Two input modes:
 *   --live --candidate-sha <sha> --deployed-at <ISO> [--window-hours N]
 *       Queries Supabase directly. Needs SUPABASE_URL (or
 *       NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in the
 *       environment — same var names every other standalone script in
 *       this repo's `scripts/` directory uses. Prints UNCONFIGURED and
 *       exits 0 (not an error — this is a fail-soft read, not a broken
 *       script) when either is absent.
 *   --from-json <path>
 *       Reads `{ candidateSha, candidateRuns: ReliabilityRun[], baselineRuns: ReliabilityRun[] }`
 *       from a local file — for CI fixtures and offline testing without
 *       live credentials.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

import { evaluateRollback, summarizeReliabilityWindow } from '../../src/lib/admin/release-intel/rollback';
import type { RollbackVerdict } from '../../src/lib/admin/release-intel/types';
import type { ReliabilityRun } from '../../src/lib/reliability/types';

const RELIABILITY_SNAPSHOT_JOB_TYPE = 'reliability-snapshot';

function parseReliabilityRun(metadata: unknown): ReliabilityRun | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const candidate = metadata as Partial<ReliabilityRun>;
  if (candidate.version !== 1 || !Array.isArray(candidate.signals) || !Array.isArray(candidate.sources)) return null;
  return candidate as ReliabilityRun;
}

function printVerdict(candidateSha: string | null, verdict: RollbackVerdict, json: boolean) {
  if (json) {
    console.log(JSON.stringify({ candidateSha, ...verdict }, null, 2));
    return;
  }
  console.log(`Rollback recommendation for ${candidateSha ?? '(unknown sha)'}: ${verdict.recommendation}`);
  for (const e of verdict.evidence) console.log(`  - ${e.detail}`);
}

async function runLive(argv: string[]) {
  const shaIdx = argv.indexOf('--candidate-sha');
  const deployedIdx = argv.indexOf('--deployed-at');
  const windowIdx = argv.indexOf('--window-hours');
  const candidateSha = shaIdx !== -1 ? argv[shaIdx + 1] ?? null : null;
  const deployedAtRaw = deployedIdx !== -1 ? argv[deployedIdx + 1] : null;
  const windowHours = windowIdx !== -1 ? Number(argv[windowIdx + 1]) : 24;

  if (!candidateSha || !deployedAtRaw) {
    console.error('Usage: evaluate-rollback.ts --live --candidate-sha <sha> --deployed-at <ISO> [--window-hours N]');
    process.exitCode = 2;
    return;
  }

  const deployedAtMs = Date.parse(deployedAtRaw);
  if (!Number.isFinite(deployedAtMs)) {
    console.error(`--deployed-at is not a parseable ISO timestamp: ${deployedAtRaw}`);
    process.exitCode = 2;
    return;
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log('UNCONFIGURED: SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --live.');
    return;
  }

  const windowMs = windowHours * 3600_000;
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('background_job_logs')
    .select('started_at, metadata')
    .eq('job_type', RELIABILITY_SNAPSHOT_JOB_TYPE)
    .gte('started_at', new Date(deployedAtMs - windowMs).toISOString())
    .lte('started_at', new Date(deployedAtMs + windowMs).toISOString())
    .order('started_at', { ascending: true })
    .limit(1000);

  if (error) {
    console.error(`Supabase query failed: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const candidateRuns: ReliabilityRun[] = [];
  const baselineRuns: ReliabilityRun[] = [];
  for (const row of data ?? []) {
    const run = parseReliabilityRun(row.metadata);
    if (!run) continue;
    const t = Date.parse(row.started_at as unknown as string);
    if (!Number.isFinite(t)) continue;
    if (t >= deployedAtMs) candidateRuns.push(run);
    else baselineRuns.push(run);
  }

  const verdict = evaluateRollback({
    candidateSha,
    candidate: summarizeReliabilityWindow(candidateRuns),
    baseline: summarizeReliabilityWindow(baselineRuns),
  });

  printVerdict(candidateSha, verdict, argv.includes('--json'));
}

function runFromJson(path: string, json: boolean) {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as {
    candidateSha: string | null;
    candidateRuns: ReliabilityRun[];
    baselineRuns: ReliabilityRun[];
  };
  const verdict = evaluateRollback({
    candidateSha: raw.candidateSha,
    candidate: summarizeReliabilityWindow(raw.candidateRuns ?? []),
    baseline: summarizeReliabilityWindow(raw.baselineRuns ?? []),
  });
  printVerdict(raw.candidateSha, verdict, json);
}

async function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const fromJsonIdx = argv.indexOf('--from-json');

  if (fromJsonIdx !== -1) {
    const path = argv[fromJsonIdx + 1];
    if (!path) {
      console.error('--from-json requires a path.');
      process.exitCode = 2;
      return;
    }
    runFromJson(path, json);
    return;
  }

  if (argv.includes('--live')) {
    await runLive(argv);
    return;
  }

  console.error('Usage: evaluate-rollback.ts --live --candidate-sha <sha> --deployed-at <ISO> | --from-json <path>');
  process.exitCode = 2;
}

main();
