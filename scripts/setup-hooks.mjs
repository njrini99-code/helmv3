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
 * machine too. Resolve the canonical .githooks directory through Git's common
 * directory, so all branches use the same local checks and an old checkout
 * cannot bring back retired gates merely by running npm install.
 *
 * Never throws and never exits non-zero — a `prepare` script runs on every
 * install, including a tarball install with no .git directory (e.g. a
 * production `npm ci` of a published package), and a failure here must
 * never fail the install.
 */

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

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

  const hooksPath = join(dirname(run(['rev-parse', '--path-format=absolute', '--git-common-dir'])), '.githooks');
  let current = '';
  try {
    current = run(['config', '--get', 'core.hooksPath']);
  } catch {
    current = '';
  }

  if (current === hooksPath) {
    console.log(`setup-hooks: core.hooksPath already "${hooksPath}" — nothing to do.`);
    return;
  }

  try {
    run(['config', 'core.hooksPath', hooksPath]);
    console.log(
      `setup-hooks: core.hooksPath set to "${hooksPath}" (was ${current ? `"${current}"` : 'unset'}). ` +
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
