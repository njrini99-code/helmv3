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
import { join, resolve } from 'node:path';
import { canonicalRootOf } from '../../../.claude/hooks/lib/workspace-identity.mjs';
import { git } from '../lib/exec.mjs';
import { check, Status } from '../result.mjs';
import { inspectWorkspaces } from '../../check-mutation-budget.mjs';
import { mutationBudgetDecision, DEFAULT_MUTATION_BUDGET } from '../../lib/worktree-lifecycle.mjs';

export const meta = { id: 'worktree', title: 'Worktree hygiene' };

const NEXT_WARN_BYTES = 4 * 1024 * 1024 * 1024; // 4 GiB

// Made cleanup cheap enough it always happens (2026-09-06, after PR #1863
// needed three manual steps to land). Two of the three checks below are hard
// FAILs, not WARNs, on purpose: a merged-and-forgotten checkout or an
// over-budget branch/worktree count is not a nudge, it is the exact leak
// AGENTS.md's mutation budget and worktree-lifecycle.mjs exist to close, and
// a WARN here is exactly the kind of "reported but never acted on" residue
// this whole reset targets.
const STALE_MERGED_PR_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_LOCAL_BRANCHES = 25;

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

/**
 * Every PR (any state) ever opened against `branch`, or null when `gh`
 * itself could not be asked. An empty array is a real answer ("no PR"), not
 * "unavailable" — the same distinction worktree-lifecycle.mjs's prFor()
 * draws between FAILED and NONE.
 */
function ghPrHistoryForBranch(branch, cwd) {
  const r = spawnSync(
    'gh',
    ['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number,state,mergedAt'],
    { encoding: 'utf-8', cwd, timeout: 10000 },
  );
  if (r.status !== 0 || r.error) return null;
  try {
    const parsed = JSON.parse((r.stdout ?? '').trim() || '[]');
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function worktreeBranches(canonicalRoot) {
  const r = git(canonicalRoot, ['worktree', 'list', '--porcelain']);
  if (!r.ok) return null;
  const out = [];
  let cur = null;
  for (const line of r.value.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (cur) out.push(cur);
      cur = { path: line.slice('worktree '.length), branch: null };
    } else if (line.startsWith('branch refs/heads/') && cur) {
      cur.branch = line.slice('branch refs/heads/'.length);
    }
  }
  if (cur) out.push(cur);
  return out;
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

  // --- stale merged PRs: a worktree whose branch's PR MERGED >24h ago and
  // was never cleaned up. `npm run pr:land` / worktrees:retire exist
  // precisely so this never accumulates; a hit here means the manual path
  // was used and cleanup skipped, not that the tooling failed.
  {
    const branches = worktreeBranches(canonicalRoot);
    if (branches === null) {
      out.push(check('worktree.stale-merged-pr', Status.UNKNOWN, 'could not list worktrees (git worktree list failed)'));
    } else {
      const now = ctx.now ? new Date(ctx.now).getTime() : Date.now();
      const stale = [];
      let ghFailed = false;
      for (const w of branches) {
        if (!w.branch || resolve(w.path) === resolve(canonicalRoot)) continue;
        const history = ghPrHistoryForBranch(w.branch, canonicalRoot);
        if (history === null) {
          ghFailed = true;
          continue;
        }
        const merged = history.find((p) => String(p.state).toUpperCase() === 'MERGED' && p.mergedAt);
        if (!merged) continue;
        const mergedAtMs = Date.parse(merged.mergedAt);
        if (!Number.isFinite(mergedAtMs)) continue;
        const ageMs = now - mergedAtMs;
        if (ageMs > STALE_MERGED_PR_MS) {
          stale.push({ path: w.path, branch: w.branch, prNumber: merged.number, mergedAt: merged.mergedAt, ageHours: Math.round(ageMs / 3_600_000) });
        }
      }
      if (stale.length > 0) {
        out.push(check('worktree.stale-merged-pr', Status.FAIL,
          `${stale.length} worktree(s) sit on a branch whose PR merged over 24h ago and was never retired`, {
            evidence: stale,
            fix: 'npm run pr:land -- <n>  (or: node scripts/worktree-lifecycle.mjs --retire)',
          }));
      } else if (ghFailed) {
        out.push(check('worktree.stale-merged-pr', Status.LOCAL_ONLY, 'could not confirm every branch\'s PR state (gh unavailable) — not a control failure'));
      } else {
        out.push(check('worktree.stale-merged-pr', Status.PASS, 'no worktree sits on a >24h-stale merged PR'));
      }
    }
  }

  // --- local branch count ---
  {
    const r = git(canonicalRoot, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']);
    if (!r.ok) {
      out.push(check('worktree.branch-count', Status.UNKNOWN, 'could not list local branches', { detail: r.error }));
    } else {
      const branches = r.value.split('\n').filter(Boolean);
      out.push(
        branches.length > MAX_LOCAL_BRANCHES
          ? check('worktree.branch-count', Status.FAIL, `${branches.length} local branches exceed the ${MAX_LOCAL_BRANCHES}-branch ceiling`, {
              count: branches.length,
              ceiling: MAX_LOCAL_BRANCHES,
              fix: 'npm run worktrees:retire  (or npm run pr:land -- <n> per merged PR)',
            })
          : check('worktree.branch-count', Status.PASS, `${branches.length} local branches (ceiling ${MAX_LOCAL_BRANCHES})`),
      );
    }
  }

  // --- worktree count vs the mutation budget ---
  {
    const budget = Number(process.env.HELM_MAX_MUTATION_WORKTREES ?? DEFAULT_MUTATION_BUDGET);
    const spaces = inspectWorkspaces(canonicalRoot, canonicalRoot);
    const decision = mutationBudgetDecision(spaces, budget);
    const ceiling = budget + 1;
    out.push(
      decision.used > ceiling
        ? check('worktree.budget-exceeded', Status.FAIL,
            `${decision.used} mutation worktree(s) in use, exceeding budget(${budget})+1=${ceiling}`, {
              used: decision.used,
              budget,
              ceiling,
              evidence: decision.blocking,
              fix: 'npm run worktrees:park  (or npm run pr:land -- <n> per merged PR)',
            })
        : check('worktree.budget-exceeded', Status.PASS, `${decision.used} mutation worktree(s) in use (budget ${budget}, ceiling ${ceiling})`),
    );
  }

  return out;
}
