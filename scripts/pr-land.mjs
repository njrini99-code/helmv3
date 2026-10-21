#!/usr/bin/env node
/**
 * scripts/pr-land.mjs — one command for the whole "merge, then clean up"
 * dance that used to take three manual steps per PR (see PR #1863 and
 * AGENTS.md's "Helm agent canonicality" section).
 *
 *   npm run pr:land -- <pr-number> [--any-branch]
 *
 * What it does, in order:
 *   1. Reads the SIX required status contexts off `main`'s branch protection
 *      (falls back to a hardcoded list if that API call is unavailable —
 *      see DEFAULT_REQUIRED_CONTEXTS below) and refuses unless every one of
 *      them is green on the PR's head commit.
 *   1b. Refuses unless one CI run of that head ran the whole unit suite: every
 *      "Unit tests (n)" job's "Unit tests (shard n/5)" step concluded success
 *      on all five shards (see evaluateUnitShards). A follow-up push runs only
 *      the related tests (a separate step in each shard), so the required
 *      contexts can be green without the suite having run.
 *   2. Refuses a PR whose branch is not `agent/*`, unless --any-branch is
 *      passed — this tool is for the agent-worktree workflow, not for
 *      landing arbitrary branches on someone's behalf.
 *   3. Squash-merges through GitHub's async merge API, pinned to the head commit
 *      whose checks were read (falls back to `gh pr merge --squash` where the
 *      endpoint is absent). Never force-push,
 *      never any other merge strategy.
 *   4. Fast-forwards the CANONICAL checkout (resolved from git worktree
 *      metadata, never a hardcoded path) with `git pull --ff-only`.
 *   5. Runs `node scripts/worktree-lifecycle.mjs --retire --branch <head>`
 *      (this PR only, reported by name), then the repo-wide `--retire`
 *      from the canonical checkout, which parks the now-disposable worktree and
 *      deletes the branch under the DELETE_MERGED_EXACT proof standard
 *      (see scripts/lib/worktree-lifecycle.mjs, including the no-upstream
 *      case #1863 added — a merged PR's head OID is stronger evidence than a
 *      remote ref that GitHub automatically removed).
 *   6. Prints a four-line summary.
 *
 * This never overrides the mutation budget and never force-pushes. It runs
 * from any cwd — it resolves the repository and the canonical checkout from
 * git itself, not from process.cwd() or a hardcoded path.
 *
 * TESTABILITY: `gh` and `git` are invoked via a caller-supplied `exec`
 * (default: spawnSync), so tests stub both instead of hitting the network or
 * mutating a real repository. The pure decision functions — parseArgs and
 * evaluateRequiredChecks — need no stubbing at all.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalRootOf, topLevelOf } from '../.claude/hooks/lib/workspace-identity.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The six contexts required on `main` as of 2026-09-06 (docs/CI_RUNBOOK.md).
 * Used only when branch protection cannot be read live — this list is a
 * fallback, not the source of truth; `fetchRequiredContexts()` always tries
 * the live API first.
 */
export const DEFAULT_REQUIRED_CONTEXTS = [
  'CI aggregate',
  'Review Gate aggregate',
  'Analyze (actions)',
  'Analyze (javascript-typescript)',
  'Analyze (python)',
  'block-historical-edits',
];

/**
 * Parse argv into { prNumber, anyBranch, help, error }.
 * `error` is a human string; when set, the caller should print it and exit 2.
 */
export function parseArgs(argv) {
  const out = { prNumber: null, anyBranch: false, help: false, error: null };
  const rest = [];
  for (const a of argv ?? []) {
    if (a === '--any-branch') out.anyBranch = true;
    else if (a === '-h' || a === '--help') out.help = true;
    else if (a.startsWith('-')) {
      out.error = `unknown flag: ${a}`;
      return out;
    } else rest.push(a);
  }
  if (out.help) return out;
  if (rest.length !== 1 || !/^\d+$/.test(rest[0])) {
    out.error = 'usage: pr-land.mjs <pr-number> [--any-branch]';
    return out;
  }
  out.prNumber = Number(rest[0]);
  return out;
}

/**
 * Compare a PR's status-check rollup (gh's `statusCheckRollup` shape: an
 * array of items each carrying a name/context and a state/conclusion) against
 * the required contexts. Pure — no gh, no git, so this is the one function a
 * unit test exercises directly against fixture data.
 *
 * @returns {{ok: boolean, missing: string[], failing: string[]}}
 */
export function evaluateRequiredChecks(rollup, requiredContexts) {
  const byName = new Map();
  for (const c of rollup ?? []) {
    const name = c?.name ?? c?.context;
    if (!name) continue;
    const state = String(c?.state ?? c?.conclusion ?? c?.status ?? '').toUpperCase();
    byName.set(name, state);
  }
  const missing = [];
  const failing = [];
  for (const name of requiredContexts ?? []) {
    const state = byName.get(name);
    if (state === undefined) missing.push(name);
    else if (state !== 'SUCCESS') failing.push(`${name}=${state}`);
  }
  return { ok: missing.length === 0 && failing.length === 0, missing, failing };
}

/**
 * Why the required contexts are not enough. On a follow-up push (`synchronize`) CI runs only the tests related to the diff, in a
 * separate step of each shard, and the full-suite step is skipped, yet the jobs finish green and so do "CI aggregate" and the rest. Landing on that evidence merged
 * a change that broke a test no shard ran (#2269, main's Unit tests shard 5, 2026-10-21). So the guard reads the steps, not the jobs.
 */
export const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
export const UNIT_SHARDS = [1, 2, 3, 4, 5];
const SCOPE_STEP = 'Decide test scope';

/**
 * One shard's verdict from its job. `job` is the Actions API job (`{ steps: [{ name, conclusion }] }`), or undefined when the run has no
 * such job. A shard whose scope step was skipped had nothing to test: the in-job path gate found no code-relevant change in the PR
 * (docs and config only), which is the one legitimate way for the test step to be absent.
 *
 * @returns {{ok: boolean, why: string}}
 */
export function unitShardVerdict(job, shard, total = UNIT_SHARDS.length) {
  if (!job) return { ok: false, why: `no "Unit tests (${shard})" job in the run` };
  const steps = job.steps ?? [];
  const step = steps.find((s) => s.name === `Unit tests (shard ${shard}/${total})`);
  if (step?.conclusion === 'success') return { ok: true, why: 'ran' };
  if (steps.find((s) => s.name === SCOPE_STEP)?.conclusion === 'skipped') return { ok: true, why: 'no code-relevant change' };
  if (!step) return { ok: false, why: `job ${job.conclusion ?? job.status ?? 'unfinished'}, no "Unit tests (shard ${shard}/${total})" step` };
  const c = step.conclusion ?? 'not finished';
  return { ok: false, why: c === 'skipped' ? 'skipped (a follow-up push runs only the related tests)' : `step ${c}` };
}

/**
 * Whether ONE CI run of the head commit ran all five shards. Pure: `runs` is `[{ id, jobs }]`, the CI workflow's runs for the head SHA
 * with their latest-attempt jobs. The shards must all pass inside the same run, so a scoped follow-up run plus an old full run cannot
 * be mixed. With no passing run, the report names the best run's shortfalls (most shards passing, then the newest).
 *
 * @returns {{ok: boolean, runId: number|null, problems: string[]}}
 */
export function evaluateUnitShards(runs, shards = UNIT_SHARDS) {
  if (!runs || runs.length === 0) return { ok: false, runId: null, problems: ['no CI run found for this head commit'] };
  let best = null;
  for (const run of runs) {
    const verdicts = shards.map((n) => ({ n, ...unitShardVerdict((run.jobs ?? []).find((j) => j.name === `Unit tests (${n})`), n, shards.length) }));
    const passing = verdicts.filter((v) => v.ok).length;
    if (passing === shards.length) return { ok: true, runId: run.id, problems: [] };
    if (!best || passing > best.passing || (passing === best.passing && run.id > best.run.id)) best = { run, passing, verdicts };
  }
  return { ok: false, runId: best.run.id, problems: best.verdicts.filter((v) => !v.ok).map((v) => `shard ${v.n}/${shards.length}: ${v.why}`) };
}

/**
 * Of a run's jobs across all attempts, the newest attempt of each job name (then the highest job id). A shard that passed in attempt 1
 * and was not rerun still counts; a shard rerun in attempt 2 counts by its attempt-2 result, pass or fail. Pure.
 */
export function newestAttempts(jobs) {
  const byName = new Map();
  for (const j of jobs ?? []) {
    const cur = byName.get(j.name);
    if (!cur || (j.run_attempt ?? 1) > (cur.run_attempt ?? 1) || ((j.run_attempt ?? 1) === (cur.run_attempt ?? 1) && j.id > cur.id)) byName.set(j.name, j);
  }
  return [...byName.values()];
}

/** A workflow run's `path` without the ref the REST API may append (`.github/workflows/ci.yml@refs/heads/main`). Pure. */
export function workflowFile(path) {
  return String(path ?? '').split('@')[0];
}

/**
 * Reads the CI workflow's runs for `sha` and their jobs through `run(args)` (gh), then judges them with evaluateUnitShards. Fails closed:
 * a read that errors is a refusal, never a pass.
 *
 * @returns {{ok: boolean, runId: number|null, problems: string[]}}
 */
export function checkUnitShards({ repo, sha, run }) {
  const readJson = (args) => {
    const r = run(args);
    if (!r.ok) return null;
    try {
      return JSON.parse(r.stdout);
    } catch {
      return null;
    }
  };
  // Every attempt, not `filter=latest`: a rerun of only the failed jobs leaves the jobs that already passed in attempt 1, and `latest`
  // would drop them, so a run whose five shards all passed would read as missing some.
  const readAllJobs = (runId) => {
    const all = [];
    for (let page = 1; page <= 5; page += 1) {
      const r = readJson(['api', `repos/${repo}/actions/runs/${runId}/jobs?filter=all&per_page=100&page=${page}`]);
      if (!r || !Array.isArray(r.jobs)) return null;
      all.push(...r.jobs);
      if (r.jobs.length < 100) return all;
    }
    return all;
  };
  const listed = readJson(['api', `repos/${repo}/actions/runs?head_sha=${sha}&per_page=100`]);
  if (!listed || !Array.isArray(listed.workflow_runs)) return { ok: false, runId: null, problems: ['could not read the CI runs for this head commit'] };
  const runs = [];
  for (const wr of listed.workflow_runs.filter((w) => workflowFile(w.path) === CI_WORKFLOW_PATH && w.head_sha === sha)) {
    const jobs = readAllJobs(wr.id);
    if (!jobs) return { ok: false, runId: wr.id, problems: [`could not read the jobs of CI run ${wr.id}`] };
    runs.push({ id: wr.id, jobs: newestAttempts(jobs) });
  }
  return evaluateUnitShards(runs);
}

/**
 * How to bring the canonical checkout's `main` up to date after a merge.
 * On `main`, fast-forward the working tree. Anywhere else (a session left
 * canonical on a task branch), update the local `main` ref without touching
 * that branch or its uncommitted files: `git pull` there would pull the task
 * branch — usually deleted on merge — and abort the landing before
 * `--retire` runs. Pure, so it's unit-tested directly.
 *
 * @returns {{args: string[], fatal: boolean}}
 */
export function canonicalSyncPlan(currentBranch) {
  if (currentBranch === 'main') return { args: ['pull', '--ff-only'], fatal: true };
  return { args: ['fetch', 'origin', 'main:main'], fatal: false };
}

/**
 * What is left of the landed PR's workspace after retirement: one line for
 * the summary. Pure, so it's unit-tested directly.
 *
 * @param {string} worktreePorcelain  `git worktree list --porcelain`
 * @param {boolean} branchExists
 * @param {string} branch
 */
export function landedResidue(worktreePorcelain, branchExists, branch) {
  let path = null;
  let cur = null;
  for (const line of String(worktreePorcelain ?? '').split('\n')) {
    if (line.startsWith('worktree ')) cur = line.slice(9);
    else if (line === `branch refs/heads/${branch}`) path = cur;
  }
  if (path) return `worktree kept at ${path} — see its verdict above (a live session, uncommitted work, or unpushed commits)`;
  if (branchExists) return 'worktree gone; local branch kept — see its verdict above';
  return 'worktree and local branch retired';
}

/**
 * GitHub's asynchronous merge API (GA 2026-10-01): one `PUT .../pulls/{n}/merge-async` that GitHub runs in the background, then
 * `GET .../merge-async/{uuid}` until it settles. `sha` pins the merge to the head commit whose required checks were just read, so a
 * push that lands between the check and the merge makes GitHub refuse instead of merging an unchecked commit. `merge_action:
 * direct_merge` and `merge_method: squash` keep the one strategy this tool allows; `bypass_rules: false` keeps branch protection.
 */
export const ASYNC_MERGE_POLL_MS = 3000;
export const ASYNC_MERGE_TIMEOUT_MS = 5 * 60 * 1000;

/** Parses `gh api --include` output: the HTTP status from the first line, the JSON body after the blank line. */
export function parseGhApiInclude(raw) {
  const text = String(raw ?? '');
  const status = Number((text.match(/^HTTP\/[\d.]+\s+(\d{3})/m) ?? [])[1] ?? NaN);
  const split = text.search(/\r?\n\r?\n/);
  let body = null;
  if (split >= 0) {
    try {
      body = JSON.parse(text.slice(split).trim());
    } catch {
      body = null;
    }
  }
  return { status, body };
}

/**
 * What the PUT's answer means. 202 (accepted) and 409 (a request is already pending) both carry the uuid to poll; 200 means the PR is
 * already merged (or queued); 404 means this host has no async endpoint, so the caller uses `gh pr merge`; anything else is a refusal.
 */
export function classifyAsyncMergeStart({ status, body }) {
  if (status === 202 || status === 409) {
    return body?.uuid ? { kind: 'poll', uuid: body.uuid } : { kind: 'error', message: `HTTP ${status} without a request uuid` };
  }
  if (status === 200) return { kind: 'done', status: body?.status ?? 'merged', sha: body?.sha ?? null };
  if (status === 404) return { kind: 'unsupported' };
  return { kind: 'error', message: `HTTP ${Number.isNaN(status) ? 'error' : status}: ${body?.message ?? 'no message'}` };
}

/** A polled request's state: `merged` is success; `failed` and `enqueued` (never asked for: this tool merges directly) stop with its message. */
export function classifyAsyncMergeResult(body) {
  const status = body?.status;
  if (status === 'pending') return { kind: 'pending' };
  if (status === 'merged') return { kind: 'merged', sha: body?.sha ?? null };
  return { kind: 'failed', message: `${status ?? 'unknown'}: ${body?.message ?? 'no message'}` };
}

/**
 * Starts the async merge and waits for it. Returns { ok: true, sha } on a merge, { ok: false, unsupported: true } when the endpoint is
 * absent, or { ok: false, message } otherwise. `run(args)` is `gh` with the given args; `sleep(ms)` and `now()` are injectable for tests.
 */
export async function asyncMerge({ repo, prNumber, headSha, run, sleep, now = Date.now, pollMs = ASYNC_MERGE_POLL_MS, timeoutMs = ASYNC_MERGE_TIMEOUT_MS }) {
  const path = `repos/${repo}/pulls/${prNumber}/merge-async`;
  const start = classifyAsyncMergeStart(
    parseGhApiInclude(
      run([
        'api', '--include', '-X', 'PUT', path,
        '-f', 'merge_method=squash', '-f', 'merge_action=direct_merge', '-f', `sha=${headSha}`, '-F', 'bypass_rules=false',
      ]).stdout,
    ),
  );
  if (start.kind === 'unsupported') return { ok: false, unsupported: true };
  if (start.kind === 'error') return { ok: false, message: start.message };
  if (start.kind === 'done') {
    return start.status === 'merged' ? { ok: true, sha: start.sha } : { ok: false, message: `already ${start.status}` };
  }
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    await sleep(pollMs);
    const r = run(['api', `${path}/${start.uuid}`]);
    if (!r.ok) continue; // a transient read error: poll again until the deadline
    let body;
    try {
      body = JSON.parse(r.stdout);
    } catch {
      continue;
    }
    const result = classifyAsyncMergeResult(body);
    if (result.kind === 'merged') return { ok: true, sha: result.sha };
    if (result.kind === 'failed') return { ok: false, message: result.message };
  }
  return { ok: false, message: `still pending after ${Math.round(timeoutMs / 1000)}s (request ${start.uuid})` };
}

/**
 * After a merge call that did not report success, re-reads the PR until it reads MERGED or the attempts run out. The async API
 * merges in the background: observed 2026-10-05 on #2123 and #2124, the PUT answered `HTTP 202` with no uuid to poll, GitHub merged
 * a few seconds later, and a single immediate re-read still said OPEN, so pr-land exited 1 on a PR that had landed. Success is still
 * only claimed when GitHub itself reads MERGED. `readState()` returns the PR's state string (or null on a read error).
 */
export const MERGED_STATE_ATTEMPTS = 20;
export const MERGED_STATE_POLL_MS = 3000;
export async function waitForMergedState({ readState, sleep, attempts = MERGED_STATE_ATTEMPTS, pollMs = MERGED_STATE_POLL_MS }) {
  for (let i = 0; i < attempts; i += 1) {
    const state = readState();
    if (state === 'MERGED') return true;
    if (state === 'CLOSED') return false;
    if (i < attempts - 1) await sleep(pollMs);
  }
  return false;
}

/** Run a command, returning { ok, stdout, stderr }. Never throws. */
function exec(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  return { ok: r.status === 0 && !r.error, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() };
}

function ghJson(args, cwd) {
  const r = exec('gh', args, { cwd });
  if (!r.ok) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

function fetchRequiredContexts(cwd) {
  const contexts = ghJson(
    ['api', 'repos/{owner}/{repo}/branches/main/protection', '--jq', '.required_status_checks.contexts'],
    cwd,
  );
  if (Array.isArray(contexts) && contexts.length > 0) return { contexts, source: 'branch protection (live)' };
  return { contexts: DEFAULT_REQUIRED_CONTEXTS, source: 'DEFAULT_REQUIRED_CONTEXTS (branch protection unavailable)' };
}

function fetchPrInfo(prNumber, cwd) {
  return ghJson(
    [
      'pr', 'view', String(prNumber), '--json',
      'number,headRefName,baseRefName,state,headRefOid,statusCheckRollup,url',
    ],
    cwd,
  );
}

/** Resolve the canonical checkout via git worktree metadata — never a hardcoded path. */
function resolveCanonicalRoot() {
  const active = topLevelOf(process.cwd());
  if (!active) return null;
  return canonicalRootOf(active);
}

function isMarkedCanonical(dir) {
  const p = resolve(dir, '.helm/workspace.json');
  if (!existsSync(p)) return null; // unknown, not false — see AGENTS.md on absence-as-permission
  try {
    return JSON.parse(readFileSync(p, 'utf-8'))?.kind === 'canonical';
  } catch {
    return null;
  }
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write('usage: pr-land.mjs <pr-number> [--any-branch]\n');
    return 0;
  }
  if (args.error) {
    process.stderr.write(`${args.error}\n`);
    return 2;
  }

  const canonicalRoot = resolveCanonicalRoot();
  if (!canonicalRoot) {
    process.stderr.write('pr-land: could not resolve a git repository from the current directory\n');
    return 1;
  }
  const markedCanonical = isMarkedCanonical(canonicalRoot);
  if (markedCanonical === false) {
    process.stderr.write(
      `pr-land: ${canonicalRoot} does not carry .helm/workspace.json kind: canonical — refusing to guess\n`,
    );
    return 1;
  }

  const pr = fetchPrInfo(args.prNumber, canonicalRoot);
  if (!pr) {
    process.stderr.write(`pr-land: could not read PR #${args.prNumber} (gh unavailable, unauthenticated, or not found)\n`);
    return 1;
  }
  if (pr.state === 'MERGED') {
    process.stderr.write(`pr-land: PR #${args.prNumber} is already MERGED — nothing to merge, run --retire directly\n`);
    return 1;
  }
  if (pr.state !== 'OPEN') {
    process.stderr.write(`pr-land: PR #${args.prNumber} is ${pr.state}, not OPEN — refusing\n`);
    return 1;
  }
  if (!args.anyBranch && !String(pr.headRefName ?? '').startsWith('agent/')) {
    process.stderr.write(
      `pr-land: PR #${args.prNumber}'s branch '${pr.headRefName}' is not agent/* — pass --any-branch to override\n`,
    );
    return 1;
  }

  const { contexts, source } = fetchRequiredContexts(canonicalRoot);
  const gate = evaluateRequiredChecks(pr.statusCheckRollup, contexts);
  if (!gate.ok) {
    process.stderr.write(`pr-land: PR #${args.prNumber} is not green on all required contexts (${source}):\n`);
    if (gate.missing.length) process.stderr.write(`  missing: ${gate.missing.join(', ')}\n`);
    if (gate.failing.length) process.stderr.write(`  failing: ${gate.failing.join(', ')}\n`);
    return 1;
  }

  const repo = ghJson(['repo', 'view', '--json', 'nameWithOwner'], canonicalRoot)?.nameWithOwner;
  const shards = repo && pr.headRefOid
    ? checkUnitShards({ repo, sha: pr.headRefOid, run: (a) => exec('gh', a, { cwd: canonicalRoot }) })
    : { ok: false, runId: null, problems: ['could not resolve the repository or the head commit'] };
  if (!shards.ok) {
    // Follow-up pushes run the quick tier (ci.yml), so the full suite runs once, here, on the head about to merge.
    const dispatched = exec('gh', ['workflow', 'run', 'ci.yml', '--ref', String(pr.headRefName)], { cwd: canonicalRoot });
    process.stderr.write(
      `pr-land: PR #${args.prNumber} is green on its required contexts, but the whole unit suite has not run on ${String(pr.headRefOid ?? '').slice(0, 9)}:\n` +
        shards.problems.map((p) => `  ${p}\n`).join('') +
        (dispatched.ok
          ? `Started the full CI run on ${pr.headRefName} (gh workflow run ci.yml). Land it again when that run is green.\n`
          : `Could not start the full CI run (${String(dispatched.stderr ?? '').trim()}). Run \`gh workflow run ci.yml --ref ${pr.headRefName}\`, then land it again.\n`),
    );
    return 1;
  }

  process.stdout.write(
    `pr-land: PR #${args.prNumber} is green on all ${contexts.length} required contexts (${source}) and CI run ${shards.runId} ran all ${UNIT_SHARDS.length} unit shards — merging\n`,
  );
  // The async merge API pins the squash to the head whose checks were just read; a host without it falls back to `gh pr merge`.
  let mergedVia = 'async merge API (squash, pinned to the checked head)';
  let merge;
  if (repo && pr.headRefOid) {
    const r = await asyncMerge({
      repo,
      prNumber: args.prNumber,
      headSha: pr.headRefOid,
      run: (a) => exec('gh', a, { cwd: canonicalRoot }),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });
    merge = r.ok ? { ok: true, stdout: '', stderr: '' } : { ok: false, stdout: '', stderr: r.message ?? '' };
    if (r.unsupported) {
      mergedVia = 'gh pr merge --squash (no async merge endpoint)';
      merge = exec('gh', ['pr', 'merge', String(args.prNumber), '--squash', '--match-head-commit', pr.headRefOid], { cwd: canonicalRoot });
    }
  } else {
    mergedVia = 'gh pr merge --squash';
    merge = exec('gh', ['pr', 'merge', String(args.prNumber), '--squash'], { cwd: canonicalRoot });
  }
  if (!merge.ok) {
    // A transport error can arrive after GitHub accepts the merge. Re-read
    // its state before reporting failure. Branch deletion belongs to the
    // lifecycle tool so it can verify an archive before removing either ref.
    const merged = await waitForMergedState({
      readState: () => ghJson(['pr', 'view', String(args.prNumber), '--json', 'state'], canonicalRoot)?.state ?? null,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });
    if (!merged) {
      process.stderr.write(`pr-land: merge failed (${mergedVia}):\n${merge.stderr || merge.stdout}\n`);
      return 1;
    }
    process.stdout.write(
      'pr-land: confirmed merged; branch archival and deletion deferred to --retire\n',
    );
  }

  const canonicalBranch = exec('git', ['branch', '--show-current'], { cwd: canonicalRoot }).stdout;
  const sync = canonicalSyncPlan(canonicalBranch);
  const pull = exec('git', sync.args, { cwd: canonicalRoot });
  if (!pull.ok && sync.fatal) {
    process.stderr.write(
      `pr-land: PR #${args.prNumber} merged, but 'git ${sync.args.join(' ')}' in ${canonicalRoot} failed:\n${pull.stderr || pull.stdout}\n` +
        'Resolve manually, then run: node scripts/worktree-lifecycle.mjs --retire\n',
    );
    return 1;
  }
  if (!pull.ok) {
    process.stderr.write(
      `pr-land: canonical is on '${canonicalBranch || '(detached)'}', not main; 'git ${sync.args.join(' ')}' failed ` +
        `(${pull.stderr || pull.stdout}) — local main not updated, continuing to --retire\n`,
    );
  } else if (canonicalBranch !== 'main') {
    process.stdout.write(`pr-land: canonical is on '${canonicalBranch || '(detached)'}'; updated local main without touching it\n`);
  }

  // Retire THIS PR's worktree and branch first, by name, so the result is
  // stated for the thing just landed rather than buried in a repo-wide table.
  // Then the usual sweep, unchanged.
  const retireScript = resolve(HERE, 'worktree-lifecycle.mjs');
  const own = exec('node', [retireScript, '--retire', '--branch', pr.headRefName], { cwd: canonicalRoot });
  process.stdout.write(own.stdout ? `${own.stdout}\n` : '');
  if (own.stderr) process.stderr.write(`${own.stderr}\n`);
  const retire = exec('node', [retireScript, '--retire'], { cwd: canonicalRoot });
  process.stdout.write(retire.stdout ? `${retire.stdout}\n` : '');
  if (retire.stderr) process.stderr.write(`${retire.stderr}\n`);
  const residue = landedResidue(
    exec('git', ['worktree', 'list', '--porcelain'], { cwd: canonicalRoot }).stdout,
    exec('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${pr.headRefName}`], { cwd: canonicalRoot }).ok,
    pr.headRefName,
  );

  process.stdout.write('\n');
  process.stdout.write(`pr-land summary for #${args.prNumber}\n`);
  process.stdout.write(`  merged:  ${mergedVia} (branch ${pr.headRefName})\n`);
  process.stdout.write(`  pulled:  ${canonicalRoot} fast-forwarded to origin/main\n`);
  process.stdout.write(`  retired: ${retire.ok ? 'worktree-lifecycle.mjs --retire ran' : 'worktree-lifecycle.mjs --retire reported an issue — see above'}\n`);
  process.stdout.write(`  ${pr.headRefName}: ${residue}\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
