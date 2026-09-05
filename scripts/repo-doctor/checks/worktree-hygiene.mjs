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
//                                   `.claude/worktrees/agent-*` (the
//                                   harness's OWN worktree isolation) is NOT
//                                   exempt from this, even though it once
//                                   would have had to be: this file's first
//                                   draft (2026-09-05, this same change)
//                                   excluded that path by name because
//                                   nothing marked it. That stopped being
//                                   true the moment #1840 (A1, "one door")
//                                   merged into this same branch —
//                                   .claude/hooks/worktree-create.mjs now
//                                   routes the harness's own `isolation:
//                                   "worktree"` request through
//                                   createWorkspace(), which writes the
//                                   marker SYNCHRONOUSLY as part of creation
//                                   (scripts/lib/create-workspace.mjs line
//                                   ~316) — before the worktree exists to be
//                                   observed unmarked — and
//                                   .claude/hooks/stamp-workspace.mjs
//                                   backstops any OLDER harness worktree at
//                                   its next SessionStart. Verified live: the
//                                   two pre-existing `.claude/worktrees/
//                                   agent-*` checkouts on this machine both
//                                   carry a marker. An unmarked one now is a
//                                   real finding — the backstop failed to
//                                   run, or hooks are disabled — not an
//                                   expected structural gap.
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

/**
 * True for a worktree the harness's own `isolation: "worktree"` /
 * EnterWorktree feature created (`.claude/worktrees/agent-*`). No longer
 * used to EXEMPT anything from the unmarked-worktree check (see that
 * check's own header) — kept because a harness-made worktree is still worth
 * labelling distinctly in evidence, so a reader isn't left guessing whether
 * an unmarked one came from a hand-rolled `git worktree add` or from the
 * harness's own door failing to stamp it.
 */
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
    // The canonical checkout is the only structural exclusion left — it is
    // not itself a "worktree" the lifecycle tool ever classifies. Harness
    // worktrees are included: WorktreeCreate + stamp-workspace.mjs (both
    // wired since #1840/A1) mean an unmarked one is a real finding now, not
    // an expected gap — see this module's header.
    const candidates = paths.filter((p) => realpathOrSelf(p) !== canonicalRootReal);
    const unmarked = candidates.filter((p) => !existsSync(join(p, '.helm', 'workspace.json')));
    out.push(
      unmarked.length === 0
        ? check('worktree.unmarked-worktree', Status.PASS,
            `${candidates.length} non-canonical worktree(s), all carry .helm/workspace.json`)
        : check('worktree.unmarked-worktree', Status.FAIL,
            `${unmarked.length} worktree(s) with no .helm/workspace.json — scripts/worktree-lifecycle.mjs cannot classify them`, {
              evidence: unmarked.map((p) => ({
                path: p,
                harnessMade: isHarnessWorktree(p, canonicalRootReal),
              })),
              source: 'scripts/new-worktree.sh, or .claude/hooks/worktree-create.mjs + stamp-workspace.mjs for harness-made worktrees — every path is expected to write this marker now',
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
