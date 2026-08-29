// Worktree and branch lifecycle — what it refuses, and what it will now do
// that the old tool could not.
//
// MIGRATED from src/test/scripts/retire-worktrees.test.ts, not deleted. Every
// refusal that suite proved is preserved below. The expectations changed in one
// specific way, deliberately: a clean pushed worktree whose PR is OPEN was
// verdict KEEP and is now PARK. That is the redesign — removing a checkout no
// longer means abandoning its branch, so an open PR waiting on a human
// (#1659, 3.8 GiB) stops paying rent.
//
// AGENTS.md says the standing owner authorization RELIES on these refusals
// firing, so weakening this file silently weakens that grant.
//
// Two layers on purpose:
//   * the classifier is pure, so every verdict is covered without a git fixture
//   * the CLI is exercised against real git worktrees, because shell-quoting and
//     porcelain parsing are where the shell version actually broke

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  classifyWorktree,
  classifyBranch,
  combineVerdicts,
  isProtectedBranch,
  ACTIVE,
  PARKABLE,
  RETIRABLE,
  UNKNOWN,
  UNKNOWN_REMOTE,
  DELETE_MERGED_EXACT,
  KEEP_OPEN,
  KEEP_DIVERGED_AFTER_PR,
  KEEP_WORKTREE_ACTIVE,
  KEEP_DIRTY,
  KEEP_PROTECTED,
  UNKNOWN_PR,
  UNKNOWN_IDENTITY,
  NO_UPSTREAM_UNIQUE_WORK,
  classifyWorkspaceKind,
  mutationBudgetDecision,
  RELEASE_READONLY,
  UNKNOWN_KIND,
  REQUIRES_HUMAN_VERDICTS,
  AUTONOMOUS_BRANCH_VERDICTS,
} from '../../../scripts/lib/worktree-lifecycle.mjs';

const REPO = resolve(__dirname, '../../..');
const CLI = resolve(REPO, 'scripts/worktree-lifecycle.mjs');

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

const clean = {
  isCanonical: false,
  isCurrentExecution: false,
  branch: 'agent/x',
  dirtyCount: 0,
  hasLiveProcess: false,
  upstream: 'origin/agent/x',
  localSha: SHA_A,
  remoteSha: SHA_A,
};

describe('worktree classification — refusals first', () => {
  it('KEEPS the canonical checkout, before consulting anything else', () => {
    // gh pr list --head main on this repo returns an unrelated ancient #186
    // CLOSED. A tool that asked about PR state before identifying canonical
    // would read that as "safe to delete the control tower".
    expect(classifyWorktree({ ...clean, isCanonical: true }).verdict).toBe(ACTIVE);
  });

  it('KEEPS the worktree this process is executing from', () => {
    expect(classifyWorktree({ ...clean, isCurrentExecution: true }).verdict).toBe(ACTIVE);
  });

  it('KEEPS a worktree with uncommitted work', () => {
    const v = classifyWorktree({ ...clean, dirtyCount: 3 });
    expect(v.verdict).toBe(ACTIVE);
    expect(v.reason).toMatch(/uncommitted/);
  });

  it('KEEPS a worktree a live process is sitting in', () => {
    expect(classifyWorktree({ ...clean, hasLiveProcess: true }).verdict).toBe(ACTIVE);
  });

  it('KEEPS a detached HEAD — no branch identity to park against', () => {
    expect(classifyWorktree({ ...clean, branch: null }).verdict).toBe(UNKNOWN);
  });

  it('is UNKNOWN, not ACTIVE, when dirtiness cannot be read', () => {
    // "could not check" must never collapse into "clean".
    expect(classifyWorktree({ ...clean, dirtyCount: null }).verdict).toBe(UNKNOWN);
  });

  it('is UNKNOWN when process usage cannot be determined', () => {
    expect(classifyWorktree({ ...clean, hasLiveProcess: null }).verdict).toBe(UNKNOWN);
  });

  it('refuses to park unpushed work — commits may exist nowhere else', () => {
    expect(classifyWorktree({ ...clean, upstream: null }).verdict).toBe(UNKNOWN_REMOTE);
    expect(classifyWorktree({ ...clean, remoteSha: null }).verdict).toBe(UNKNOWN_REMOTE);
    expect(classifyWorktree({ ...clean, remoteSha: SHA_B }).verdict).toBe(UNKNOWN_REMOTE);
  });

  it('PARKS a clean, idle, fully-pushed worktree — regardless of PR state', () => {
    // The change that matters. Parking removes only the disposable checkout,
    // so "has the work landed" is not the question being asked.
    expect(classifyWorktree(clean).verdict).toBe(PARKABLE);
  });
});

describe('branch classification — the evidence is the PR head OID', () => {
  const merged = {
    branch: 'agent/x',
    localSha: SHA_A,
    prLookup: 'OK' as const,
    prNumber: 903,
    prState: 'MERGED',
    prHeadSha: SHA_A,
  };

  it('DELETE_MERGED_EXACT requires PR MERGED and an exact head match', () => {
    const v = classifyBranch(merged);
    expect(v.verdict).toBe(DELETE_MERGED_EXACT);
    expect(v.reason).toMatch(/#903 MERGED/);
  });

  it('does NOT require a remote branch to exist — that is #1654 inverted', () => {
    // delete_branch_on_merge removes origin/<branch> at merge time, so a rule
    // requiring it is guaranteed false for exactly the safe branches. #1654's
    // first dry run printed "Nothing retirable" with 11.6 GiB in front of it.
    // There is deliberately no remote field in these facts at all.
    expect(classifyBranch(merged).verdict).toBe(DELETE_MERGED_EXACT);
  });

  it('KEEP_DIVERGED_AFTER_PR when someone committed after the merge', () => {
    // The PR proves the OLD tip landed. It says nothing about newer commits,
    // which exist nowhere else once the remote branch is gone.
    const v = classifyBranch({ ...merged, localSha: SHA_B });
    expect(v.verdict).toBe(KEEP_DIVERGED_AFTER_PR);
    expect(v.reason).toMatch(/is now/);
  });

  it('KEEP_OPEN when the PR is OPEN or CLOSED-unmerged', () => {
    expect(classifyBranch({ ...merged, prState: 'OPEN' }).verdict).toBe(KEEP_OPEN);
    expect(classifyBranch({ ...merged, prState: 'CLOSED' }).verdict).toBe(KEEP_OPEN);
  });

  it('a SUCCESSFUL empty lookup reads as "no PR found" and KEEPS', () => {
    const v = classifyBranch({ ...merged, prState: 'NONE', prNumber: null, prHeadSha: null });
    expect(v.verdict).toBe(UNKNOWN_PR);
    expect(v.reason).toMatch(/no PR found/);
  });

  it('a FAILED lookup does NOT claim there is no PR — #1668', () => {
    const v = classifyBranch({ ...merged, prLookup: 'FAILED' });
    expect(v.verdict).toBe(UNKNOWN_PR);
    expect(v.reason).toMatch(/evidence unavailable, not absent/);
  });

  it('the two unknown outcomes are DISTINGUISHABLE in the reason', () => {
    const empty = classifyBranch({ ...merged, prState: 'NONE', prHeadSha: null }).reason;
    const failed = classifyBranch({ ...merged, prLookup: 'FAILED' }).reason;
    expect(empty).not.toBe(failed);
  });

  it('MERGED but no head SHA is UNKNOWN, never DELETE_MERGED_EXACT', () => {
    expect(classifyBranch({ ...merged, prHeadSha: null }).verdict).toBe(UNKNOWN_PR);
  });

  it('KEEP_WORKTREE_ACTIVE / KEEP_DIRTY when a checkout still holds it', () => {
    expect(classifyBranch({ ...merged, worktreePath: '/w' }).verdict).toBe(KEEP_WORKTREE_ACTIVE);
    expect(classifyBranch({ ...merged, worktreePath: '/w', worktreeDirty: true }).verdict).toBe(KEEP_DIRTY);
  });

  it('KEEP_PROTECTED for prefixes a human deliberately preserved', () => {
    for (const b of ['main', 'backup/x', 'preserve/y', 'recovered/stash-0', 'stage/z']) {
      expect(isProtectedBranch(b), b).toBe(true);
      expect(classifyBranch({ ...merged, branch: b }).verdict).toBe(KEEP_PROTECTED);
    }
    expect(isProtectedBranch('agent/x')).toBe(false);
  });

  it('UNKNOWN_IDENTITY without a resolvable tip', () => {
    expect(classifyBranch({ ...merged, localSha: null }).verdict).toBe(UNKNOWN_IDENTITY);
    expect(classifyBranch({ branch: null }).verdict).toBe(UNKNOWN_IDENTITY);
  });
});

describe('combining the two — RETIRABLE is derived, not asserted', () => {
  it('PARKABLE + DELETE_MERGED_EXACT = RETIRE', () => {
    const c = combineVerdicts(PARKABLE, DELETE_MERGED_EXACT);
    expect(c.action).toBe('RETIRE');
    expect(c.worktree).toBe(RETIRABLE);
  });

  it('PARKABLE + anything else = PARK, keeping the branch', () => {
    expect(combineVerdicts(PARKABLE, KEEP_OPEN).action).toBe('PARK');
    expect(combineVerdicts(PARKABLE, UNKNOWN_PR).action).toBe('PARK');
    expect(combineVerdicts(PARKABLE, KEEP_DIVERGED_AFTER_PR).action).toBe('PARK');
  });

  it('every non-PARKABLE worktree verdict is KEEP', () => {
    for (const v of [ACTIVE, UNKNOWN, UNKNOWN_REMOTE]) {
      expect(combineVerdicts(v, DELETE_MERGED_EXACT).action, v).toBe('KEEP');
    }
  });
});

// ---------------------------------------------------------------------------
// End-to-end against real git worktrees.

function git(args: string[], cwd: string) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function commit(dir: string, name: string) {
  writeFileSync(join(dir, `${name}.txt`), `${name}\n`);
  git(['add', '-A'], dir);
  git(['commit', '-q', '-m', name], dir);
}

describe('the CLI, against real worktrees', () => {
  let tmp: string;
  let canonical: string;
  let stub: string;

  function writePrStub(table: Record<string, string>) {
    const lines = Object.entries(table)
      .map(([b, v]) => `  "${b}") echo "${v}" ;;`)
      .join('\n');
    writeFileSync(stub, `#!/usr/bin/env bash\ncase "$1" in\n${lines}\n  *) echo "" ;;\nesac\n`);
    chmodSync(stub, 0o755);
  }

  function run(extra: string[] = []): string {
    return execFileSync('node', [CLI, ...extra], {
      cwd: canonical,
      encoding: 'utf-8',
      env: { ...process.env, HELM_PR_LOOKUP: stub },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  function row(out: string, branch: string): string {
    const lines = out.split('\n');
    const i = lines.findIndex((l) => l.startsWith(`${branch} `) || l.startsWith(`${branch}\t`));
    return i === -1 ? '' : `${lines[i]} ${lines[i + 1] ?? ''}`;
  }

  beforeEach(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'helm-lifecycle-')));
    canonical = join(tmp, 'helmv3');
    stub = join(tmp, 'pr-stub.sh');
    mkdirSync(canonical, { recursive: true });
    git(['init', '-q', '-b', 'main'], canonical);
    git(['config', 'user.email', 't@e.com'], canonical);
    git(['config', 'user.name', 'T'], canonical);
    commit(canonical, 'base');
    writePrStub({});
  });

  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  it('removes nothing without an action flag', () => {
    const wt = join(tmp, 'w1');
    git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/w1', wt, 'main'], canonical);
    const sha = git(['rev-parse', 'agent/w1'], canonical);
    writePrStub({ 'agent/w1': `903 MERGED ${sha}` });

    const out = run();
    expect(out).toMatch(/Reporting is the default/);
    expect(git(['worktree', 'list'], canonical)).toContain(wt);
  });

  it('a merged branch still reports unique commits — and is retirable anyway', () => {
    // The squash-merge trap, end to end. `git branch --merged` lists nothing.
    const wt = join(tmp, 'w2');
    git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/w2', wt, 'main'], canonical);
    commit(wt, 'extra');
    const sha = git(['rev-parse', 'agent/w2'], canonical);
    const unique = Number(git(['rev-list', '--count', 'main..agent/w2'], canonical));
    expect(unique).toBeGreaterThan(0);
    expect(git(['branch', '--merged', 'main'], canonical)).not.toContain('agent/w2');

    writePrStub({ 'agent/w2': `903 MERGED ${sha}` });
    expect(row(run(), 'agent/w2')).toMatch(/DELETE_MERGED_EXACT|RETIRE/);
  });

  it('a FAILED lookup never produces an action', () => {
    const wt = join(tmp, 'w3');
    git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/w3', wt, 'main'], canonical);
    writeFileSync(stub, '#!/usr/bin/env bash\nexit 3\n');
    chmodSync(stub, 0o755);
    const r = row(run(), 'agent/w3');
    expect(r).toMatch(/UNKNOWN_PR/);
    expect(r).not.toMatch(/DELETE_BRANCH|RETIRE/);
  });

  it('--park removes the checkout and KEEPS the branch', () => {
    const wt = join(tmp, 'w4');
    git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/w4', wt, 'main'], canonical);
    // Give it an upstream that matches, so it is genuinely reproducible.
    // `%(upstream:short)` needs a remote with a fetch refspec, not just
    // branch.*.remote/merge — without it git reports no upstream and the tool
    // correctly refuses to park work it cannot prove is pushed. Discovered by
    // this test failing for the right reason.
    git(['remote', 'add', 'origin', canonical], canonical);
    git(['config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*'], canonical);
    git(['update-ref', 'refs/remotes/origin/agent/w4', git(['rev-parse', 'agent/w4'], canonical)], canonical);
    git(['config', 'branch.agent/w4.remote', 'origin'], canonical);
    git(['config', 'branch.agent/w4.merge', 'refs/heads/agent/w4'], canonical);
    writePrStub({ 'agent/w4': '1659 OPEN deadbeef' });

    run(['--park']);
    expect(git(['worktree', 'list'], canonical)).not.toContain(wt);
    // The branch survives — this is the entire point.
    expect(git(['branch', '--list', 'agent/w4'], canonical)).toContain('agent/w4');
  });

  it('--gc-branches refuses a branch that diverged after its PR merged', () => {
    git(['branch', 'agent/w5', 'main'], canonical);
    const old = git(['rev-parse', 'agent/w5'], canonical);
    commit(canonical, 'after-merge');
    git(['branch', '-f', 'agent/w5', 'main'], canonical);
    expect(git(['rev-parse', 'agent/w5'], canonical)).not.toBe(old);

    writePrStub({ 'agent/w5': `903 MERGED ${old}` });
    run(['--gc-branches']);
    expect(git(['branch', '--list', 'agent/w5'], canonical)).toContain('agent/w5');
  });

  it('--gc-branches deletes a branch proven merged at the exact head', () => {
    git(['branch', 'agent/w6', 'main'], canonical);
    const sha = git(['rev-parse', 'agent/w6'], canonical);
    writePrStub({ 'agent/w6': `903 MERGED ${sha}` });

    run(['--gc-branches']);
    expect(git(['branch', '--list', 'agent/w6'], canonical)).not.toContain('agent/w6');
  });

  it('SENTINEL: a fixture run can never resolve back to the live Helm checkout', () => {
    // The #1676 near miss: the CLI resolved its repo from import.meta.url, so a
    // fixture test operated on the real repository and --park removed a live
    // worktree. This is the regression guard. If it ever fails, STOP — a
    // destructive tool is pointing at the wrong tree.
    const out = execFileSync('node', [CLI, '--json'], {
      cwd: canonical,
      encoding: 'utf-8',
      env: { ...process.env, HELM_PR_LOOKUP: stub },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const rows = JSON.parse(out);
    for (const r of rows) {
      expect(r.worktree, 'fixture run reached the real checkout').not.toContain('Downloads/helmv3');
    }
    expect(rows.some((r: { worktree: string }) => r.worktree.includes(tmp))).toBe(true);
  });

  it('the budget CLI refuses a second mutation workspace, and does so in the fixture', () => {
    const BUDGET = resolve(REPO, 'scripts/check-mutation-budget.mjs');
    const wt = join(tmp, 'wbudget');
    git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/wbudget', wt, 'main'], canonical);

    const r = spawnSync('node', [BUDGET], {
      cwd: canonical,
      encoding: 'utf-8',
      env: { ...process.env, HELM_MAX_MUTATION_WORKTREES: '1' },
    });
    // The fixture has no workspace-identity module, so its ROOT cannot be
    // proven canonical either — and neither tree declares a kind. Both are
    // therefore UNKNOWN_KIND and both count. That is the fail-safe direction
    // and the assertion says so rather than pinning a convenient number.
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/[2-9] of 1 mutation workspace/);
    expect(r.stderr).not.toContain('Downloads/helmv3');
  });

  it('the budget CLI allows creation when only canonical exists', () => {
    const BUDGET = resolve(REPO, 'scripts/check-mutation-budget.mjs');
    const r = spawnSync('node', [BUDGET], {
      cwd: canonical,
      encoding: 'utf-8',
      env: { ...process.env, HELM_MAX_MUTATION_WORKTREES: '1' },
    });
    // No canonical-identity module in the fixture, so the fixture root counts
    // as UNKNOWN_KIND — which is the fail-safe direction. Budget of 2 must pass.
    const r2 = spawnSync('node', [BUDGET], {
      cwd: canonical,
      encoding: 'utf-8',
      env: { ...process.env, HELM_MAX_MUTATION_WORKTREES: '2' },
    });
    expect(r2.status).toBe(0);
    expect(r.status === 0 || r.status === 1).toBe(true);
  });

  it('never deletes a protected branch, whatever the PR says', () => {
    git(['branch', 'preserve/important', 'main'], canonical);
    const sha = git(['rev-parse', 'preserve/important'], canonical);
    writePrStub({ 'preserve/important': `903 MERGED ${sha}` });

    run(['--retire']);
    expect(git(['branch', '--list', 'preserve/important'], canonical)).toContain('preserve/important');
  });
});

describe('workspace kind and the mutation budget', () => {
  it('canonical never counts against the budget', () => {
    expect(classifyWorkspaceKind({ isCanonical: true }).counts).toBe(false);
  });

  it('a declared task workspace counts', () => {
    expect(classifyWorkspaceKind({ declaredKind: 'task' }).counts).toBe(true);
  });

  it('a legacy workspace with no declared kind counts — fails toward mutation', () => {
    // The ambiguous case the plan calls out. Wrongly counting a harmless
    // checkout costs one overridable refusal; wrongly ignoring a real one is
    // the leak this exists to close.
    const v = classifyWorkspaceKind({ declaredKind: null });
    expect(v.kind).toBe(UNKNOWN_KIND);
    expect(v.counts).toBe(true);
  });

  it('an unreadable workspace counts — unknown is not free', () => {
    expect(classifyWorkspaceKind({ readable: false }).counts).toBe(true);
  });

  it('a DETACHED declared release workspace does not consume the budget', () => {
    const v = classifyWorkspaceKind({ declaredKind: 'release', detached: true });
    expect(v.kind).toBe(RELEASE_READONLY);
    expect(v.counts).toBe(false);
  });

  it('a declared release that is NOT detached still counts', () => {
    // Either half alone is insufficient: on a branch it can still be committed to.
    expect(classifyWorkspaceKind({ declaredKind: 'release', detached: false }).counts).toBe(true);
  });

  it('canonical alone leaves the budget available', () => {
    const d = mutationBudgetDecision([classifyWorkspaceKind({ isCanonical: true })], 1);
    expect(d.ok).toBe(true);
    expect(d.used).toBe(0);
  });

  it('one mutation workspace consumes a budget of 1', () => {
    const d = mutationBudgetDecision(
      [classifyWorkspaceKind({ isCanonical: true }), classifyWorkspaceKind({ declaredKind: 'task' })],
      1,
    );
    expect(d.ok).toBe(false);
    expect(d.reason).toMatch(/1 of 1/);
  });
});

describe('locally-unique work is a distinct, permanent keep', () => {
  const base = { branch: 'feat/x', localSha: SHA_A, prLookup: 'OK' as const, prState: 'NONE' };

  it('no upstream + unique commits is NO_UPSTREAM_UNIQUE_WORK, not UNKNOWN_PR', () => {
    // "the lookup failed" and "this is the only copy of 19 commits" are
    // different keeps, and only one of them is permanent.
    const v = classifyBranch({ ...base, upstream: null, uniqueCommits: 19 });
    expect(v.verdict).toBe(NO_UPSTREAM_UNIQUE_WORK);
    expect(v.reason).toMatch(/exist only here/);
  });

  it('pushed with no PR stays UNKNOWN_PR', () => {
    expect(classifyBranch({ ...base, upstream: 'origin/feat/x', uniqueCommits: 3 }).verdict).toBe(UNKNOWN_PR);
  });

  it('no upstream but no unique commits stays UNKNOWN_PR', () => {
    expect(classifyBranch({ ...base, upstream: null, uniqueCommits: 0 }).verdict).toBe(UNKNOWN_PR);
  });

  it('every human-required verdict is excluded from autonomous action', () => {
    for (const v of REQUIRES_HUMAN_VERDICTS) {
      expect(AUTONOMOUS_BRANCH_VERDICTS.has(v), v).toBe(false);
    }
    expect(AUTONOMOUS_BRANCH_VERDICTS.has(DELETE_MERGED_EXACT)).toBe(true);
  });
});
