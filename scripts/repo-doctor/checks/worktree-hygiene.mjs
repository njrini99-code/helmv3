// Worktree hygiene: three failure modes AGENTS.md's canonicality section
// exists to prevent, checked from whichever checkout repo:doctor happens to
// run in (a linked worktree can see every worktree the repo has — the object
// store and `git worktree list` are shared).
//
//   worktree.unmarked-worktree      a checkout `git worktree add` produced
//                                   with no .helm/workspace.json — the
//                                   lifecycle tool cannot classify it
//                                   (verdict KEEP_WORKSPACE_INTENT_REQUIRED
//                                   forever) and nobody can tell whether it
//                                   is disposable. FAIL.
//
//                                   The harness's OWN worktree isolation
//                                   (`.claude/worktrees/agent-*`, made by
//                                   EnterWorktree / isolation:"worktree")
//                                   never writes this marker — AGENTS.md
//                                   documents that as the harness's known
//                                   gap, not a violation of the one-door
//                                   policy `new-worktree.sh` enforces for
//                                   everything else. Flagging it here would
//                                   be permanently, unfixably red on this
//                                   machine, so those paths are excluded by
//                                   name, not silently ignored — see the
//                                   `isHarnessWorktree` comment below.
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

import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { canonicalRootOf } from '../../../.claude/hooks/lib/workspace-identity.mjs';
import { git } from '../lib/exec.mjs';
import { check, Status } from '../result.mjs';

/**
 * Real path, or the input unchanged when it cannot be resolved (already
 * gone, or a fixture path in a test). `canonicalRootOf()` preserves the
 * CALLER's own spelling when the caller is already at the repo top-level
 * (workspace-identity.mjs's own documented reason: relativising an edited
 * path against a mismatched spelling produces a `../../` that matches no
 * governed pattern), while `git worktree list --porcelain` always reports
 * ITS resolved path. On a machine where the repo sits under a symlinked
 * prefix (macOS's `/tmp` -> `/private/tmp`, `/var` -> `/private/var` — which
 * is exactly where every fixture in this module's own tests lives) those two
 * strings differ for the SAME directory. Comparing realpaths, not raw
 * strings, is what keeps the canonical-checkout exclusion from silently
 * failing on such a machine and flagging canonical as an "unmarked worktree".
 */
function realpathOrSelf(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

export const meta = { id: 'worktree', title: 'Worktree hygiene' };

const NEXT_WARN_BYTES = 4 * 1024 * 1024 * 1024; // 4 GiB

/** True for a worktree the harness itself created — never marked, by design. */
export function isHarnessWorktree(path, canonicalRoot) {
  return path.startsWith(join(canonicalRoot, '.claude', 'worktrees') + '/') || path === join(canonicalRoot, '.claude', 'worktrees');
}

export function parseWorktreeList(porcelain) {
  return (porcelain ?? '')
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => resolve(l.slice('worktree '.length)));
}

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
  const canonicalRootReal = realpathOrSelf(canonicalRoot);

  // --- unmarked worktree ---
  const wt = git(repoRoot, ['worktree', 'list', '--porcelain']);
  if (!wt.ok) {
    out.push(check('worktree.unmarked-worktree', Status.UNKNOWN, 'git worktree list failed', { detail: wt.error }));
  } else {
    const paths = parseWorktreeList(wt.value);
    const candidates = paths.filter(
      (p) => realpathOrSelf(p) !== canonicalRootReal && !isHarnessWorktree(realpathOrSelf(p), canonicalRootReal),
    );
    const unmarked = candidates.filter((p) => !existsSync(join(p, '.helm', 'workspace.json')));
    out.push(
      unmarked.length === 0
        ? check('worktree.unmarked-worktree', Status.PASS,
            `${candidates.length} non-canonical, non-harness worktree(s), all carry .helm/workspace.json`)
        : check('worktree.unmarked-worktree', Status.FAIL,
            `${unmarked.length} worktree(s) with no .helm/workspace.json — scripts/worktree-lifecycle.mjs cannot classify them`, {
              evidence: unmarked,
              source: 'scripts/new-worktree.sh (the one supported creator, which always writes the marker)',
            }),
    );
  }

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
