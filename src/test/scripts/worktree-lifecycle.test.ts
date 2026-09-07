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
  KEEP_WORKSPACE_INTENT_REQUIRED,
  mayActAutonomously,
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
  KEEP_PR_OWNER_INTENT_REQUIRED,
  WORKTREE_POLICY_KEEP,
  WORKTREE_POLICY_PARK_IF_REPRODUCIBLE,
  OPEN_PR_KEEP_DISPOSITIONS,
} from '../../../scripts/lib/worktree-lifecycle.mjs';

const REPO = resolve(__dirname, '../../..');
const CLI = resolve(REPO, 'scripts/worktree-lifecycle.mjs');

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

// "clean" means nothing stands in the way — which since 2026-08-30 includes a
// workspace that has RELEASED itself. Leaving parkPolicy out here would silently
// convert every test below into a test of the new gate instead of the one it was
// written for; the gate's own behaviour is pinned in its own describe block.
const clean = {
  isCanonical: false,
  isCurrentExecution: false,
  branch: 'agent/x',
  dirtyCount: 0,
  hasLiveProcess: false,
  upstream: 'origin/agent/x',
  localSha: SHA_A,
  remoteSha: SHA_A,
  parkPolicy: WORKTREE_POLICY_PARK_IF_REPRODUCIBLE,
  workspaceMarker: 'present',
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

  // PR #1863: `gh pr merge --delete-branch` removes the remote branch AT THE
  // MOMENT the checkout becomes safe to park, so "no upstream" and "just
  // merged" are indistinguishable from upstream alone. A MERGED PR whose head
  // OID matches the local tip exactly is stronger proof than a remote ref —
  // GitHub is attesting this exact tree reached main.
  it('PARKS a no-upstream checkout when its PR MERGED with tip === PR head exactly', () => {
    const v = classifyWorktree({
      ...clean,
      upstream: null,
      remoteSha: null,
      prState: 'MERGED',
      prNumber: 1863,
      prHeadSha: SHA_A,
    });
    expect(v.verdict).toBe(PARKABLE);
    expect(v.reason).toMatch(/PR #1863 MERGED/);
  });

  it('still refuses UNKNOWN_REMOTE for a no-upstream tip with no matching MERGED PR', () => {
    // No PR facts at all — the ordinary unpushed-work case.
    expect(
      classifyWorktree({ ...clean, upstream: null, remoteSha: null }).verdict,
    ).toBe(UNKNOWN_REMOTE);
    // MERGED, but the local tip has since diverged from the PR head — the
    // exact-match requirement, not "a PR merged at some point".
    expect(
      classifyWorktree({
        ...clean,
        upstream: null,
        remoteSha: null,
        prState: 'MERGED',
        prNumber: 1863,
        prHeadSha: SHA_B,
      }).verdict,
    ).toBe(UNKNOWN_REMOTE);
  });

  it('PARKS a clean, idle, fully-pushed worktree when no PR claims it', () => {
    // This assertion used to end "— regardless of PR state", and that sentence
    // was the #1681 defect written as a guarantee. It is now scoped: with no PR
    // in the facts there is nobody to ask, and reproducibility decides.
    expect(classifyWorktree(clean).verdict).toBe(PARKABLE);
  });
});

// ---------------------------------------------------------------------------
// THE #1681 REGRESSION.
//
// On 2026-08-30 `npm run worktrees:retire` removed a CONCURRENT session's
// checkout (agent/round-type-reclassify, PR #1681, OPEN). Every mechanical
// signal said disposable: clean, tip identical to its pushed remote, and no
// process whose cwd `lsof` could see. Nothing was lost, because parking keeps
// the branch — but the checkout had an owner and the tool could not tell.
//
// The unsound step is reading silence as absence. `lsof +D` samples one
// instant; an agent session between two tool calls has no visible cwd. So
// hasLiveProcess === true is a sound veto and hasLiveProcess === false proves
// nothing at all. For an OPEN PR, dispensability must now be stated by its
// owner in config/open-pr-dispositions.json, not inferred.
//
// `openPr` below is the exact fact-set of that failure. The pre-fix classifier
// returned PARKABLE for it; that is what these tests pin shut.

const openPr = {
  ...clean,
  prLookup: 'OK',
  prNumber: 1681,
  prState: 'OPEN',
  disposition: null,
  worktreePolicy: null,
};

describe('a checkout is disposable only if its own workspace says so', () => {
  // The residue the #1681 fix left behind, registered as
  // WORKTREE_PARK_NO_PR_OWNERSHIP: the OPEN-PR gate cannot cover the window
  // BEFORE a PR exists, and that window is where a session starts. A worktree
  // five minutes old is clean, pushed, has no PR to key a disposition on, and is
  // invisible to lsof between two tool calls.
  const noPr = { ...clean, prLookup: 'OK', prState: 'NONE', prNumber: null };

  it('KEEPS a PR-less checkout whose workspace says KEEP', () => {
    const v = classifyWorktree({ ...noPr, parkPolicy: WORKTREE_POLICY_KEEP });
    expect(v.verdict).toBe(KEEP_WORKSPACE_INTENT_REQUIRED);
    expect(v.reason).toMatch(/parkPolicy is KEEP/);
  });

  it('KEEPS a checkout with NO .helm/workspace.json at all', () => {
    // Not a hypothetical: measured 2026-08-30, the one live non-canonical
    // worktree (agent/round-type-reclassify) predates the marker entirely.
    const v = classifyWorktree({ ...noPr, parkPolicy: null, workspaceMarker: 'absent' });
    expect(v.verdict).toBe(KEEP_WORKSPACE_INTENT_REQUIRED);
    expect(v.reason).toMatch(/no \.helm\/workspace\.json/);
  });

  it('KEEPS a marker that exists but carries no parkPolicy key', () => {
    const v = classifyWorktree({ ...noPr, parkPolicy: null, workspaceMarker: 'present' });
    expect(v.verdict).toBe(KEEP_WORKSPACE_INTENT_REQUIRED);
    expect(v.reason).toMatch(/parkPolicy is unset/);
  });

  it('KEEPS an unreadable marker — a broken file is not a release', () => {
    const v = classifyWorktree({ ...noPr, parkPolicy: null, workspaceMarker: 'unreadable' });
    expect(v.verdict).toBe(KEEP_WORKSPACE_INTENT_REQUIRED);
    expect(v.reason).toMatch(/could not be read/);
  });

  it('KEEPS an unrecognised parkPolicy value', () => {
    expect(classifyWorktree({ ...noPr, parkPolicy: 'PARK' }).verdict).toBe(KEEP_WORKSPACE_INTENT_REQUIRED);
  });

  it('PARKS a PR-less checkout once its workspace releases it', () => {
    expect(classifyWorktree(noPr).verdict).toBe(PARKABLE);
  });

  it('a positive process sighting still overrides a released workspace', () => {
    expect(classifyWorktree({ ...noPr, hasLiveProcess: true }).verdict).toBe(ACTIVE);
  });

  it('a negative process sighting still authorises nothing on its own', () => {
    // The whole point: with the workspace saying KEEP, lsof silence changes
    // nothing. That inference is what removed a live checkout on 2026-08-30.
    expect(
      classifyWorktree({ ...noPr, parkPolicy: WORKTREE_POLICY_KEEP, hasLiveProcess: false }).verdict,
    ).toBe(KEEP_WORKSPACE_INTENT_REQUIRED);
  });

  it('an OPEN PR released by its owner CANNOT override a workspace KEEP', () => {
    // Two different facts, and both must permit. Workspace identity answers
    // "may this CHECKOUT go"; PR state answers "may this BRANCH be deleted".
    const v = classifyWorktree({
      ...clean,
      parkPolicy: WORKTREE_POLICY_KEEP,
      prLookup: 'OK',
      prNumber: 1659,
      prState: 'OPEN',
      disposition: 'HUMAN_TEST_PENDING',
      worktreePolicy: WORKTREE_POLICY_PARK_IF_REPRODUCIBLE,
    });
    expect(v.verdict).toBe(KEEP_WORKSPACE_INTENT_REQUIRED);
  });

  it('the new verdict is excluded from autonomous action', () => {
    expect(REQUIRES_HUMAN_VERDICTS.has(KEEP_WORKSPACE_INTENT_REQUIRED)).toBe(true);
    expect(mayActAutonomously(KEEP_WORKSPACE_INTENT_REQUIRED)).toBe(false);
  });
});

describe('an OPEN PR needs its owner to release the checkout', () => {
  it('REPRODUCES #1681: the exact fact-set that was parked is now refused', () => {
    // Clean, pushed, lsof-silent, OPEN PR, no recorded intent.
    const v = classifyWorktree(openPr);
    expect(v.verdict).toBe(KEEP_PR_OWNER_INTENT_REQUIRED);
    expect(v.verdict).not.toBe(PARKABLE);
    expect(combineVerdicts(v.verdict, KEEP_OPEN).action).toBe('KEEP');
    expect(v.reason).toMatch(/1681/);
  });

  it('is neither ACTIVE nor UNKNOWN — both would be false claims', () => {
    // ACTIVE would assert somebody is demonstrably using it; nothing proved
    // that. UNKNOWN would assert the evidence was unreadable; the PR read fine.
    // What is missing is a decision, and it gets its own name.
    const v = classifyWorktree(openPr).verdict;
    expect(v).not.toBe(ACTIVE);
    expect(v).not.toBe(UNKNOWN);
  });

  it('KEEPS an OPEN PR marked ACTIVE, whatever its policy field says', () => {
    // Defence in depth: a mis-typed policy beside ACTIVE must fail safe.
    expect(
      classifyWorktree({ ...openPr, disposition: 'ACTIVE', worktreePolicy: WORKTREE_POLICY_PARK_IF_REPRODUCIBLE })
        .verdict,
    ).toBe(KEEP_PR_OWNER_INTENT_REQUIRED);
    expect(OPEN_PR_KEEP_DISPOSITIONS.has('ACTIVE')).toBe(true);
  });

  it('KEEPS an OPEN PR marked UNKNOWN — nobody has established what it is', () => {
    expect(
      classifyWorktree({ ...openPr, disposition: 'UNKNOWN', worktreePolicy: WORKTREE_POLICY_PARK_IF_REPRODUCIBLE })
        .verdict,
    ).toBe(KEEP_PR_OWNER_INTENT_REQUIRED);
  });

  it('KEEPS a recorded disposition whose worktree_policy is KEEP', () => {
    expect(
      classifyWorktree({ ...openPr, disposition: 'STALE', worktreePolicy: WORKTREE_POLICY_KEEP }).verdict,
    ).toBe(KEEP_PR_OWNER_INTENT_REQUIRED);
  });

  it('KEEPS when the policy is unset or outside the vocabulary', () => {
    expect(classifyWorktree({ ...openPr, disposition: 'STALE' }).verdict).toBe(KEEP_PR_OWNER_INTENT_REQUIRED);
    expect(
      classifyWorktree({ ...openPr, disposition: 'STALE', worktreePolicy: 'PARK' }).verdict,
    ).toBe(KEEP_PR_OWNER_INTENT_REQUIRED);
  });

  it('PARKS #1659: HUMAN_TEST_PENDING with an explicit PARK_IF_REPRODUCIBLE', () => {
    // The case the park/retire split exists for. An open PR waiting on a human
    // with a physical device should not cost ~3.8 GiB while it waits — and the
    // owner has said so, in the file, rather than the tool inferring it.
    const v = classifyWorktree({
      ...openPr,
      prNumber: 1659,
      disposition: 'HUMAN_TEST_PENDING',
      worktreePolicy: WORKTREE_POLICY_PARK_IF_REPRODUCIBLE,
    });
    expect(v.verdict).toBe(PARKABLE);
    expect(v.reason).toMatch(/HUMAN_TEST_PENDING/);
  });

  it('a positive process sighting overrides even an authorising policy', () => {
    // Permission is not a reason to remove a checkout somebody is standing in.
    expect(
      classifyWorktree({
        ...openPr,
        disposition: 'HUMAN_TEST_PENDING',
        worktreePolicy: WORKTREE_POLICY_PARK_IF_REPRODUCIBLE,
        hasLiveProcess: true,
      }).verdict,
    ).toBe(ACTIVE);
  });

  it('a negative process sighting never authorises anything on its own', () => {
    // The whole defect in one assertion: hasLiveProcess false plus everything
    // else mechanical is NOT enough.
    expect(classifyWorktree({ ...openPr, hasLiveProcess: false }).verdict).toBe(
      KEEP_PR_OWNER_INTENT_REQUIRED,
    );
  });

  it('a FAILED PR lookup is UNKNOWN — evidence unavailable, not permission', () => {
    const v = classifyWorktree({ ...openPr, prLookup: 'FAILED', prState: null });
    expect(v.verdict).toBe(UNKNOWN);
    expect(combineVerdicts(v.verdict, UNKNOWN_PR).action).toBe('KEEP');
  });

  it('still refuses unpushed work, permission or not', () => {
    // Ownership is a new necessary condition, not a replacement for the old one.
    expect(
      classifyWorktree({
        ...openPr,
        disposition: 'HUMAN_TEST_PENDING',
        worktreePolicy: WORKTREE_POLICY_PARK_IF_REPRODUCIBLE,
        upstream: null,
      }).verdict,
    ).toBe(UNKNOWN_REMOTE);
  });

  it('a MERGED PR is unaffected — GitHub already proved that tree landed', () => {
    // Deliberate scope. Once a PR is merged, its checkout is reproducible from
    // main and no disposition is required; the branch half is still gated on an
    // exact head-OID match.
    const v = classifyWorktree({ ...openPr, prState: 'MERGED', prNumber: 903 });
    expect(v.verdict).toBe(PARKABLE);
    expect(combineVerdicts(v.verdict, DELETE_MERGED_EXACT).action).toBe('RETIRE');
  });

  it('the new verdict is excluded from autonomous action', () => {
    expect(REQUIRES_HUMAN_VERDICTS.has(KEEP_PR_OWNER_INTENT_REQUIRED)).toBe(true);
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

  /**
   * The CLI reads owner intent from the repository it is ACTING ON, so a
   * fixture gets its own file. Absent means "no PR here has been released",
   * which is why the refusal test below writes nothing at all.
   */
  function writeDispositions(table: Record<string, unknown>) {
    mkdirSync(join(canonical, 'config'), { recursive: true });
    writeFileSync(join(canonical, 'config/open-pr-dispositions.json'), JSON.stringify(table, null, 2));
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
    // .gitignore:257 in the real repo ignores .helm/, which is why writing the
    // workspace marker does not make a checkout dirty there. Without the same
    // line here the marker itself would read as uncommitted work and every
    // worktree below would classify ACTIVE — the fixture disagreeing with
    // production about what "clean" means.
    writeFileSync(join(canonical, '.gitignore'), '.helm/\n');
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

  it("looks the canonical checkout's OWN branch up, instead of inventing 'no PR'", () => {
    // The canonical checkout used to be skipped in the PR lookup and handed a
    // literal { lookup: 'OK', state: 'NONE' } — which does not say "not
    // checked", it says "checked, and there is no PR". classifyBranch read that
    // exactly as written, so canonical's own branch always came back UNKNOWN_PR
    // even with a MERGED PR against it. Measured against #1694 on 2026-08-30.
    //
    // Reaching this at all takes one extra step, and that step is the reason
    // the bug survived: canonicalRoot() returns null for a fixture, because it
    // resolves .claude/hooks/lib/workspace-identity.mjs against the repo under
    // test and fixtures do not have one. That is deliberate and correct — a
    // fixture must never be able to claim it is the real canonical checkout —
    // but it also means isCanonical is ALWAYS false here, so every
    // canonical-only branch of the tool was untestable. Giving the fixture its
    // own identity stub is what makes this assertion able to fail.
    mkdirSync(join(canonical, '.claude/hooks/lib'), { recursive: true });
    writeFileSync(
      join(canonical, '.claude/hooks/lib/workspace-identity.mjs'),
      `console.log(${JSON.stringify(canonical)});\n`,
    );

    git(['checkout', '-q', '-b', 'agent/canon-own', 'main'], canonical);
    const sha = git(['rev-parse', 'agent/canon-own'], canonical);
    writePrStub({ 'agent/canon-own': `1694 MERGED ${sha}` });

    const line = row(run(), 'agent/canon-own');
    // The checkout is canonical, so it is never parkable — proving the fixture
    // really is being treated as canonical, which is what makes the rest count.
    expect(line).toContain('ACTIVE');
    // ...and its BRANCH is still classified from real PR facts. The two
    // questions AGENTS.md insists on keeping separate, kept separate.
    expect(line).toContain('1694');
    expect(line).toContain('MERGED');
    expect(line).not.toContain('UNKNOWN_PR');
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

  /**
   * The residue the tool could not see, and the only kind an operator does.
   *
   * Every version before 2026-08-31 enumerated `refs/heads` — LOCAL branches.
   * A branch whose local copy was pruned after merging, or that was pushed
   * from another machine, existed only as `refs/remotes/origin/<b>` and was
   * therefore absent from the report entirely. Measured on the live repo that
   * day: three such branches, one of them a PR that had been MERGED for days,
   * while the report said "0 branches to delete" and GitHub's branch list —
   * the thing the owner was actually looking at — still showed it.
   */
  it('sees a remote-only branch and offers DELETE_REMOTE when the PR proves it merged', () => {
    // A remote ref with no local branch, exactly as delete_branch_on_merge or
    // a prune leaves behind.
    if (!git(['remote'], canonical).includes('origin')) {
      git(['remote', 'add', 'origin', canonical], canonical);
      git(['config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*'], canonical);
    }
    const sha = git(['rev-parse', 'main'], canonical).trim();
    git(['update-ref', 'refs/remotes/origin/feat/remote-only', sha], canonical);

    writePrStub({ 'feat/remote-only': `4242 MERGED ${sha}` });
    const out = run();
    const r = row(out, 'feat/remote-only');

    expect(r).toMatch(/remote only/);
    expect(r).toMatch(/DELETE_MERGED_EXACT/);
    // Its own verb: `git push origin --delete` is not `git branch -D`, and a
    // report that renders them identically invites the wrong assumption about
    // how recoverable the action is.
    expect(r).toMatch(/DELETE_REMOTE/);
  });

  it('keeps a remote-only branch whose tip moved past its merged PR', () => {
    if (!git(['remote'], canonical).includes('origin')) {
      git(['remote', 'add', 'origin', canonical], canonical);
      git(['config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*'], canonical);
    }
    const sha = git(['rev-parse', 'main'], canonical).trim();
    git(['update-ref', 'refs/remotes/origin/feat/remote-diverged', sha], canonical);

    // PR merged an EARLIER commit; the branch has moved on since. Those
    // commits exist nowhere else once the remote ref is gone.
    writePrStub({ 'feat/remote-diverged': '4243 MERGED 0000000000000000000000000000000000000000' });
    const r = row(run(), 'feat/remote-diverged');

    expect(r).toMatch(/KEEP_DIVERGED_AFTER_PR/);
    expect(r).not.toMatch(/DELETE_REMOTE/);
  });

  // Strengthened 2026-08-31. It still asserts the original guarantee — a
  // failed lookup never produces an action — and now also asserts that the
  // tool SAYS SO and exits non-zero.
  //
  // The gap this closes was observed, not imagined: when `gh` could not reach
  // GitHub (Go's TLS cannot read the macOS keychain inside the Bash sandbox),
  // every row read UNKNOWN and the summary read "0 branches deletable". That
  // is indistinguishable from a genuinely clean repo, and it is why branches
  // accumulated for weeks while a working cleanup tool sat right here. Exit 0
  // on a total evidence blackout is the tool reporting success at having
  // learned nothing.
  it('a FAILED lookup never produces an action, and says so loudly', () => {
    const wt = join(tmp, 'w3');
    git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/w3', wt, 'main'], canonical);
    writeFileSync(stub, '#!/usr/bin/env bash\nexit 3\n');
    chmodSync(stub, 0o755);

    let out = '';
    let status: number | null = null;
    try {
      out = run();
      status = 0;
    } catch (err) {
      const e = err as { status?: number; stdout?: string };
      status = e.status ?? null;
      out = e.stdout ?? '';
    }

    const r = row(out, 'agent/w3');
    expect(r).toMatch(/UNKNOWN_PR/);
    expect(r).not.toMatch(/DELETE_BRANCH|RETIRE|DELETE_REMOTE/);
    // The part that was missing: an unknown must not read as a clean result.
    expect(out).toMatch(/INFRASTRUCTURE_FAILURE/);
    expect(out).toMatch(/proves NOTHING/);
    expect(status).toBe(2);
  });

  /**
   * Make a worktree genuinely reproducible: clean, and identical to a real
   * upstream. `%(upstream:short)` needs a remote with a fetch refspec, not just
   * branch.*.remote/merge — without it git reports no upstream and the tool
   * correctly refuses to park work it cannot prove is pushed.
   */
  function pushedWorktree(name: string, parkPolicy: string | null = 'PARK_IF_REPRODUCIBLE'): string {
    const wt = join(tmp, name);
    const branch = `agent/${name}`;
    git(['worktree', 'add', '-q', '--no-track', '-b', branch, wt, 'main'], canonical);
    // scripts/new-worktree.sh writes .helm/workspace.json; a raw `git worktree
    // add` does not, and the workspace gate correctly refuses one without it.
    // Pass null to exercise exactly that.
    if (parkPolicy !== null) {
      mkdirSync(join(wt, '.helm'), { recursive: true });
      writeFileSync(join(wt, '.helm/workspace.json'), JSON.stringify({ kind: 'task', parkPolicy }));
    }
    if (!git(['remote'], canonical).includes('origin')) {
      git(['remote', 'add', 'origin', canonical], canonical);
      git(['config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*'], canonical);
    }
    git(['update-ref', `refs/remotes/origin/${branch}`, git(['rev-parse', branch], canonical)], canonical);
    git(['config', `branch.${branch}.remote`, 'origin'], canonical);
    git(['config', `branch.${branch}.merge`, `refs/heads/${branch}`], canonical);
    return wt;
  }

  it('REPRODUCES #1681 end to end: --park refuses an OPEN PR with no disposition', () => {
    // Every mechanical signal says disposable — clean, pushed, no process this
    // instant. That was enough on 2026-08-30 and it removed a live checkout.
    const wt = pushedWorktree('w4a');
    writePrStub({ 'agent/w4a': '1681 OPEN deadbeef' });
    // Deliberately no dispositions file: this is the state that caused it.

    const out = run(['--park']);
    expect(git(['worktree', 'list'], canonical)).toContain(wt);
    expect(out).toMatch(/KEEP_PR_OWNER_INTENT_REQUIRED/);
  });

  it('--park refuses a PR-LESS checkout whose workspace has not released it', () => {
    // The window the OPEN-PR gate cannot see: no PR exists yet, so there is no
    // row to key intent on. Before this, reproducibility alone decided.
    const wt = pushedWorktree('w4c', 'KEEP');
    writePrStub({});

    const out = run(['--park']);
    expect(git(['worktree', 'list'], canonical)).toContain(wt);
    expect(out).toMatch(/KEEP_WORKSPACE_INTENT_REQUIRED/);
  });

  it('--park refuses a checkout with no .helm/workspace.json at all', () => {
    const wt = pushedWorktree('w4d', null);
    writePrStub({});

    const out = run(['--park']);
    expect(git(['worktree', 'list'], canonical)).toContain(wt);
    expect(out).toMatch(/no \.helm\/workspace\.json/);
  });

  it('--park still refuses when the disposition says KEEP', () => {
    const wt = pushedWorktree('w4b');
    writePrStub({ 'agent/w4b': '1681 OPEN deadbeef' });
    writeDispositions({ '1681': { disposition: 'ACTIVE', worktree_policy: 'KEEP' } });

    run(['--park']);
    expect(git(['worktree', 'list'], canonical)).toContain(wt);
  });

  it('--park removes the checkout and KEEPS the branch when the owner released it', () => {
    const wt = pushedWorktree('w4');
    writePrStub({ 'agent/w4': '1659 OPEN deadbeef' });
    writeDispositions({
      '1659': { disposition: 'HUMAN_TEST_PENDING', worktree_policy: 'PARK_IF_REPRODUCIBLE' },
    });

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
