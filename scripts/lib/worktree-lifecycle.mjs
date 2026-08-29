/**
 * Worktree and branch lifecycle classification — pure functions.
 *
 * FOUR OBJECTS, FOUR LIFETIMES. The old model conflated them, and that is what
 * leaked gigabytes:
 *
 *   worktree   disposable checkout
 *   branch     durable ref
 *   PR         the authoritative lifecycle record (this repo squash-merges)
 *   capability what a live session can actually do
 *
 * "Remove worktree" used to imply "abandon branch", so a worktree could only be
 * removed once its PR merged. An open PR waiting on a human therefore held
 * ~3.8 GiB indefinitely. Parking separates them: the checkout goes, the branch
 * stays, and the worktree is recreated when work resumes.
 *
 * Everything here is a pure function of gathered facts so the decisions can be
 * tested without a git fixture per case. The CLI gathers; this decides.
 *
 * THE SQUASH-MERGE TRAP, and the one that nearly replaced it
 *
 * `git branch --merged` never lists a squash-merged branch, because the
 * branch's commits never become ancestors of main. Keying on ancestry keeps
 * every merged branch forever — that IS the leak, wearing a guard's clothes.
 *
 * The obvious replacement is worse. #1654 required `origin/<branch>` to exist
 * before retiring, and this repo has `delete_branch_on_merge: true`, so the
 * condition was guaranteed FALSE for exactly the branches that were safe. Its
 * first dry run printed "Nothing retirable" with 11.6 GiB in front of it.
 *
 * Measured 2026-08-29 on four merged PRs whose remote branches were auto-
 * deleted: GitHub still reports `.head.sha`, and it matched the local tip
 * exactly in all four. So the evidence for deleting a branch is
 *
 *     PR MERGED  +  local tip === PR head OID
 *
 * and NOT the remote tip, which is gone precisely when you need it.
 */

/** Worktree verdicts. */
export const ACTIVE = 'ACTIVE';
export const PARKABLE = 'PARKABLE';
export const RETIRABLE = 'RETIRABLE';
export const UNKNOWN = 'UNKNOWN';

/**
 * Branch verdicts. UNKNOWN_REMOTE is shared with the worktree classifier: it is
 * the verdict when REMOTE evidence is missing.
 *
 * It is deliberately UNREACHABLE from classifyBranch, and that is the design.
 * Branch deletion is proven by PR head OID, never by a remote tip, because
 * `delete_branch_on_merge` removes the remote exactly when the branch becomes
 * safe. Requiring it there is #1654's shipped defect. Parking is the opposite:
 * it needs the commits to survive removing the directory, so it requires the
 * remote and reports UNKNOWN_REMOTE when it cannot get it.
 */
export const DELETE_MERGED_EXACT = 'DELETE_MERGED_EXACT';
export const KEEP_OPEN = 'KEEP_OPEN';
export const KEEP_DIVERGED_AFTER_PR = 'KEEP_DIVERGED_AFTER_PR';
export const KEEP_WORKTREE_ACTIVE = 'KEEP_WORKTREE_ACTIVE';
export const KEEP_DIRTY = 'KEEP_DIRTY';
export const KEEP_PROTECTED = 'KEEP_PROTECTED';
export const UNKNOWN_PR = 'UNKNOWN_PR';
export const UNKNOWN_REMOTE = 'UNKNOWN_REMOTE';
export const UNKNOWN_IDENTITY = 'UNKNOWN_IDENTITY';
/**
 * A branch with NO upstream and commits that exist nowhere else. Distinct from
 * UNKNOWN_PR on purpose: "the lookup failed" and "this is the only copy of 19
 * commits" are different keeps, and only one of them is permanent. Measured
 * 2026-08-29: ten such branches, up to 19 unique commits each.
 */
export const NO_UPSTREAM_UNIQUE_WORK = 'NO_UPSTREAM_UNIQUE_WORK';

/**
 * Branch name prefixes that are never deleted automatically, whatever their PR
 * says. These exist because a human deliberately preserved something.
 */
export const PROTECTED_PREFIXES = ['main', 'master', 'backup/', 'preserve/', 'recovered/', 'stage/'];

export function isProtectedBranch(branch) {
  if (!branch) return false;
  return PROTECTED_PREFIXES.some((p) => (p.endsWith('/') ? branch.startsWith(p) : branch === p));
}

/**
 * Classify a WORKTREE.
 *
 * facts:
 *   path            string
 *   isCanonical     bool    the control tower
 *   branch          string|null   null when detached
 *   dirtyCount      number|null   null = could not determine
 *   hasLiveProcess  bool|null     null = could not determine
 *   upstream        string|null   configured upstream ref, if any
 *   localSha        string|null
 *   remoteSha       string|null
 *   isCurrentExecution bool       the tree this process is running from
 *
 * Note the asymmetry with branches: parking does NOT consult the PR at all. It
 * removes only the disposable checkout, so "is this work finished" is not the
 * question — "is this checkout reproducible from a pushed ref" is.
 */
export function classifyWorktree(facts) {
  const f = facts ?? {};

  if (f.isCanonical) return { verdict: ACTIVE, reason: 'canonical checkout (control tower)' };
  if (f.isCurrentExecution) return { verdict: ACTIVE, reason: 'this process is executing from here' };

  if (f.dirtyCount === null || f.dirtyCount === undefined) {
    return { verdict: UNKNOWN, reason: 'could not read working-tree status' };
  }
  if (f.dirtyCount > 0) {
    return { verdict: ACTIVE, reason: `${f.dirtyCount} uncommitted file(s) exist nowhere else` };
  }

  if (f.hasLiveProcess === null || f.hasLiveProcess === undefined) {
    return { verdict: UNKNOWN, reason: 'could not determine whether a process is using it' };
  }
  if (f.hasLiveProcess) return { verdict: ACTIVE, reason: 'a live process has its cwd here' };

  if (!f.branch) {
    // Detached: there is no ref to recreate the checkout from.
    return { verdict: UNKNOWN, reason: 'detached HEAD — no branch identity to park against' };
  }

  if (!f.localSha) return { verdict: UNKNOWN, reason: 'could not resolve the local tip' };

  // Parking requires the checkout be reproducible: the work must be pushed.
  // This is the ONE place a remote tip is required, and it is required in the
  // safe direction — no upstream means we cannot prove the commits survive
  // removing the directory.
  if (!f.upstream) {
    return { verdict: UNKNOWN_REMOTE, reason: 'no upstream — commits here may exist nowhere else' };
  }
  if (!f.remoteSha) {
    return { verdict: UNKNOWN_REMOTE, reason: `could not read ${f.upstream}` };
  }
  if (f.localSha !== f.remoteSha) {
    return { verdict: UNKNOWN_REMOTE, reason: `local tip differs from ${f.upstream} (unpushed commits)` };
  }

  return {
    verdict: PARKABLE,
    reason: `clean, idle, and identical to ${f.upstream} — recreate with scripts/new-worktree.sh`,
  };
}

/**
 * Classify a BRANCH for deletion.
 *
 * facts:
 *   branch        string
 *   localSha      string|null
 *   worktreePath  string|null      a worktree currently using this branch
 *   worktreeVerdict string|null    that worktree's verdict, when known
 *   worktreeDirty bool|null
 *   prLookup      'OK' | 'FAILED'
 *   prNumber      number|null
 *   prState       'MERGED'|'OPEN'|'CLOSED'|'NONE'|null
 *   prHeadSha     string|null
 *
 * DELETE_MERGED_EXACT deliberately does NOT require a remote tip. `delete_branch_on_
 * merge` removes it at merge time, so requiring it would refuse exactly the
 * branches that are safe — measured as #1654's shipped defect.
 */
export function classifyBranch(facts) {
  const f = facts ?? {};

  if (!f.branch) return { verdict: UNKNOWN_IDENTITY, reason: 'no branch name' };
  if (isProtectedBranch(f.branch)) {
    return { verdict: KEEP_PROTECTED, reason: 'protected prefix — a human preserved this deliberately' };
  }
  if (!f.localSha) return { verdict: UNKNOWN_IDENTITY, reason: 'could not resolve the branch tip' };

  // A branch in use is not a branch-GC question yet.
  if (f.worktreePath) {
    if (f.worktreeDirty) {
      return { verdict: KEEP_DIRTY, reason: `worktree ${f.worktreePath} has uncommitted work` };
    }
    return { verdict: KEEP_WORKTREE_ACTIVE, reason: `checked out at ${f.worktreePath}` };
  }

  // Evidence unavailable is UNKNOWN. It is never "no PR", and never a licence
  // to delete. A failed lookup once got read as "no PR found" — #1668.
  if (f.prLookup !== 'OK') {
    return { verdict: UNKNOWN_PR, reason: 'PR lookup failed — evidence unavailable, not absent' };
  }
  if (!f.prState || f.prState === 'NONE') {
    // Separate the permanent keep from the merely-unproven one.
    if (!f.upstream && (f.uniqueCommits ?? 0) > 0) {
      return {
        verdict: NO_UPSTREAM_UNIQUE_WORK,
        reason: `${f.uniqueCommits} commit(s) exist only here — no upstream, no PR`,
      };
    }
    return { verdict: UNKNOWN_PR, reason: 'no PR found — cannot prove the work landed' };
  }
  if (f.prState !== 'MERGED') {
    return { verdict: KEEP_OPEN, reason: `PR #${f.prNumber} is ${f.prState}, not MERGED` };
  }

  if (!f.prHeadSha) {
    return { verdict: UNKNOWN_PR, reason: `PR #${f.prNumber} is MERGED but its head SHA is unreadable` };
  }

  // The counterexample that matters: someone committed to the branch after the
  // PR merged. The PR proves the OLD tip landed; it says nothing about the new
  // commits, which exist nowhere else once the remote branch is gone.
  if (f.localSha !== f.prHeadSha) {
    return {
      verdict: KEEP_DIVERGED_AFTER_PR,
      reason: `PR #${f.prNumber} merged ${short(f.prHeadSha)} but the branch is now ${short(f.localSha)}`,
    };
  }

  return {
    verdict: DELETE_MERGED_EXACT,
    reason: `PR #${f.prNumber} MERGED and tip === PR head ${short(f.prHeadSha)}`,
  };
}

function short(sha) {
  return typeof sha === 'string' ? sha.slice(0, 9) : String(sha);
}

/**
 * Combine the two verdicts into what should actually happen to a worktree.
 *
 * RETIRABLE is DERIVED, not returned by classifyWorktree — a worktree is fully
 * retirable only when its checkout is disposable AND its branch is provably
 * dead. Keeping it as a separate classifier output would have made it
 * unreachable, which is its own species of false claim.
 *
 *   ACTIVE                                   -> KEEP    (do nothing)
 *   PARKABLE + branch DELETE_MERGED_EXACT            -> RETIRE  (remove tree AND branch)
 *   PARKABLE + anything else                 -> PARK    (remove tree, keep branch)
 *   UNKNOWN                                  -> KEEP    (evidence missing)
 *
 * The PARK row is the point of the whole redesign: an open PR waiting on a
 * human no longer costs ~3.8 GiB while it waits.
 */
export function combineVerdicts(worktreeVerdict, branchVerdict) {
  if (worktreeVerdict === PARKABLE && branchVerdict === DELETE_MERGED_EXACT) {
    return { action: 'RETIRE', worktree: RETIRABLE, reason: 'checkout disposable and branch provably merged' };
  }
  if (worktreeVerdict === PARKABLE) {
    return { action: 'PARK', worktree: PARKABLE, reason: 'checkout disposable; branch stays' };
  }
  // Everything else — ACTIVE, UNKNOWN, UNKNOWN_REMOTE — is KEEP. Missing
  // evidence is never a licence to remove a checkout.
  return { action: 'KEEP', worktree: worktreeVerdict, reason: 'not eligible' };
}

/**
 * STANDING OWNER AUTHORIZATION — recorded here, in the authority itself, so a
 * reader never has to remember a paragraph in another file.
 *
 * Granted 2026-08-29. An agent may delete a local branch WITHOUT asking when
 * ALL of these hold:
 *
 *     PR state          === MERGED
 *     local tip         === PR head OID (exact, not ancestry)
 *     protected         === false
 *     checked out       === false
 *     classifier verdict === DELETE_MERGED_EXACT
 *
 * and may PARK or RETIRE a workspace the classifier verdicts PARKABLE.
 *
 * EXPLICITLY EXCLUDED — every one of these requires a human:
 *
 *     UNKNOWN_PR                 evidence unavailable, or no PR found
 *     KEEP_OPEN                  PR open, or closed without merging
 *     KEEP_DIVERGED_AFTER_PR     commits made after the PR merged
 *     KEEP_PROTECTED             a human preserved it deliberately
 *     KEEP_WORKTREE_ACTIVE       a checkout still holds it
 *     KEEP_DIRTY                 uncommitted work
 *     NO_UPSTREAM_UNIQUE_WORK    the only copy of real commits
 *     UNKNOWN_REMOTE             cannot prove the work is pushed
 *     UNKNOWN_IDENTITY           cannot resolve the branch at all
 *
 * The grant is deliberately narrow: it covers exactly the case where GitHub has
 * already recorded that this exact tree landed on main.
 */
export const AUTONOMOUS_WORKTREE_VERDICTS = new Set([PARKABLE, RETIRABLE]);
export const AUTONOMOUS_BRANCH_VERDICTS = new Set([DELETE_MERGED_EXACT]);
export const REQUIRES_HUMAN_VERDICTS = new Set([
  UNKNOWN_PR, KEEP_OPEN, KEEP_DIVERGED_AFTER_PR, KEEP_PROTECTED,
  KEEP_WORKTREE_ACTIVE, KEEP_DIRTY, NO_UPSTREAM_UNIQUE_WORK,
  UNKNOWN_REMOTE, UNKNOWN_IDENTITY,
]);

export function mayActAutonomously(verdict) {
  return AUTONOMOUS_WORKTREE_VERDICTS.has(verdict) || AUTONOMOUS_BRANCH_VERDICTS.has(verdict);
}

// ---------------------------------------------------------------------------
// Workspace KIND and the mutation-worktree budget.
//
// The disk reserve (#1674) stops a catastrophe; it does not stop waste. Six
// worktrees created in one day is not a disk problem, it is a concurrency
// problem that only becomes visible as a disk problem. The budget makes the
// policy structural: refused BEFORE `git worktree add`, not reported after.
//
// Classification FAILS TOWARD MUTATION on purpose. A workspace whose kind
// cannot be established is counted against the budget, because the cost of
// wrongly counting a harmless checkout is one refusal the caller can override,
// and the cost of wrongly ignoring a real one is the leak this exists to close.

export const CANONICAL = 'CANONICAL';
export const MUTATION = 'MUTATION';
export const RELEASE_READONLY = 'RELEASE_READONLY';
export const UNKNOWN_KIND = 'UNKNOWN_KIND';

/**
 * facts:
 *   isCanonical  bool
 *   detached     bool
 *   declaredKind string|null   from .helm/workspace.json "kind"
 *   readable     bool|null     could the workspace be inspected at all
 */
export function classifyWorkspaceKind(facts) {
  const f = facts ?? {};
  if (f.isCanonical) return { kind: CANONICAL, counts: false, reason: 'canonical checkout' };

  if (f.readable === false) {
    // Cannot inspect it. It still occupies disk and may hold a branch.
    return { kind: UNKNOWN_KIND, counts: true, reason: 'workspace unreadable — counted, fails safe' };
  }

  // A release checkout only escapes the budget when it says so AND is detached.
  // Either half alone is not enough: a declared release that is on a branch can
  // still be committed to, and a bare detached HEAD is the ambiguous legacy
  // case the plan explicitly wants counted.
  if (f.declaredKind === 'release' && f.detached === true) {
    return { kind: RELEASE_READONLY, counts: false, reason: 'declared release workspace, detached' };
  }
  if (f.declaredKind === 'release') {
    return { kind: MUTATION, counts: true, reason: 'declared release but NOT detached — can still be committed to' };
  }

  if (!f.declaredKind) {
    return { kind: UNKNOWN_KIND, counts: true, reason: 'no declared kind (legacy workspace) — counted, fails safe' };
  }
  return { kind: MUTATION, counts: true, reason: `declared kind '${f.declaredKind}'` };
}

export const DEFAULT_MUTATION_BUDGET = 1;

/**
 * Decide whether one more mutation workspace may be created.
 * `existing` is an array of classifyWorkspaceKind results.
 */
export function mutationBudgetDecision(existing, budget = DEFAULT_MUTATION_BUDGET) {
  const counted = (existing ?? []).filter((e) => e && e.counts);
  const used = counted.length;
  if (used >= budget) {
    return {
      ok: false,
      used,
      budget,
      blocking: counted,
      reason: `${used} of ${budget} mutation workspace(s) already in use`,
    };
  }
  return { ok: true, used, budget, blocking: [], reason: `${used} of ${budget} in use` };
}
