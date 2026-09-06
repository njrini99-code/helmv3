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
 *   2. Refuses a PR whose branch is not `agent/*`, unless --any-branch is
 *      passed — this tool is for the agent-worktree workflow, not for
 *      landing arbitrary branches on someone's behalf.
 *   3. Merges with `gh pr merge --squash --delete-branch`. Never force-push,
 *      never any other merge strategy.
 *   4. Fast-forwards the CANONICAL checkout (resolved from git worktree
 *      metadata, never a hardcoded path) with `git pull --ff-only`.
 *   5. Runs `node scripts/worktree-lifecycle.mjs --retire` from the
 *      canonical checkout, which parks the now-disposable worktree and
 *      deletes the branch under the DELETE_MERGED_EXACT proof standard
 *      (see scripts/lib/worktree-lifecycle.mjs, including the no-upstream
 *      case #1863 added — a merged PR's head OID is stronger evidence than a
 *      remote ref that `gh --delete-branch` already removed).
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

  process.stdout.write(`pr-land: PR #${args.prNumber} is green on all ${contexts.length} required contexts (${source}) — merging\n`);
  const merge = exec('gh', ['pr', 'merge', String(args.prNumber), '--squash', '--delete-branch'], { cwd: canonicalRoot });
  if (!merge.ok) {
    process.stderr.write(`pr-land: gh pr merge failed:\n${merge.stderr || merge.stdout}\n`);
    return 1;
  }

  const pull = exec('git', ['pull', '--ff-only'], { cwd: canonicalRoot });
  if (!pull.ok) {
    process.stderr.write(
      `pr-land: PR #${args.prNumber} merged, but 'git pull --ff-only' in ${canonicalRoot} failed:\n${pull.stderr || pull.stdout}\n` +
        'Resolve manually, then run: node scripts/worktree-lifecycle.mjs --retire\n',
    );
    return 1;
  }

  const retireScript = resolve(HERE, 'worktree-lifecycle.mjs');
  const retire = exec('node', [retireScript, '--retire'], { cwd: canonicalRoot });
  process.stdout.write(retire.stdout ? `${retire.stdout}\n` : '');
  if (retire.stderr) process.stderr.write(`${retire.stderr}\n`);

  process.stdout.write('\n');
  process.stdout.write(`pr-land summary for #${args.prNumber}\n`);
  process.stdout.write(`  merged:  gh pr merge --squash --delete-branch (branch ${pr.headRefName})\n`);
  process.stdout.write(`  pulled:  ${canonicalRoot} fast-forwarded to origin/main\n`);
  process.stdout.write(`  retired: ${retire.ok ? 'worktree-lifecycle.mjs --retire ran' : 'worktree-lifecycle.mjs --retire reported an issue — see above'}\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
