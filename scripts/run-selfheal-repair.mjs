#!/usr/bin/env node
// scripts/run-selfheal-repair.mjs — run the Repair stage under a bounded
// deadline and guarantee that a runner-level failure leaves evidence.
//
// Usage:
//   node --env-file=/Users/ricknini/Downloads/helmv3/.env.local \
//     scripts/run-selfheal-repair.mjs <timeoutSeconds> -- <command> [args...]
//
// `--env-file` on purpose: the service-role key is USED by this process without
// ever becoming a file inside a task worktree. Do not copy or symlink
// .env.local — `.worktreeinclude` withholds it deliberately.
//
// The child is run through scripts/run-bounded.mjs, which owns the
// process-group timeout (#1667). This file does not reimplement that: a second
// timeout mechanism is a second thing to get wrong.
//
// THE REAL LAUNCHAGENT IS STILL BOOTED OUT. This script existing does not mean
// scheduled Repair works — the Claude-under-launchd hang is unresolved. This is
// the outer contract that will make such a hang VISIBLE when Repair is
// eventually re-armed by an explicit owner decision.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reconcileRepairRun, truncateTail } from './lib/selfheal-repair-runner.mjs';
import { createCronCheckIn } from './lib/sentry-cron-checkin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN_BOUNDED = resolve(HERE, 'run-bounded.mjs');
const JOB_TYPE = 'selfheal-repair';
// Same `job-<jobType>` naming convention src/lib/observability/cron-monitors.ts
// uses for a job with no Vercel CRON_REGISTRY path — this launchd job has
// none, by definition.
const SENTRY_MONITOR_SLUG = `job-${JOB_TYPE}`;

// Never 'production' — this runs standalone on the owner's own machine via
// launchd, never on Vercel, and this repo treats "never mislabel a
// non-Vercel run as production" as a hard invariant elsewhere
// (src/lib/sentry-environment.ts). A distinct tag keeps this job's Sentry
// Cron Monitor history clearly separated from Vercel-hosted crons.
const cronCheckIn = createCronCheckIn({
  dsn: (process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || '').trim() || undefined,
  environment: 'launchd-repair',
});

const argv = process.argv.slice(2);
const sepIndex = argv.indexOf('--');
if (sepIndex < 1 || sepIndex === argv.length - 1) {
  process.stderr.write('usage: run-selfheal-repair.mjs <timeoutSeconds> -- <command> [args...]\n');
  process.exit(2);
}
const timeoutSeconds = Number(argv[0]);
const command = argv.slice(sepIndex + 1);
if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
  process.stderr.write('timeoutSeconds must be a positive number\n');
  process.exit(2);
}

/**
 * The production heartbeat store.
 *
 * `findByRunId` distinguishes UNREADABLE from NOT-FOUND, which is the entire
 * safety property: a Supabase outage must not be read as "Repair wrote no
 * heartbeat" and turned into a manufactured failure row.
 */
function productionStore() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const error = 'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not in the environment';
    return {
      findByRunId: async () => ({ readable: false, error }),
      insertRunnerFailure: async () => ({ ok: false, error }),
    };
  }
  const client = createClient(url, key, { auth: { persistSession: false } });

  return {
    async findByRunId(runId) {
      const { data, error } = await client
        .from('background_job_logs')
        .select('id')
        .eq('job_type', JOB_TYPE)
        .contains('metadata', { run_id: runId })
        .limit(1);
      if (error) return { readable: false, error: error.message };
      return { readable: true, found: (data ?? []).length > 0 };
    },
    async insertRunnerFailure(input) {
      const { error } = await client.from('background_job_logs').insert({
        job_type: JOB_TYPE,
        status: 'failed',
        started_at: input.startedAt,
        completed_at: input.completedAt,
        duration_ms: input.durationMs,
        error_message: input.errorMessage,
        // Only what the RUNNER knows. Never candidates/confirmed/prs_opened —
        // this process has no idea what Repair did or did not do.
        metadata: {
          run_id: input.runId,
          runner_failure: true,
          timeout: input.timeout,
          child_exit: input.childExit,
          heartbeat_source: 'runner-fallback',
          // Redacted + truncated by reconcileRepairRun before it ever reaches
          // here. Combined stdout+stderr, one tail — see that function's doc
          // comment for why one field rather than two. Only present when the
          // child actually produced captureable output before dying.
          ...(input.childOutputTail ? { child_output_tail: input.childOutputTail } : {}),
        },
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
  };
}

// A bounded combined tail of the child's stdout+stderr, kept ONLY so a
// runner-level failure can explain itself (metadata.child_output_tail). The
// 06:40 2026-09-02 failure's fallback heartbeat carried no stderr at all, so
// the board could only say "child exited 1" — nothing about WHY. This buffer
// is trimmed on every chunk rather than kept unbounded and truncated once, so
// a chatty child cannot grow this process's memory across a 30-minute run.
const TAIL_KEEP_BYTES = 4096;
let outputTail = '';
function appendTail(chunk) {
  outputTail += chunk.toString('utf8');
  if (Buffer.byteLength(outputTail, 'utf8') > TAIL_KEEP_BYTES * 2) {
    outputTail = truncateTail(outputTail, TAIL_KEEP_BYTES);
  }
}

const runId = randomUUID();
const startedAt = new Date().toISOString();
process.stderr.write(`[run-selfheal-repair] run_id=${runId} timeout=${timeoutSeconds}s\n`);

// Started immediately, awaited later (in finish(), where the id is actually
// needed) — never blocks spawning the real child below. One check-in pair
// around the whole run: 'in_progress' here, 'ok'/'error' in finish(). This is
// the ONLY mechanism that can catch "Repair never ran at all" (launchd never
// fired, the machine was asleep past the scheduled time) — a fallback
// heartbeat row in reconcileRepairRun still requires THIS process to have
// started and reached that code.
const cronCheckInIdPromise = cronCheckIn.start(SENTRY_MONITOR_SLUG, {
  // daily, per selfheal-registry.ts's cadenceMinutes: DAILY for this job.
  schedule: { type: 'interval', value: 1, unit: 'day' },
  // Generous margin: launchd wake timing on a laptop is far less precise
  // than a cloud cron scheduler.
  checkinMargin: 15,
  maxRuntime: Math.max(5, Math.ceil(timeoutSeconds / 60) + 5),
  timezone: 'UTC',
});

// stdin stays inherited — untouched, this exact path is proven to exit 0
// under launchd. stdout/stderr are piped so this process can capture a tail
// for the failure heartbeat, but every byte is still forwarded to this
// process's own stdout/stderr in real time, so `>> bridge-rca-repair.log
// 2>&1` in the plist sees the SAME output it always has — piping captures,
// it does not replace, the log.
const child = spawn('node', [RUN_BOUNDED, String(timeoutSeconds), ...command], {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: { ...process.env, HELM_REPAIR_RUN_ID: runId },
});
child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  appendTail(chunk);
});
child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
  appendTail(chunk);
});

// Reconcile on 'close', not 'exit': 'exit' can fire before the piped stdout/
// stderr streams have finished flushing, which would race the tail capture
// against the last chunk the child ever wrote — exactly the chunk most likely
// to explain a failure. 'close' fires once the streams are done. Bound the
// wait regardless: run-bounded.mjs's child is `detached: true` (a new process
// group) so a straggler grandchild could in principle keep a pipe's write end
// open after the direct child we spawned has exited; a grace timer means a
// hung pipe degrades to "reconcile with whatever tail we have", never to
// "never reconcile at all".
const CLOSE_GRACE_MS = 5000;
let reconciled = false;
async function finish(childExit) {
  if (reconciled) return;
  reconciled = true;
  const completedAt = new Date().toISOString();

  const result = await reconcileRepairRun({
    runId,
    childExit,
    startedAt,
    completedAt,
    childOutputTail: outputTail || undefined,
    store: productionStore(),
  });

  process.stderr.write(`[run-selfheal-repair] ${result.kind} (child exit ${childExit})\n`);
  if (result.kind === 'heartbeat-state-unknown') {
    process.stderr.write(
      `[run-selfheal-repair] heartbeat state UNKNOWN — wrote nothing: ${result.error}\n`,
    );
  }
  if (result.kind === 'fallback-failed') {
    process.stderr.write(`[run-selfheal-repair] fallback write FAILED: ${result.error}\n`);
  }

  // Mirrors reconcileRepairRun's own "unreadable != absent" discipline rather
  // than guessing: 'heartbeat-present' means the run completed its contract
  // (ok); 'fallback-written'/'fallback-failed' mean a successful read proved
  // the run did NOT complete it (error); 'heartbeat-state-unknown' means we
  // genuinely cannot tell — deliberately left in_progress rather than
  // reported either way, so Sentry's own maxRuntime eventually flags it as a
  // missed check-in instead of this process inventing an answer.
  const durationMs = Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
  const cronCheckInId = await cronCheckInIdPromise;
  if (result.kind === 'heartbeat-present') {
    await cronCheckIn.finish(SENTRY_MONITOR_SLUG, cronCheckInId, 'ok', durationMs);
  } else if (result.kind === 'fallback-written' || result.kind === 'fallback-failed') {
    await cronCheckIn.finish(SENTRY_MONITOR_SLUG, cronCheckInId, 'error', durationMs);
  }

  process.exit(childExit);
}

child.on('exit', (code, signal) => {
  const childExit = code ?? (signal ? 128 : 1);
  const graceTimer = setTimeout(() => finish(childExit), CLOSE_GRACE_MS);
  child.once('close', () => {
    clearTimeout(graceTimer);
    finish(childExit);
  });
});
