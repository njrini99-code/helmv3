// WHERE AM I? — repo + workspace identity. The deterministic answer to the
// question an agent could not answer on 2026-08-20, which is why it edited the
// wrong checkout and reported success.

import { git } from '../lib/exec.mjs';
import { check, Status } from '../result.mjs';

/** Normalise a git remote URL to `owner/name`, protocol-agnostic. */
function normRemote(url) {
  if (!url) return null;
  const m = url
    .replace(/\.git$/, '')
    .match(/[/:]([^/:]+\/[^/]+)$/);
  return m ? m[1] : null;
}

export const meta = { id: 'identity', title: 'Repository & workspace identity' };

export async function run(ctx) {
  const out = [];
  const { repoRoot, manifest } = ctx;

  // 1. Remote identity — is this the repo the manifest says it is?
  const remote = git(repoRoot, ['remote', 'get-url', 'origin']);
  const expected = manifest?.repository?.remote ?? null;
  if (!remote.ok) {
    out.push(check('identity.remote', Status.UNKNOWN, 'origin remote unreadable', {
      detail: remote.error,
    }));
  } else {
    const got = normRemote(remote.value);
    out.push(
      got === expected
        ? check('identity.remote', Status.PASS, `origin is ${got}`)
        : check('identity.remote', Status.FAIL, 'origin remote is not the expected repository', {
            expected,
            actual: got,
            source: 'config/repo/manifest.yml',
          }),
    );
  }

  // 2. cwd is the git top-level (not a subdir, not a different tree).
  const top = git(repoRoot, ['rev-parse', '--show-toplevel']);
  if (top.ok) {
    out.push(
      top.value === repoRoot
        ? check('identity.toplevel', Status.PASS, 'cwd is the repository top-level')
        : check('identity.toplevel', Status.WARN, 'cwd is not the git top-level', {
            expected: top.value,
            actual: repoRoot,
          }),
    );
  }

  // 3. Is this the canonical checkout or a linked worktree? (informational —
  //    a linked worktree has a .git FILE, the canonical one a directory.)
  const common = git(repoRoot, ['rev-parse', '--git-common-dir']);
  const gitDir = git(repoRoot, ['rev-parse', '--git-dir']);
  if (common.ok && gitDir.ok) {
    const linked = common.value !== gitDir.value;
    out.push(
      check('identity.checkout-kind', Status.PASS,
        linked ? 'running in a linked worktree' : 'running in the canonical checkout'),
    );
  }

  return out;
}
