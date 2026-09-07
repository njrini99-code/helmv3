#!/usr/bin/env node
/**
 * scripts/setup-hooks.mjs — point core.hooksPath at the tracked .githooks/
 * directory instead of the untracked, unreviewable .git/hooks/.
 *
 * Run automatically by the `prepare` npm lifecycle script (every
 * `npm install`/`npm ci` in a git checkout) and by hand via `npm run
 * hooks:install`. Idempotent: running it twice, or on a checkout that
 * already has the right value, does nothing.
 *
 * core.hooksPath lives in the SHARED git config (.git/config at the common
 * dir, not per-worktree) — one `npm install` from any worktree changes hook
 * behavior for the canonical checkout and every other worktree on this
 * machine too. The value this script writes is the RELATIVE path
 * `.githooks`, never an absolute one: git resolves a relative
 * core.hooksPath against each working tree's own top level, so the single
 * shared config entry still runs each worktree's own checked-out hooks
 * (its own .githooks/pre-push, at its own commit) rather than pinning every
 * worktree to whichever checkout happened to run this script.
 *
 * Never throws and never exits non-zero — a `prepare` script runs on every
 * install, including a tarball install with no .git directory (e.g. a
 * production `npm ci` of a published package), and a failure here must
 * never fail the install.
 */

import { execFileSync } from 'node:child_process';

const HOOKS_PATH = '.githooks';

function run(args) {
  return execFileSync('git', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function main() {
  // CI checks out a disposable clone for one job and never commits from it —
  // wiring hooksPath there buys nothing and risks interacting oddly with
  // whatever git config the runner image already sets.
  if (process.env.CI === 'true' || process.env.CI === '1') {
    console.log('setup-hooks: CI=true — skipping (hooks are a local-dev convenience only).');
    return;
  }

  let inGitRepo = false;
  try {
    inGitRepo = run(['rev-parse', '--is-inside-work-tree']) === 'true';
  } catch {
    inGitRepo = false;
  }

  if (!inGitRepo) {
    console.log('setup-hooks: not inside a git working tree — skipping.');
    return;
  }

  let current = '';
  try {
    current = run(['config', '--get', 'core.hooksPath']);
  } catch {
    current = '';
  }

  if (current === HOOKS_PATH) {
    console.log(`setup-hooks: core.hooksPath already "${HOOKS_PATH}" — nothing to do.`);
    return;
  }

  try {
    run(['config', 'core.hooksPath', HOOKS_PATH]);
    console.log(
      `setup-hooks: core.hooksPath set to "${HOOKS_PATH}" (was ${current ? `"${current}"` : 'unset'}). ` +
        'Runs .githooks/pre-commit and .githooks/pre-push from now on.'
    );
  } catch (err) {
    console.log(`setup-hooks: could not set core.hooksPath (${err.message}) — continuing without it.`);
  }
}

try {
  main();
} catch (err) {
  console.log(`setup-hooks: unexpected error (${err.message}) — continuing without it.`);
}
