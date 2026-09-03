#!/usr/bin/env node
// scripts/flight-recorder-audit.mjs — read-only Flight Recorder health check.
//
// Usage:
//   node --env-file=.env.local scripts/flight-recorder-audit.mjs
//   npm run flight-recorder:audit -- --env-file=.env.local   (npm forwards
//     extra flags after `--`, but Node's --env-file must come before the
//     script path to take effect, so prefer the explicit `node` form above)
//
// `--env-file` on purpose, same convention as scripts/run-selfheal-repair.mjs:
// the service-role key is USED by this process without ever becoming a file
// inside a task worktree, and loading it is the CALLER's responsibility, not
// this script's — it never reads .env.local itself.
//
// WHY THIS EXISTS. The two in-flight Flight Recorder branches
// (agent/flight-recorder-real-timings, agent/flight-recorder-db-checkpoints)
// change what gets written into helm_debug.trace_runs/trace_steps, but
// neither ships a way to CHECK, after deploy, that real data actually started
// landing. This script is that check: five read-only figures over the last
// 24h window.
//
// WHY THE TWO RPCs, NOT A TABLE READ. helm_debug is explicitly not in
// PostgREST's exposed schema list (see the "REVOKE ALL ON SCHEMA helm_debug
// FROM public" comment in
// supabase/migrations/20260825200811_helm_flight_recorder.sql) — schema
// exposure is independent of the calling role's grants, so a service-role KEY
// cannot reach helm_debug.trace_runs/trace_steps via supabase-js's ordinary
// `.from(...)` client under ANY key. The only reachable path is through the
// same two SECURITY DEFINER RPC facades the app itself uses:
// `helm_debug_list_traces` (capped server-side at 200 rows, no offset/cursor)
// and `helm_debug_get_trace` (per trace_id, full step array + full run
// metadata). This script therefore does one `helm_debug_list_traces` call
// plus one `helm_debug_get_trace` call PER RUN inside the 24h window — a
// documented N+1, acceptable for an occasional manual/CI-adjacent audit, not
// a hot path.
//
// COVERAGE IS A REAL LIMIT, NOT A ROUNDING ERROR. If the 200-row cap is hit
// and the oldest of those 200 rows is still inside the last 24h, there may be
// MORE runs, older still but also within the window, that this script never
// saw. It logs that condition rather than silently reporting a false-complete
// picture — see coverageNotGuaranteed in flight-recorder-audit-lib.mjs.

import { createClient } from '@supabase/supabase-js';
import { summarizeFlightRecorderAudit } from './lib/flight-recorder-audit-lib.mjs';

const WINDOW_HOURS = 24;
const LIST_LIMIT = 200; // helm_debug_list_traces's own hard cap (least(p_limit, 200))

function readEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return { ok: false, error: 'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not in the environment' };
  }
  return { ok: true, url, key };
}

/**
 * Distinguishes UNREADABLE (the RPC call itself failed — network, auth,
 * function missing) from an EMPTY result, same discipline as
 * scripts/run-selfheal-repair.mjs's `findByRunId`: a store that could not be
 * read must never be read as "the store has nothing in it".
 */
async function callRpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) return { readable: false, error: error.message };
  return { readable: true, data };
}

async function main() {
  const env = readEnv();
  if (!env.ok) {
    process.stderr.write(`flight-recorder-audit: ${env.error}\n`);
    process.exitCode = 2;
    return;
  }

  const client = createClient(env.url, env.key, { auth: { persistSession: false } });

  const listResult = await callRpc(client, 'helm_debug_list_traces', {
    p_limit: LIST_LIMIT,
    p_workflow: null,
    p_round_id: null,
  });
  if (!listResult.readable) {
    process.stderr.write(`flight-recorder-audit: helm_debug_list_traces unreadable — ${listResult.error}\n`);
    process.exitCode = 2;
    return;
  }
  const runsFromRpc = Array.isArray(listResult.data) ? listResult.data : [];

  const nowMs = Date.now();
  const windowStartMs = nowMs - WINDOW_HOURS * 3600_000;
  const runsInWindow = runsFromRpc.filter((run) => {
    const ms = run?.started_at ? new Date(run.started_at).getTime() : NaN;
    return Number.isFinite(ms) && ms >= windowStartMs;
  });

  const detailsByTraceId = new Map();
  const unreadableTraceIds = [];
  for (const run of runsInWindow) {
    const detailResult = await callRpc(client, 'helm_debug_get_trace', { p_trace_id: run.trace_id });
    if (!detailResult.readable) {
      unreadableTraceIds.push(run.trace_id);
      continue;
    }
    const detail = detailResult.data;
    if (detail && typeof detail === 'object' && Array.isArray(detail.steps)) {
      detailsByTraceId.set(run.trace_id, detail);
    }
  }

  const summary = summarizeFlightRecorderAudit({
    runsFromRpc,
    limit: LIST_LIMIT,
    windowHours: WINDOW_HOURS,
    nowMs,
    detailsByTraceId,
  });

  process.stdout.write(`Flight Recorder audit — last ${WINDOW_HOURS}h\n`);
  process.stdout.write(`  runs:                ${summary.runsInWindowCount}\n`);
  process.stdout.write(`  steps:               ${summary.stepsInWindowCount}\n`);
  process.stdout.write(`  distinct step keys:  ${summary.distinctStepKeyCount}\n`);
  process.stdout.write(`  steps with identity: ${summary.stepsWithIdentityCount} (function_name or table_name set)\n`);
  process.stdout.write(`  zero-step runs:      ${summary.zeroStepRunTraceIds.length}\n`);
  if (summary.zeroStepRunTraceIds.length > 0) {
    process.stdout.write(`    ${summary.zeroStepRunTraceIds.join(', ')}\n`);
  }
  process.stdout.write(`  downgraded runs:     ${summary.downgradedRunTraceIds.length}\n`);
  if (summary.downgradedRunTraceIds.length > 0) {
    process.stdout.write(`    ${summary.downgradedRunTraceIds.join(', ')}\n`);
  }

  if (unreadableTraceIds.length > 0) {
    process.stdout.write(
      `  WARNING: ${unreadableTraceIds.length} trace(s) could not be read (helm_debug_get_trace failed) ` +
        `and are excluded from every figure above: ${unreadableTraceIds.join(', ')}\n`,
    );
  }

  if (summary.coverageNotGuaranteed) {
    process.stdout.write(
      `  WARNING: helm_debug_list_traces returned exactly its ${LIST_LIMIT}-row cap, and the oldest of those ` +
        `rows is still inside the ${WINDOW_HOURS}h window. There may be MORE runs in the window this audit ` +
        'did not see — the figures above are a lower bound, not a guaranteed-complete count.\n',
    );
  }
}

main().catch((err) => {
  process.stderr.write(`flight-recorder-audit: unhandled error — ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
