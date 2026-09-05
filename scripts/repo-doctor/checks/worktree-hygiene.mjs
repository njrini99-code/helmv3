// Worktree hygiene: two failure modes AGENTS.md's canonicality section
// exists to prevent, checked from whichever checkout repo:doctor happens to
// run in (a linked worktree can see every worktree the repo has — the object
// store is shared).
//
//   worktree.canonical-off-main     the canonical checkout's branch is not
//                                   `main` and no open PR exists for it.
//                                   WARN, not FAIL: a task legitimately runs
//                                   in canonical for a session (AGENTS.md:
//                                   "a single active session may work in the
//                                   canonical checkout directly"), and this
//                                   is a nudge to open a PR or return home,
//                                   not a hard invariant.
//
//   worktree.oversized-next         a `.next` build cache over 4 GB under the
//                                   canonical checkout or ~/worktrees/helmv3.
//                                   WARN — `rm -rf .next` is a valid fix but
//                                   never automatic (shipping.md: it wedges
//                                   Turbopack cold-compile for the rest of
//                                   the session).
//
// A THIRD check — "does every worktree carry .helm/workspace.json" — was
// built here first (2026-09-05) and then DELETED the same day, in the same
// change, once merging origin/main made the duplication visible: checks/
// workspace.mjs (owned by #1840/A1, "one door") already added
// `workspace.worktree-markers`, doing the identical check with the SAME
// classifier `.claude/hooks/stamp-workspace.mjs` and
// `.claude/hooks/worktree-create.mjs` rely on. Shipping two independent
// implementations of "is this worktree marked" is exactly the kind of
// second authority this whole reset exists to remove — the first version
// of this file even carried a comment explaining why `.claude/worktrees/*`
// needed a special exemption that workspace.mjs's own author had already
// solved a different way (WorktreeCreate stamps synchronously at creation).
// If you came here looking for that check, it is
// checks/workspace.mjs's `workspace.worktree-markers`.

import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { canonicalRootOf } from '../../../.claude/hooks/lib/workspace-identity.mjs';
import { git } from '../lib/exec.mjs';
import { check, Status } from '../result.mjs';

export const meta = { id: 'worktree', title: 'Worktree hygiene' };

const NEXT_WARN_BYTES = 4 * 1024 * 1024 * 1024; // 4 GiB

/** `du -sk <dir>` in KiB, or null when the directory is absent/unreadable. */
function dirKib(dir) {
  if (!existsSync(dir)) return null;
  const r = spawnSync('du', ['-sk', dir], { encoding: 'utf-8', timeout: 20000 });
  if (r.status !== 0 || !r.stdout) return null;
  const n = Number.parseInt(r.stdout.split('\t')[0], 10);
  return Number.isNaN(n) ? null : n;
}

function ghPrOpenForBranch(branch, cwd) {
  const r = spawnSync('gh', ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number', '--jq', 'length'], {
    encoding: 'utf-8',
    cwd,
    timeout: 10000,
  });
  if (r.status !== 0 || r.error) return null; // gh unavailable/unauthenticated/network-blocked
  const n = Number.parseInt((r.stdout ?? '').trim(), 10);
  return Number.isNaN(n) ? null : n;
}

export async function run(ctx) {
  const out = [];
  const { repoRoot } = ctx;
  const homeDir = ctx.homeDir ?? homedir();
  const canonicalRoot = canonicalRootOf(repoRoot);

  // --- canonical off main, no open PR ---
  const branchR = git(canonicalRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branchR.ok) {
    out.push(check('worktree.canonical-off-main', Status.UNKNOWN, 'could not read the canonical checkout\'s branch', { detail: branchR.error }));
  } else if (branchR.value === 'main') {
    out.push(check('worktree.canonical-off-main', Status.PASS, 'canonical checkout is on main'));
  } else {
    const openCount = ghPrOpenForBranch(branchR.value, canonicalRoot);
    if (openCount === null) {
      // `gh` unreachable (no auth, no network, or — inside this repo's own
      // Bash sandbox — TLS cannot read the macOS keychain) is a known,
      // frequent condition, not a control failure. LOCAL_ONLY never affects
      // the exit code (see db-observability.mjs's precedent), which is the
      // right shape here: "could not check" must never become "exit 2" on
      // every sandboxed run of a check that has nothing to do with gh being
      // reachable.
      out.push(check('worktree.canonical-off-main', Status.LOCAL_ONLY,
        `canonical is on '${branchR.value}', not main — could not confirm an open PR (gh unavailable)`));
    } else if (openCount > 0) {
      out.push(check('worktree.canonical-off-main', Status.PASS, `canonical is on '${branchR.value}', which has an open PR`));
    } else {
      out.push(check('worktree.canonical-off-main', Status.WARN,
        `canonical checkout is on '${branchR.value}', not main, with no open PR — AGENTS.md: "main is home"`, {
          expected: 'main',
          actual: branchR.value,
        }));
    }
  }

  // --- oversized .next ---
  const nextDirs = [join(canonicalRoot, '.next')];
  const wtRoot = join(homeDir, 'worktrees', 'helmv3');
  if (existsSync(wtRoot)) {
    for (const name of readdirSync(wtRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
      nextDirs.push(join(wtRoot, name, '.next'));
    }
  }
  const oversized = [];
  for (const d of nextDirs) {
    const kib = dirKib(d);
    if (kib !== null && kib * 1024 > NEXT_WARN_BYTES) oversized.push({ dir: d, gib: Math.round((kib * 1024) / (1024 ** 3)) });
  }
  out.push(
    oversized.length === 0
      ? check('worktree.oversized-next', Status.PASS, `no .next build cache over ${NEXT_WARN_BYTES / 1024 ** 3} GiB found`)
      : check('worktree.oversized-next', Status.WARN, `${oversized.length} .next build cache(s) over ${NEXT_WARN_BYTES / 1024 ** 3} GiB`, {
          evidence: oversized,
        }),
  );

  return out;
}
