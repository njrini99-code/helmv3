#!/usr/bin/env node
/**
 * pr-drift-gate — fail a pull request only for drift the PR itself introduced.
 *
 *   node scripts/github/pr-drift-gate.mjs [--allow-merge-skew] -- <command...>
 *
 * WHY (2026-09-23). The generated-artifact checks (`docs:inventory-check`,
 * `knowledge:world-model:check`, the document inventory, the feature map, the
 * enforcement inventory, the tool-authority matrix) compare a generated file
 * to its sources. A `pull_request` run checks out the MERGE of the PR into
 * the current `main`, so those checks went red whenever `main` moved:
 *
 *   inherited   main itself was stale (something landed without a regen), so
 *               every PR opened after it failed the same step
 *   skew        two PRs each regenerated the same file; git merged the text
 *               cleanly but the counts in it describe neither tree
 *
 * Neither is something the PR can fix except by rebasing and regenerating on
 * top of somebody else's change — which then races the next merge.
 *
 * WHAT THIS DOES. Runs <command> on the checked-out tree (the merge). If it
 * passes, done. If it fails on a pull_request (PR_BASE_SHA / PR_HEAD_SHA set):
 *
 *   1. run the same command on the BASE commit (current main). Fails there
 *      too -> inherited: a warning, exit 0. That is main's to fix, and
 *      Docs Regen (push to main) opens the regeneration PR for it.
 *   2. with --allow-merge-skew only (generated artifacts, never a real
 *      invariant): run it on the PR's own HEAD. Passes there -> skew: the PR
 *      is internally consistent, only the combination is stale. A warning,
 *      exit 0; Docs Regen regenerates after the merge.
 *   3. otherwise the PR introduced the drift: exit with the original status.
 *
 * On `push` with --allow-merge-skew, a failure is reported as a warning: on
 * main the enforcement point is .github/workflows/docs-regen.yml, which
 * regenerates and opens the PR instead of painting main's CI red.
 *
 * Each extra tree is a detached `git worktree` under $RUNNER_TEMP with a
 * symlink to this checkout's node_modules, created once and reused by every
 * invocation in the job. It runs that tree's OWN scripts (a generator that
 * resolves its root from its file location and one that uses cwd both land
 * on the tree being asked about). Requires `fetch-depth: 0`.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
if (sep === -1 || sep === argv.length - 1) {
  console.error('usage: pr-drift-gate.mjs [--allow-merge-skew] -- <command...>');
  process.exit(2);
}
const flags = argv.slice(0, sep);
const [cmd, ...cmdArgs] = argv.slice(sep + 1);
const allowSkew = flags.includes('--allow-merge-skew');

const ROOT = process.cwd();
const EVENT = process.env.GITHUB_EVENT_NAME ?? '';
const BASE = process.env.PR_BASE_SHA ?? '';
const HEAD = process.env.PR_HEAD_SHA ?? '';
const label = [cmd, ...cmdArgs].join(' ');

function run(cwd) {
  const r = spawnSync(cmd, cmdArgs, { cwd, stdio: 'inherit', env: process.env });
  if (r.error) {
    console.error(`pr-drift-gate: could not run ${label}: ${r.error.message}`);
    return 2;
  }
  return r.status ?? 1;
}

/** A detached worktree of <sha>, reused across invocations in one job. */
function treeAt(name, sha) {
  const root = resolve(process.env.RUNNER_TEMP || tmpdir(), 'pr-drift-trees');
  const dir = join(root, `${name}-${sha.slice(0, 12)}`);
  if (!existsSync(dir)) {
    mkdirSync(root, { recursive: true });
    execFileSync('git', ['worktree', 'add', '--detach', '--quiet', dir, sha], { cwd: ROOT, stdio: 'inherit' });
    const nm = join(ROOT, 'node_modules');
    if (existsSync(nm)) symlinkSync(nm, join(dir, 'node_modules'), 'dir');
  }
  return dir;
}

function quietRun(name, sha) {
  console.log(`\n::group::pr-drift-gate: re-running on ${name} (${sha.slice(0, 12)}): ${label}`);
  let status;
  try {
    status = run(treeAt(name, sha));
  } catch (err) {
    console.log(`pr-drift-gate: could not prepare the ${name} tree: ${err.message}`);
    status = null;
  }
  console.log('::endgroup::');
  return status;
}

const first = run(ROOT);
if (first === 0) process.exit(0);

if (EVENT === 'push' && allowSkew) {
  console.log(
    `::warning::${label} is stale on this push. Generated artifacts on main are repaired by ` +
      '.github/workflows/docs-regen.yml (it opens the regeneration PR), not by failing main\'s CI.',
  );
  process.exit(0);
}

if (EVENT !== 'pull_request' || !BASE || !HEAD) process.exit(first);

const onBase = quietRun('base', BASE);
if (onBase !== null && onBase !== 0) {
  console.log(
    `::warning::${label} also fails on the base commit (main, ${BASE.slice(0, 12)}) — inherited, ` +
      'not introduced by this PR. Not blocking; main\'s repair is Docs Regen / the owning check.',
  );
  process.exit(0);
}

if (allowSkew) {
  const onHead = quietRun('head', HEAD);
  if (onHead === 0) {
    console.log(
      `::warning::${label} passes on this PR's own head and on main, but not on their merge — two ` +
        'changes regenerated the same artifact. Not blocking; Docs Regen regenerates after merge. ' +
        'To clear it now: merge main into the branch and re-run the generator.',
    );
    process.exit(0);
  }
}

console.log(`::error::${label} fails on this PR and passes on main — the drift is introduced by this PR.`);
process.exit(first);
