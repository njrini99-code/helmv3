// .claude/hooks/lib/workspace-identity.mjs
//
// ONE answer to "where am I?" — consumed by every hook, by repo:doctor, and
// by the Stop verifier. Nothing else may compute workspace identity.
//
// WHY THIS EXISTS (the bug it fixes, measured 2026-08-27)
//
// Six call sites resolved the repo root as:
//
//     process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd()
//
// CLAUDE_PROJECT_DIR is the ORIGINAL project directory. It does NOT move when
// the session is working inside a git worktree. So an agent editing
//
//     ~/worktrees/helmv3/fix-messaging/src/app/golf/actions/messages.ts
//
// was told the branch, dirty state, and ahead/behind of
//
//     /Users/ricknini/Downloads/helmv3
//
// Two concrete consequences, not hypotheticals:
//
//   1. Wrong identity injected at SessionStart. The agent reads a branch it is
//      not on and a clean/dirty state that belongs to another checkout.
//   2. Governance silently skipped. feature-map's relative() of an edited path
//      against the WRONG root yields '../../worktrees/...', which matches no
//      GOVERNED_PATTERNS entry, so guard-feature-context lets the edit through
//      and stop-check records nothing. The gate does not fail loudly — it
//      simply stops seeing the file.
//
// The fix is ordering: the hook's OWN cwd first, resolved to its git
// top-level, because in a worktree that top-level IS the worktree. Env var
// last, as a fallback for callers that pass no cwd.

import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { resolve, dirname, isAbsolute, join } from 'node:path';

/** Run git, returning trimmed stdout or null. Never throws. */
function git(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * The git top-level of `dir`, or null when `dir` is not inside a work tree.
 * In a linked worktree this returns the WORKTREE path, which is the whole
 * point of this module.
 */
export function topLevelOf(dir) {
  if (!dir || !existsSync(dir)) return null;
  const top = git(['rev-parse', '--show-toplevel'], dir);
  if (!top) return null;
  // PRESERVE THE CALLER'S SPELLING when `dir` already IS the top-level.
  //
  // git resolves symlinks: on macOS a temp dir handed in as
  //   /var/folders/xx/T/repo
  // comes back from --show-toplevel as
  //   /private/var/folders/xx/T/repo
  // Same directory, different string. That difference is not cosmetic here --
  // callers relativise an absolute tool_input.file_path against this root, and
  // relative of '/private/var/.../repo' against '/var/.../repo/src/x.ts'
  // yields a '../../...' path that matches NO governed pattern. Six guard
  // assertions flipped from BLOCK to ALLOW on exactly this. Only return git's
  // spelling when we genuinely walked UP from a subdirectory.
  try {
    if (realpathSync(dir) === realpathSync(top)) return dir;
  } catch {
    /* fall through to git's answer */
  }
  return top;
}

/**
 * Resolve the ACTIVE workspace root.
 *
 * Order:
 *   1. the hook payload's own `cwd`, resolved to its git top-level
 *   2. CLAUDE_PROJECT_DIR, resolved to its git top-level
 *   3. process.cwd(), resolved to its git top-level
 *   4. raw fallbacks, so a caller outside a repo still gets a string
 *
 * Only step 1 moved relative to the old code, and that is the whole fix: the
 * payload's cwd is the ACTIVE worktree and now outranks the env var.
 *
 * process.cwd() stays LAST, deliberately. Promoting it above
 * CLAUDE_PROJECT_DIR regressed six guard assertions from BLOCK to ALLOW: a
 * hook runs as a subprocess whose cwd is whatever the harness spawned it
 * with, so when a payload carries no `cwd` the process cwd can point at a
 * different checkout entirely. The guard then finds no session state and
 * silently permits the edit. Guards must never fail open.
 *
 * @param {{cwd?: string}} [input] parsed hook stdin JSON
 */
export function resolveActiveRoot(input) {
  const candidates = [input?.cwd, process.env.CLAUDE_PROJECT_DIR, process.cwd()];
  for (const c of candidates) {
    if (!c || !existsSync(c)) continue;
    // The first candidate that EXISTS wins. Git resolution is a REFINEMENT
    // that walks up from a subdirectory to its work-tree root -- it is not a
    // validity filter.
    //
    // Treating "not a git work tree" as "invalid, try the next candidate" was
    // a real regression: guard-concurrent-edit's fixture is a plain mkdtemp
    // directory, so every candidate failed the git check and resolution fell
    // through to process.cwd() -- the real helmv3 repo. The guard then looked
    // for peer session ledgers in the wrong tree, found none, and ALLOWED an
    // edit it was supposed to BLOCK. A directory the caller explicitly named
    // is authoritative even when git knows nothing about it.
    return topLevelOf(c) || c;
  }
  return input?.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd() || '.';
}

/**
 * The canonical (main) checkout for the repo containing `root`.
 *
 * `--git-common-dir` points at the SHARED .git directory — the main
 * checkout's — from any linked worktree. Its parent is the canonical root.
 * Returns `root` unchanged when that cannot be determined, so callers always
 * get a usable path.
 */
export function canonicalRootOf(root) {
  const common = git(['rev-parse', '--git-common-dir'], root);
  if (!common) return root;
  const abs = isAbsolute(common) ? common : resolve(root, common);
  // .../helmv3/.git -> .../helmv3 ; a bare repo has no parent worktree.
  const parent = dirname(abs);
  return existsSync(join(parent, '.git')) || existsSync(abs) ? parent : root;
}

/** Count commits in `range`, or null when the range cannot be resolved. */
function countRange(root, range) {
  const out = git(['rev-list', '--count', range], root);
  if (out === null) return null;
  const n = Number.parseInt(out, 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Full workspace identity. Every field is best-effort: this runs inside
 * hooks, so it must never throw and never block a session.
 *
 * `behind` is measured against ORIGIN/MAIN, not local main. Local main can
 * itself be stale — measuring against it reported "behind 0" for a branch
 * that was 50 commits behind the real integration trunk.
 *
 * @param {{cwd?: string}} [input] parsed hook stdin JSON
 */
export function workspaceIdentity(input) {
  const root = resolveActiveRoot(input);
  const canonicalRoot = canonicalRootOf(root);
  const inRepo = topLevelOf(root) !== null;

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], root);
  const headSha = git(['rev-parse', 'HEAD'], root);
  const upstream = git(
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
    root,
  );
  const baseSha = git(['rev-parse', 'origin/main'], root);
  const porcelain = git(['status', '--porcelain'], root);

  const kind = !inRepo ? 'unknown' : root === canonicalRoot ? 'canonical' : 'task';

  return {
    root,
    canonicalRoot,
    inRepo,
    kind,
    branch: branch === 'HEAD' ? null : branch, // detached
    detached: branch === 'HEAD',
    headSha,
    upstream: upstream || null,
    baseRef: 'origin/main',
    baseSha,
    // Measured against origin/main on purpose. See the note above.
    ahead: countRange(root, 'origin/main..HEAD'),
    behind: countRange(root, 'HEAD..origin/main'),
    dirty: porcelain === null ? null : porcelain.length > 0,
    dirtyCount: porcelain ? porcelain.split('\n').filter(Boolean).length : 0,
  };
}

/**
 * True when a task branch is configured to track the integration trunk.
 *
 * `git worktree add -b <branch> origin/main` sets upstream to origin/main, so
 * a bare `git push` from that branch targets MAIN. Observed on
 * docs/consolidation-2026-08-27.
 */
export function hasUnsafeUpstream(identity) {
  if (!identity?.upstream) return false;
  if (identity.branch === 'main') return false;
  return identity.upstream === 'origin/main';
}
