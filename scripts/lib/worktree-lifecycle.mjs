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
 * A WORKTREE verdict, and deliberately neither ACTIVE nor UNKNOWN.
 *
 *   ACTIVE  would claim somebody is demonstrably using it. Not proven.
 *   UNKNOWN would claim the evidence was unreadable. Also untrue — the PR read
 *           fine; what is missing is a recorded decision by its owner.
 *
 * It means: this checkout is disposable in every mechanical sense, and its
 * branch has an OPEN PR whose owner has not said it may go.
 */
export const KEEP_PR_OWNER_INTENT_REQUIRED = 'KEEP_PR_OWNER_INTENT_REQUIRED';

/**
 * The `worktree_policy` vocabulary in config/open-pr-dispositions.json.
 *
 * A disposition LABEL (ACTIVE, HUMAN_TEST_PENDING, ...) says what the PR is.
 * It was being asked to also imply what may happen to the checkout, which is a
 * second meaning readers had to infer. The policy states the action directly.
 */
/**
 * A checkout whose OWN workspace identity has not released it.
 *
 * The #1681 fix requires positive owner intent before parking a checkout whose
 * branch has an OPEN PR. It never covered the window BEFORE a PR exists — and
 * that window is where a session actually starts. A worktree created five
 * minutes ago is clean, pushed, has no PR to key a disposition on, and is
 * invisible to `lsof` between two tool calls: every signal the old rule used
 * says "disposable", and every one of them is wrong.
 *
 * So disposability is now declared by the WORKSPACE, in the marker
 * scripts/new-worktree.sh already writes:
 *
 *     .helm/workspace.json  ->  { "parkPolicy": "KEEP" }
 *
 * KEEP at creation, always. It becomes PARK_IF_REPRODUCIBLE only when somebody
 * edits it, which is the positive act the old rule lacked. Absent file, absent
 * key, unknown value, unreadable JSON — every one of them KEEPS. Never infer
 * parkability from the shape of a missing answer.
 *
 * This is a DIFFERENT fact from PR state, and both still apply:
 *
 *     workspace identity  ->  may this CHECKOUT go?
 *     PR state            ->  may this BRANCH be deleted?
 */
export const KEEP_WORKSPACE_INTENT_REQUIRED = 'KEEP_WORKSPACE_INTENT_REQUIRED';

export const WORKTREE_POLICY_KEEP = 'KEEP';
export const WORKTREE_POLICY_PARK_IF_REPRODUCIBLE = 'PARK_IF_REPRODUCIBLE';
export const WORKTREE_POLICIES = new Set([WORKTREE_POLICY_KEEP, WORKTREE_POLICY_PARK_IF_REPRODUCIBLE]);

/**
 * Dispositions that KEEP the checkout whatever the policy field says.
 *
 * Defence in depth, and cheap: ACTIVE means somebody is working in it right
 * now, UNKNOWN means nobody has established what it is. Neither can be parked
 * by an agent, so a mis-typed policy beside one of these fails safe instead of
 * authorising the exact removal this rule exists to prevent.
 */
export const OPEN_PR_KEEP_DISPOSITIONS = new Set(['ACTIVE', 'UNKNOWN']);

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
 * Retention status for a PROTECTED_PREFIXES branch.
 *
 * A protected prefix asserts that "a human deliberately preserved something".
 * It does not record WHO, or UNTIL WHEN — so protection never ends and the set
 * can only grow. Measured 2026-08-31: every `backup/`, `preserve/`,
 * `recovered/` and `stage/` branch in this repo, the oldest untouched since
 * July, together holding commits reachable from no other ref. Each was created
 * by a session that knew why; none of them says why.
 *
 * This deliberately changes NO verdict. A protected branch with no retention
 * record stays KEEP_PROTECTED and stays undeletable — the standing
 * authorization still covers only DELETE_MERGED_EXACT. What this produces is a
 * decision list for a human, which is the thing that was missing.
 *
 * @param {string} branch
 * @param {{owner?: string, expires?: string, reason?: string}|null} record
 * @param {string|null} today  ISO YYYY-MM-DD; omit to skip expiry evaluation
 * @returns {{status: 'RECORDED'|'MISSING'|'EXPIRED', reason: string}|null}
 *          null when the branch is not protected at all
 */
export function classifyRetention(branch, record, today) {
  if (!isProtectedBranch(branch)) return null;

  // main/master are permanent by definition — they are listed as protected to
  // stop deletion, not because someone parked something on them.
  const isPermanent = PROTECTED_PREFIXES.some((p) => !p.endsWith('/') && branch === p);
  if (isPermanent) return { status: 'RECORDED', reason: 'permanent branch' };

  if (!record) {
    return { status: 'MISSING', reason: 'no retention record — needs an owner and an expiry' };
  }
  const owner = record.owner;
  const expires = record.expires;
  if (!owner) return { status: 'MISSING', reason: 'retention record has no owner' };
  if (expires === 'never') {
    return { status: 'RECORDED', reason: `retained permanently by ${owner}` };
  }
  if (typeof expires !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
    return {
      status: 'MISSING',
      reason: `retention for ${owner} has no valid expiry (YYYY-MM-DD, or "never")`,
    };
  }
  if (today && expires < today) {
    return { status: 'EXPIRED', reason: `retention by ${owner} expired ${expires} — needs review` };
  }
  return { status: 'RECORDED', reason: `retained by ${owner} until ${expires}` };
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
 * OWNERSHIP — rewritten 2026-08-30 against a reproduced failure.
 *
 * This comment used to state, as design, that "parking does NOT consult the PR
 * at all", the only question being whether the checkout is reproducible from a
 * pushed ref. That was the defect, written down as an intention.
 *
 * On 2026-08-30 `--retire` parked a CONCURRENT session's worktree
 * (agent/round-type-reclassify, PR #1681, OPEN) because it was clean, pushed
 * and idle. Nothing was lost — parking keeps the branch, and PARKABLE already
 * required the tip to match its pushed remote — but the checkout belonged to
 * somebody still using it, and the tool could not tell.
 *
 * The false step is the process probe. `lsof +D` samples ONE INSTANT:
 *
 *     hasLiveProcess === true     proof of activity        — a sound veto
 *     hasLiveProcess === false    NOT proof of inactivity  — an agent session
 *                                 sitting between two tool calls has no
 *                                 process whose cwd is visible
 *
 * Negative detection therefore never authorises removal by itself. For a
 * branch with an OPEN PR, dispensability must be proven POSITIVELY from
 * recorded owner intent (config/open-pr-dispositions.json). Reproducibility is
 * still necessary. It is no longer sufficient.
 *
 * PR facts (all optional; absent means "not supplied", handled explicitly):
 *   prLookup        'OK' | 'FAILED'
 *   prNumber        number|null
 *   prState         'MERGED'|'OPEN'|'CLOSED'|'NONE'|null
 *   disposition     string|null   from config/open-pr-dispositions.json
 *   worktreePolicy  string|null   KEEP | PARK_IF_REPRODUCIBLE
 *
 * Workspace identity (.helm/workspace.json in the checkout itself):
 *   parkPolicy      string|null   KEEP | PARK_IF_REPRODUCIBLE; anything else,
 *                                 including null, means KEEP
 *   workspaceMarker 'present'|'absent'|'unreadable'|null   for the reason line
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

  // WORKSPACE GATE. First of the two ownership gates, and unconditional: a
  // checkout that has not released itself is never parkable, whatever its PR
  // says. This is the half that covers work BEFORE a PR exists — the residue
  // the #1681 fix left behind, registered then as WORKTREE_PARK_NO_PR_OWNERSHIP.
  if (f.parkPolicy !== WORKTREE_POLICY_PARK_IF_REPRODUCIBLE) {
    const how =
      f.workspaceMarker === 'absent'
        ? 'no .helm/workspace.json — a checkout that predates the marker, or was not made by scripts/new-worktree.sh'
        : f.workspaceMarker === 'unreadable'
          ? '.helm/workspace.json could not be read'
          : `.helm/workspace.json parkPolicy is ${f.parkPolicy ?? 'unset'}`;
    return {
      verdict: KEEP_WORKSPACE_INTENT_REQUIRED,
      reason: `${how} — only parkPolicy: ${WORKTREE_POLICY_PARK_IF_REPRODUCIBLE} releases a checkout`,
    };
  }

  // OWNERSHIP GATE. Runs before the reproducibility checks on purpose: when an
  // owner has said KEEP, no amount of pushed-ness makes the checkout free, and
  // "PR #1681 is OPEN and its disposition is ACTIVE" is the reason a reader can
  // act on. Scoped to OPEN PRs, per the rule this implements.
  if (f.prLookup && f.prLookup !== 'OK') {
    // Evidence unavailable is never absence — the same conflation as #1668,
    // here on the worktree side.
    return { verdict: UNKNOWN, reason: 'PR lookup failed — ownership could not be established' };
  }
  if (f.prState === 'OPEN') {
    const n = f.prNumber ? `#${f.prNumber}` : 'the PR';
    if (!f.disposition) {
      return {
        verdict: KEEP_PR_OWNER_INTENT_REQUIRED,
        reason: `PR ${n} is OPEN with no recorded disposition — record one in config/open-pr-dispositions.json`,
      };
    }
    if (OPEN_PR_KEEP_DISPOSITIONS.has(f.disposition)) {
      return {
        verdict: KEEP_PR_OWNER_INTENT_REQUIRED,
        reason: `PR ${n} is OPEN and its disposition is ${f.disposition}`,
      };
    }
    if (f.worktreePolicy !== WORKTREE_POLICY_PARK_IF_REPRODUCIBLE) {
      return {
        verdict: KEEP_PR_OWNER_INTENT_REQUIRED,
        reason: `PR ${n} is OPEN and its worktree_policy is ${f.worktreePolicy ?? 'unset'} — only ${WORKTREE_POLICY_PARK_IF_REPRODUCIBLE} authorises parking`,
      };
    }
    // Falls through: the owner recorded, explicitly, that this checkout may go
    // once it is reproducible. #1659 is the case this preserves.
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

  const authorised =
    f.prState === 'OPEN'
      ? ` — PR #${f.prNumber} disposition ${f.disposition}/${f.worktreePolicy} authorises it`
      : '';
  return {
    verdict: PARKABLE,
    reason: `clean, idle, and identical to ${f.upstream}${authorised} — recreate with scripts/new-worktree.sh`,
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
 *   ACTIVE                                     -> KEEP    (do nothing)
 *   KEEP_PR_OWNER_INTENT_REQUIRED              -> KEEP    (owner has not released it)
 *   PARKABLE + branch DELETE_MERGED_EXACT      -> RETIRE  (remove tree AND branch)
 *   PARKABLE + anything else                   -> PARK    (remove tree, keep branch)
 *   UNKNOWN                                    -> KEEP    (evidence missing)
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
  // Everything else — ACTIVE, KEEP_PR_OWNER_INTENT_REQUIRED, UNKNOWN,
  // UNKNOWN_REMOTE — is KEEP. Neither missing evidence nor missing permission
  // is a licence to remove a checkout.
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
 * NARROWED 2026-08-30. PARKABLE no longer follows from "clean + pushed + no
 * process seen". A worktree whose branch has an OPEN PR is PARKABLE only when
 * that PR carries a disposition whose worktree_policy is PARK_IF_REPRODUCIBLE.
 * The grant is unchanged in wording and smaller in reach, because the verdict
 * it points at got harder to earn.
 *
 * EXPLICITLY EXCLUDED — every one of these requires a human:
 *
 *     KEEP_PR_OWNER_INTENT_REQUIRED  open PR whose owner has not released the checkout
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
  KEEP_WORKSPACE_INTENT_REQUIRED,
  UNKNOWN_PR, KEEP_OPEN, KEEP_DIVERGED_AFTER_PR, KEEP_PROTECTED,
  KEEP_WORKTREE_ACTIVE, KEEP_DIRTY, NO_UPSTREAM_UNIQUE_WORK,
  UNKNOWN_REMOTE, UNKNOWN_IDENTITY, KEEP_PR_OWNER_INTENT_REQUIRED,
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

// Raised 1 -> 3 with the "one workspace door" change (2026-09-05). The
// mutation budget now has to cover every path that allocates a workspace, not
// just a human running scripts/new-worktree.sh: the WorktreeCreate hook routes
// `isolation: "worktree"` subagents and background sessions through the same
// door (scripts/lib/create-workspace.mjs), and a session doing legitimate
// parallel work — say, one task worktree plus two isolated subagent checks —
// would otherwise be refused by a budget sized for a single human session.
// 3 is still a budget, not a suggestion: it is refused BEFORE allocation the
// same way 1 was, and AGENTS.md / autonomy.md's "one mutation workspace at a
// time" prose is now stale by exactly this amount — see
// docs/operations/WORKSPACES.md for the corrected line pending that edit.
export const DEFAULT_MUTATION_BUDGET = 3;

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
