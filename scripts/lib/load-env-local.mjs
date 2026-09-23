// scripts/lib/load-env-local.mjs — resolve the canonical repo root the same
// way scripts/deploy-prod.sh does (the parent of `git rev-parse
// --git-common-dir`, the shared .git regardless of which worktree this
// process actually runs from) and load .env.local from there.
//
// WHY NOT A HARDCODED PATH. Several one-off smoke scripts
// (admin-rollup-smoke.mjs, rpc-smoke.mjs) used to `readFileSync` a literal
// `/Users/ricknini/Downloads/helmv3/.env.local` — correct for exactly one
// machine and one checkout location, and silently wrong (a bare ENOENT with
// no context) from any worktree, any other machine, or a differently-named
// clone.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';

/** The canonical repo root, resolved from wherever this process actually runs. */
export function repoRoot() {
  const gitCommonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    encoding: 'utf8',
  }).trim();
  // The shared .git dir's parent is the canonical root whether this process
  // is running from that root directly or from a linked worktree.
  return dirname(resolve(gitCommonDir));
}

/** Parses a simple KEY=VALUE .env file (no quoting/escaping beyond what this
 * repo's own prior inline parsers already assumed) into a plain object. */
function parseEnvFile(text) {
  return Object.fromEntries(
    text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => l.split('='))
      .map(([k, ...v]) => [k.trim(), v.join('=').trim()]),
  );
}

/**
 * Loads .env.local from the canonical repo root and returns it as a plain
 * object. Throws a clear, path-naming error rather than a bare ENOENT when
 * it is absent — expected in any worktree, since `.worktreeinclude`
 * withholds it deliberately.
 */
export function loadEnvLocal() {
  const root = repoRoot();
  const path = join(root, '.env.local');
  if (!existsSync(path)) {
    throw new Error(
      `.env.local not found at ${path} (resolved repo root: ${root}). ` +
        'Worktrees do not get one (.worktreeinclude withholds it deliberately) — ' +
        'run this from the canonical checkout, or export the needed vars yourself.',
    );
  }
  return parseEnvFile(readFileSync(path, 'utf8'));
}
