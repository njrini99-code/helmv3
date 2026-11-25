// The SessionStart backstop (.claude/hooks/stamp-workspace.mjs) and the one
// worktree line a session sees (.claude/hooks/lib/worktree-line.mjs).
//
// Until 2026-11-25 the backstop stamped every unmarked linked checkout
// `parkPolicy: KEEP`. The classifier's merged-PR exception for unmarked
// checkouts needs the marker ABSENT, and decideRemoval refuses KEEP, so a
// checkout a session had ever opened could never be parked or removed. These
// fixtures run the real hook against a real git worktree and feed what it wrote
// back through the real classifier, so the two cannot drift apart again.
//
// The sweep's own refusals (dirty, unpushed, live process) are asserted on the
// stamped checkout too: stamping releases the checkout only in the sense that
// nobody asked to keep it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  classifyWorktree,
  decideRemoval,
  ACTIVE,
  PARKABLE,
  UNKNOWN_REMOTE,
  KEEP_WORKSPACE_INTENT_REQUIRED,
  REFUSE,
  REMOVE_DELETE_BRANCH,
  WORKTREE_POLICY_KEEP,
  WORKTREE_POLICY_PARK_IF_REPRODUCIBLE,
} from '../lib/worktree-lifecycle.mjs';
import { workspaceIntent } from '../lib/worktree-facts.mjs';
import { formatWorktreeLine } from '../../.claude/hooks/lib/worktree-line.mjs';

const REPO = resolve(__dirname, '../..');
const STAMP_HOOK = resolve(REPO, '.claude/hooks/stamp-workspace.mjs');
const SESSION_HOOK = resolve(REPO, '.claude/hooks/session-context.sh');

function git(args: string[], cwd: string) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function runStamp(cwd: string) {
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  return execFileSync('node', [STAMP_HOOK], {
    cwd,
    input: JSON.stringify({ cwd, hook_event_name: 'SessionStart' }),
    encoding: 'utf-8',
    env,
  });
}

let tmp: string;
let clone: string;

function addWorktree(name: string): string {
  // Outside the repo, the way the door places them, and with no marker: the
  // shape of a hand-made or pre-marker checkout.
  const dir = join(tmp, 'wts', name);
  git(['worktree', 'add', '-q', '--no-track', '-b', `agent/${name}`, dir, 'origin/main'], clone);
  return dir;
}

/** Classifier facts for a clean, pushed checkout, with the marker read the way the sweep reads it. */
function factsFor(dir: string, over: Record<string, unknown> = {}) {
  const sha = git(['rev-parse', 'HEAD'], dir);
  const intent = workspaceIntent(dir);
  return {
    isCanonical: false,
    isCurrentExecution: false,
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], dir),
    dirtyCount: 0,
    hasLiveProcess: false,
    upstream: 'origin/agent/x',
    localSha: sha,
    remoteSha: sha,
    parkPolicy: intent.parkPolicy,
    workspaceMarker: intent.marker,
    ...over,
  };
}

beforeAll(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'helm-stamp-')));
  const originDir = join(tmp, 'origin.git');
  mkdirSync(originDir, { recursive: true });
  git(['init', '-q', '--bare', '-b', 'main'], originDir);
  const seed = join(tmp, 'seed');
  mkdirSync(seed, { recursive: true });
  git(['init', '-q', '-b', 'main'], seed);
  git(['config', 'user.email', 't@e.com'], seed);
  git(['config', 'user.name', 'T'], seed);
  writeFileSync(join(seed, 'a.txt'), 'a\n');
  git(['add', '-A'], seed);
  git(['commit', '-qm', 'c1'], seed);
  git(['remote', 'add', 'origin', originDir], seed);
  git(['push', '-q', 'origin', 'main'], seed);
  clone = join(tmp, 'clone');
  git(['clone', '-q', originDir, clone], tmp);
  git(['config', 'user.email', 't@e.com'], clone);
  git(['config', 'user.name', 'T'], clone);
});

afterAll(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe('stamp-workspace backstop', () => {
  it('stamps an unmarked linked checkout PARK_IF_REPRODUCIBLE, never KEEP', () => {
    const wt = addWorktree('unmarked');
    expect(workspaceIntent(wt).marker).toBe('absent');

    const out = runStamp(wt);

    const marker = JSON.parse(readFileSync(join(wt, '.helm/workspace.json'), 'utf-8'));
    expect(marker.kind).toBe('task');
    expect(marker.parkPolicy).toBe(WORKTREE_POLICY_PARK_IF_REPRODUCIBLE);
    expect(marker.parkPolicy).not.toBe(WORKTREE_POLICY_KEEP);
    expect(marker.createdBy).toMatch(/stamp-workspace/);
    // It reports the stamp, and no longer prints a count or a "budget".
    expect(out).toMatch(/stamped an unmarked worktree/);
    expect(out).not.toMatch(/budget|workspaces:/i);
  });

  it('prints nothing when the checkout is already marked, and leaves a human KEEP alone', () => {
    const wt = addWorktree('kept');
    mkdirSync(join(wt, '.helm'), { recursive: true });
    writeFileSync(join(wt, '.helm/workspace.json'), `${JSON.stringify({ kind: 'task', parkPolicy: 'KEEP' })}\n`);

    expect(runStamp(wt).trim()).toBe('');
    expect(workspaceIntent(wt).parkPolicy).toBe(WORKTREE_POLICY_KEEP);
  });

  it('a stamped, clean, pushed checkout whose PR merged classifies PARKABLE', () => {
    const wt = addWorktree('merged');
    runStamp(wt);
    const facts = factsFor(wt, { prLookup: 'OK', prState: 'MERGED', prNumber: 2201 });
    facts.prHeadSha = facts.localSha;

    const v = classifyWorktree(facts);
    expect(v.verdict).toBe(PARKABLE);
    // The removal hook agrees: a stamped checkout is not refused for its policy.
    expect(
      decideRemoval({
        exists: true,
        registered: true,
        isCanonical: false,
        parkPolicy: facts.parkPolicy,
        dirtyCount: 0,
        branch: facts.branch,
        localSha: facts.localSha,
        uniqueCommits: 0,
      }).action,
    ).toBe(REMOVE_DELETE_BRANCH);
  });

  it('the same checkout stamped KEEP (the old behaviour) was never parkable', () => {
    // Pins WHY the stamp value matters: this is the verdict the old backstop produced.
    const wt = addWorktree('old-keep');
    mkdirSync(join(wt, '.helm'), { recursive: true });
    writeFileSync(join(wt, '.helm/workspace.json'), `${JSON.stringify({ kind: 'task', parkPolicy: 'KEEP' })}\n`);
    const facts = factsFor(wt, { prLookup: 'OK', prState: 'MERGED', prNumber: 2201 });
    facts.prHeadSha = facts.localSha;

    expect(classifyWorktree(facts).verdict).toBe(KEEP_WORKSPACE_INTENT_REQUIRED);
    expect(
      decideRemoval({ exists: true, registered: true, isCanonical: false, parkPolicy: 'KEEP', dirtyCount: 0, branch: facts.branch, localSha: facts.localSha, uniqueCommits: 0 }).action,
    ).toBe(REFUSE);
  });

  it('still refuses a stamped checkout that is dirty, unpushed or in use', () => {
    const wt = addWorktree('refusals');
    runStamp(wt);
    const merged = { prLookup: 'OK', prState: 'MERGED', prNumber: 2201 };

    expect(classifyWorktree(factsFor(wt, { ...merged, prHeadSha: git(['rev-parse', 'HEAD'], wt), dirtyCount: 2 })).verdict).toBe(ACTIVE);
    expect(classifyWorktree(factsFor(wt, { ...merged, prHeadSha: git(['rev-parse', 'HEAD'], wt), hasLiveProcess: true })).verdict).toBe(ACTIVE);
    // No upstream and no merged PR for this exact tip: commits may exist nowhere else.
    expect(classifyWorktree(factsFor(wt, { upstream: null, remoteSha: null })).verdict).toBe(UNKNOWN_REMOTE);
  });
});

describe('the one worktree line', () => {
  it('says advisory, shows the count, and never says budget', () => {
    const line = formatWorktreeLine(4, 6, false);
    expect(line).toBe('worktrees: 4 linked (advisory; repo:doctor warns above 7)');
    expect(line).not.toMatch(/budget/i);
  });

  it('says so when HELM_MAX_MUTATION_WORKTREES makes it a hard cap', () => {
    expect(formatWorktreeLine(4, 4, true)).toBe('worktrees: 4 linked (hard cap 4, set by HELM_MAX_MUTATION_WORKTREES)');
  });

  it('prints nothing when there is no linked checkout', () => {
    expect(formatWorktreeLine(0, 6, false)).toBe('');
  });

  it('session-context.sh prints exactly one worktrees line and no "workspaces:" count', () => {
    const wt = addWorktree('line');
    const out = execFileSync('bash', [SESSION_HOOK], {
      cwd: wt,
      input: '{}',
      encoding: 'utf-8',
      env: { ...process.env, HELM_SESSION_OFFLINE: '1', CLAUDE_PROJECT_DIR: '' },
    });
    const ctx: string = JSON.parse(out).hookSpecificOutput.additionalContext;
    const lines = ctx.split('\n').filter((l) => /worktrees:/.test(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^- worktrees: \d+ linked \(advisory; repo:doctor warns above \d+\)$/);
    expect(ctx).not.toMatch(/workspaces:|of budget/);
  });
});
