#!/usr/bin/env node
/**
 * One-call PR state for the builder/fixer pipeline (docs/operations/PR_PIPELINE.md).
 *
 *   npm run pr:status -- <pr-number> [--log] [--json]
 *
 * Answers, in about ten lines, the questions a fixer otherwise spends many tool
 * calls and a lot of log text on: is the PR draft or conflicted, is CI running
 * on the CURRENT head, which required contexts are red, which job and step
 * failed, would the automatic retry cover it (infrastructure) or is it the
 * change's own work, and how many CI runs this PR has already burned.
 *
 * `--log` adds the last 40 lines of each failing job's failed-step log. Nothing
 * is written, re-run, merged or pushed: read-only, so it is safe to call as
 * often as needed (it costs API calls, not CI minutes). Run it once per wake,
 * not in a loop; a PR event or `gh pr checks --watch` is the way to wait.
 *
 * `gh` is called through an injected `exec` so the pure summarizer
 * (summarizePr) is unit-tested without the network.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { classifyJob } from './ci-retry-classify.mjs';
import { DEFAULT_REQUIRED_CONTEXTS, evaluateRequiredChecks } from '../pr-land.mjs';

const CI_WORKFLOW = 'CI';
const LOG_TAIL_LINES = 40;
const PENDING_STATES = new Set(['QUEUED', 'IN_PROGRESS', 'PENDING', 'WAITING', 'REQUESTED']);

/** @returns {{ prNumber: number | null, log: boolean, json: boolean, help: boolean, error: string | null }} */
export function parseArgs(argv) {
  const out = { prNumber: null, log: false, json: false, help: false, error: null };
  for (const a of argv ?? []) {
    if (a === '--log') out.log = true;
    else if (a === '--json') out.json = true;
    else if (a === '-h' || a === '--help') out.help = true;
    else if (a.startsWith('-')) return { ...out, error: `unknown flag: ${a}` };
    else if (/^\d+$/.test(a) && out.prNumber === null) out.prNumber = Number(a);
    else return { ...out, error: `unexpected argument: ${a}` };
  }
  if (!out.help && out.prNumber === null) out.error = 'a PR number is required';
  return out;
}

/**
 * How much CI this PR has consumed. Counts only `pull_request` runs of the CI
 * workflow on the PR's branch.
 * @param {Array<{ head_sha: string, run_attempt?: number, status?: string, conclusion?: string | null, name?: string }>} runs
 */
export function runStats(runs, headSha) {
  const ci = (runs ?? []).filter((r) => (r.name ?? CI_WORKFLOW) === CI_WORKFLOW);
  const onHead = ci.filter((r) => r.head_sha === headSha);
  return {
    runs: ci.length,
    heads: new Set(ci.map((r) => r.head_sha)).size,
    reattempts: ci.filter((r) => (r.run_attempt ?? 1) > 1).length,
    cancelled: ci.filter((r) => r.conclusion === 'cancelled').length,
    onHead: onHead.length,
    headInFlight: onHead.some((r) => r.status !== 'completed'),
  };
}

/**
 * Pure: turn the raw GitHub answers into the summary object.
 * @param {{
 *   pr: { number: number, title: string, headRefName: string, headRefOid: string, isDraft: boolean, state: string,
 *         mergeable?: string, mergeStateStatus?: string, reviewDecision?: string, labels?: Array<{ name: string }> },
 *   checks: Array<{ name: string, status?: string, conclusion?: string | null }>,
 *   runs: Array<object>,
 *   failedJobs: Array<{ id?: number, name: string, conclusion: string, steps?: Array<object> }>,
 * }} input
 * @param {string[]} [requiredContexts]
 */
export function summarizePr({ pr, checks, runs, failedJobs }, requiredContexts = DEFAULT_REQUIRED_CONTEXTS) {
  const stats = runStats(runs, pr.headRefOid);
  const rollup = (checks ?? []).map((c) => ({
    name: c.name,
    state: c.status && c.status !== 'completed' ? c.status : (c.conclusion ?? c.status),
  }));
  const required = evaluateRequiredChecks(rollup, requiredContexts);
  // Any required context that is still queued or running counts as CI in flight,
  // not only the CI workflow: pushing now would cancel it (Review Gate uses
  // cancel-in-progress).
  const pendingRequired = rollup
    .filter((r) => requiredContexts.includes(r.name) && PENDING_STATES.has(String(r.state).toUpperCase()))
    .map((r) => r.name);
  const jobs = (failedJobs ?? [])
    .filter((j) => j.name !== 'CI aggregate')
    .map((j) => {
      const verdict = classifyJob(j);
      const failedStep = (j.steps ?? []).find((s) => s.conclusion === 'failure' || s.conclusion === 'cancelled');
      return { id: j.id ?? null, name: j.name, step: failedStep?.name ?? null, infra: verdict.infra, why: verdict.why };
    });
  const conflicted = pr.mergeable === 'CONFLICTING' || pr.mergeStateStatus === 'DIRTY';

  let verdict;
  if (pr.state !== 'OPEN') verdict = `CLOSED: ${pr.state.toLowerCase()}`;
  else if (pr.isDraft) verdict = 'DRAFT: CI is skipped on drafts by design; mark ready when the work is done';
  else if (conflicted) verdict = 'CONFLICT: merge main once, then push once';
  else if (stats.headInFlight || pendingRequired.length) verdict = 'CI_RUNNING: do not push; wait for the event';
  else if (required.ok) verdict = pr.reviewDecision === 'CHANGES_REQUESTED' ? 'CHANGES_REQUESTED: answer the review' : 'GREEN: ready to land';
  else if (required.missing.length && !jobs.length && stats.onHead === 0) verdict = 'NO_CI_ON_HEAD: no run on this head yet (just pushed, or the draft was never marked ready)';
  else if (jobs.length && jobs.every((j) => j.infra)) verdict = 'RED_INFRA: runner/setup failure; the auto-retry covers it, do not push';
  else verdict = 'RED: fix the failing job(s), batch the fixes, push once';

  return {
    pr: pr.number,
    title: pr.title,
    branch: pr.headRefName,
    head: pr.headRefOid.slice(0, 10),
    draft: pr.isDraft,
    labels: (pr.labels ?? []).map((l) => l.name),
    verdict,
    required: { ok: required.ok, missing: required.missing, failing: required.failing },
    failedJobs: jobs,
    ci: { ...stats, requiredPending: pendingRequired },
  };
}

export function formatSummary(s) {
  const lines = [
    `#${s.pr} ${s.title}`,
    `branch ${s.branch}  head ${s.head}  ${s.draft ? 'draft' : 'ready'}${s.labels.length ? `  labels: ${s.labels.join(', ')}` : ''}`,
    `VERDICT  ${s.verdict}`,
  ];
  if (!s.required.ok) {
    if (s.required.failing.length) lines.push(`red      ${s.required.failing.join(', ')}`);
    if (s.required.missing.length) lines.push(`missing  ${s.required.missing.join(', ')}`);
  }
  for (const j of s.failedJobs) {
    lines.push(`job      ${j.name}${j.step ? ` > ${j.step}` : ''}  [${j.infra ? 'infra' : 'own work'}]`);
    if (j.log) lines.push(...j.log.split('\n').map((l) => `           ${l}`));
  }
  lines.push(
    `CI spent ${s.ci.runs} run(s) over ${s.ci.heads} head(s); ${s.ci.reattempts} re-attempt(s), ${s.ci.cancelled} cancelled; ${s.ci.onHead} on this head`,
  );
  return lines.join('\n');
}

function defaultExec(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`gh ${args.slice(0, 3).join(' ')} failed: ${(r.stderr || r.stdout || '').trim().split('\n')[0]}`);
  return r.stdout;
}

/**
 * Required contexts from live branch protection, the same source `pr:land`
 * gates on; DEFAULT_REQUIRED_CONTEXTS only when protection cannot be read.
 */
function liveRequiredContexts(exec) {
  try {
    const contexts = JSON.parse(
      exec(['api', 'repos/{owner}/{repo}/branches/main/protection', '--jq', '.required_status_checks.contexts']),
    );
    if (Array.isArray(contexts) && contexts.length > 0) return contexts;
  } catch {
    // fall through to the default list
  }
  return DEFAULT_REQUIRED_CONTEXTS;
}

/** Reads GitHub through `exec` (gh args -> stdout) and returns the summary. */
export function collect(prNumber, exec = defaultExec, { log = false } = {}) {
  const json = (args) => JSON.parse(exec(args));
  const pr = json([
    'pr', 'view', String(prNumber), '--json',
    'number,title,headRefName,headRefOid,isDraft,state,mergeable,mergeStateStatus,reviewDecision,labels',
  ]);
  const checks = json(['api', `repos/{owner}/{repo}/commits/${pr.headRefOid}/check-runs?per_page=100`, '--jq', '.check_runs']);
  const runs = json([
    'api', `repos/{owner}/{repo}/actions/runs?event=pull_request&branch=${encodeURIComponent(pr.headRefName)}&per_page=100`,
    '--jq', '[.workflow_runs[] | {head_sha, run_attempt, status, conclusion, name, id}]',
  ]);
  const latest = runs.filter((r) => r.name === CI_WORKFLOW && r.head_sha === pr.headRefOid && r.status === 'completed' && r.conclusion === 'failure')[0];
  let failedJobs = [];
  if (latest) {
    failedJobs = json([
      'api', `repos/{owner}/{repo}/actions/runs/${latest.id}/jobs?per_page=100`,
      '--jq', '[.jobs[] | select(.conclusion == "failure") | {id, name, conclusion, steps: [.steps[] | {name, conclusion, number}]}]',
    ]);
  }
  const summary = summarizePr({ pr, checks, runs, failedJobs }, liveRequiredContexts(exec));
  if (log) {
    for (const j of summary.failedJobs) {
      if (!j.id || j.infra) continue;
      try {
        const out = exec(['run', 'view', '--job', String(j.id), '--log-failed']);
        j.log = out.trimEnd().split('\n').slice(-LOG_TAIL_LINES).join('\n');
      } catch (e) {
        j.log = `(log unavailable: ${e.message})`;
      }
    }
  }
  return summary;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('usage: npm run pr:status -- <pr-number> [--log] [--json]\nRead-only PR/CI summary for builders and fixers.');
    return 0;
  }
  if (args.error) {
    console.error(`pr:status: ${args.error}`);
    return 2;
  }
  try {
    const summary = collect(args.prNumber, defaultExec, { log: args.log });
    console.log(args.json ? JSON.stringify(summary, null, 2) : formatSummary(summary));
    return 0;
  } catch (e) {
    console.error(`pr:status: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)));
}
