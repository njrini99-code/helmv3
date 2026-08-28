// WHERE AM I? — repo + workspace identity. The deterministic answer to the
// question an agent could not answer on 2026-08-20, which is why it edited the
// wrong checkout and reported success.

import { git } from '../lib/exec.mjs';
import { check, Status } from '../result.mjs';
import { workspaceRoots } from '../../../.claude/hooks/lib/workspace-identity.mjs';

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

  // 2 and 3 both come from the ONE identity authority now
  //     .claude/hooks/lib/workspace-identity.mjs
  // rather than from a second set of `git rev-parse` calls owned here.
  //
  // The git calls this replaces were not wrong — git's own top-level is the
  // right source. What was wrong is that this file owned a PARALLEL
  // implementation of the same question, free to drift from the hooks' one.
  // A doctor that can disagree with the thing it inspects is not a doctor.
  const ws = workspaceRoots({ cwd: repoRoot });

  out.push(
    ws.activeRoot === repoRoot
      ? check('identity.toplevel', Status.PASS, 'cwd is the repository top-level')
      : check('identity.toplevel', Status.WARN, 'cwd is not the git top-level', {
          expected: ws.activeRoot,
          actual: repoRoot,
        }),
  );

  if (ws.inRepo) {
    out.push(
      check('identity.checkout-kind', Status.PASS,
        ws.kind === 'task'
          ? 'running in a linked worktree'
          : 'running in the canonical checkout'),
    );
  }

  return out;
}
