// SessionStart must report integration distance from the ONE authority.
//
// THE DUPLICATION, as it stands before this change:
//
//   workspace-identity.mjs   ahead  = origin/main..HEAD
//                            behind = HEAD..origin/main
//
//   session-context.sh       AHEAD  = @{u}..HEAD
//                            BEHIND = HEAD..main
//
// Those are not the same questions, and both of SessionStart's are wrong for
// this repo's own workspace model:
//
//   - `@{u}..HEAD` is "ahead of my own remote task branch". A worktree made by
//     scripts/new-worktree.sh has NO upstream by design (--no-track), so this
//     degrades to "?" even though git can compute the real distance perfectly.
//     And once the task branch IS pushed, @{u} becomes origin/agent/foo, so
//     the number silently becomes "ahead of myself" — which is 0 by
//     construction and tells you nothing about the trunk.
//
//   - `HEAD..main` measures against the LOCAL main ref, which can be stale,
//     ahead, or divergent from origin/main. Local main is not integration
//     truth; origin/main is.
//
// Every fixture below builds a real bare origin plus real clones. No hardcoded
// machine paths — an earlier test in this program encoded one laptop's
// topology and passed locally while failing every path assertion in CI.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { workspaceIdentity } from '../../../.claude/hooks/lib/workspace-identity.mjs';

const REPO = resolve(__dirname, '../../..');
const MODULE = resolve(REPO, '.claude/hooks/lib/workspace-identity.mjs');
const HOOK = resolve(REPO, '.claude/hooks/session-context.sh');

function git(args: string[], cwd: string) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function commit(dir: string, name: string) {
  writeFileSync(join(dir, `${name}.txt`), `${name}\n`);
  git(['add', '-A'], dir);
  git(['commit', '-qm', name], dir);
}

/** The SessionStart hook's injected context, run in a given directory. */
function sessionContext(cwd: string): string {
  const r = execFileSync('bash', [HOOK], {
    cwd,
    input: '{}',
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return r;
}

/** The authority's own answer, via its CLI, for a given directory. */
function identityCli(cwd: string): Record<string, unknown> {
  const out = execFileSync('node', [MODULE, '--identity-json', '--cwd', cwd], {
    encoding: 'utf-8',
  });
  return JSON.parse(out) as Record<string, unknown>;
}

let tmp: string;
let originDir: string;
let clone: string;

beforeAll(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'helm-dist-')));
  originDir = join(tmp, 'origin.git');
  clone = join(tmp, 'clone');

  // A real bare origin, so origin/main is a genuine remote-tracking ref.
  mkdirSync(originDir, { recursive: true });
  git(['init', '-q', '--bare', '-b', 'main'], originDir);

  const seed = join(tmp, 'seed');
  mkdirSync(seed, { recursive: true });
  git(['init', '-q', '-b', 'main'], seed);
  git(['config', 'user.email', 't@e.com'], seed);
  git(['config', 'user.name', 'T'], seed);
  commit(seed, 'base');
  git(['remote', 'add', 'origin', originDir], seed);
  git(['push', '-q', 'origin', 'main'], seed);

  // Two more commits land on origin/main only — so a clone that does not
  // advance its LOCAL main is behind the trunk by exactly 2.
  commit(seed, 'trunk-1');
  commit(seed, 'trunk-2');
  git(['push', '-q', 'origin', 'main'], seed);

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

describe('integration distance — local main is not the trunk', () => {
  it('stale local main: behind must be measured against origin/main', () => {
    const wt = join(tmp, 'stale');
    // A task branch based on the OLD state, with local main left behind.
    git(['branch', '-f', 'local-stale', 'HEAD~2'], clone);
    git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/stale', wt, 'HEAD~2'], clone);

    const id = workspaceIdentity({ cwd: wt });
    const truth = Number(git(['rev-list', '--count', 'HEAD..origin/main'], wt));

    expect(truth).toBe(2);
    expect(id.behind).toBe(truth);
  });

  it('divergent local main: an unpushed local commit is not integration truth', () => {
    const wt = join(tmp, 'divergent');
    git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/divergent', wt, 'origin/main'], clone);

    // Local main gains a commit that origin/main does not have.
    git(['checkout', '-q', 'main'], clone);
    commit(clone, 'local-only');

    const id = workspaceIdentity({ cwd: wt });
    const againstOrigin = Number(git(['rev-list', '--count', 'HEAD..origin/main'], wt));
    const againstLocalMain = Number(git(['rev-list', '--count', 'HEAD..main'], wt));

    // The two disagree — that disagreement is the whole bug.
    expect(againstLocalMain).not.toBe(againstOrigin);
    expect(id.behind).toBe(againstOrigin);
    expect(id.behind).toBe(0);
  });
});

describe('integration distance — upstream is not the trunk', () => {
  it('a task branch with NO upstream still has a known ahead number', () => {
    const wt = join(tmp, 'noups');
    git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/noups', wt, 'origin/main'], clone);
    commit(wt, 'task-1');
    commit(wt, 'task-2');

    const id = workspaceIdentity({ cwd: wt });

    // This is the normal shape of a Helm workspace before its first push.
    expect(id.upstream).toBeNull();
    // The old `@{u}..HEAD` degraded to "?" here. The trunk distance is knowable.
    expect(id.ahead).toBe(2);
    expect(id.behind).toBe(0);
  });

  it('a pushed task branch: ahead-of-trunk, not ahead-of-itself', () => {
    const wt = join(tmp, 'pushed');
    git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/pushed', wt, 'origin/main'], clone);
    commit(wt, 'p1');
    commit(wt, 'p2');
    git(['push', '-q', '-u', 'origin', 'agent/pushed'], wt);

    const id = workspaceIdentity({ cwd: wt });

    // HEAD == origin/agent/pushed, so the OLD metric reports 0...
    expect(Number(git(['rev-list', '--count', '@{u}..HEAD'], wt))).toBe(0);
    // ...while the branch is genuinely 2 commits ahead of the trunk.
    expect(id.upstream).toBe('origin/agent/pushed');
    expect(id.ahead).toBe(2);
  });
});

describe('integration distance — unknown must not become zero', () => {
  it('missing origin/main yields null, never 0', () => {
    const lone = join(tmp, 'lone');
    mkdirSync(lone, { recursive: true });
    git(['init', '-q', '-b', 'main'], lone);
    git(['config', 'user.email', 't@e.com'], lone);
    git(['config', 'user.name', 'T'], lone);
    commit(lone, 'only');

    const id = workspaceIdentity({ cwd: lone });

    expect(id.baseSha).toBeNull();
    expect(id.ahead).toBeNull();
    expect(id.behind).toBeNull();
  });
});

describe('SessionStart consumes the authority', () => {
  it('the full-identity CLI returns the same numbers as the module', () => {
    const wt = join(tmp, 'noups');
    const fromModule = workspaceIdentity({ cwd: wt });
    const fromCli = identityCli(wt);

    expect(fromCli.ahead).toBe(fromModule.ahead);
    expect(fromCli.behind).toBe(fromModule.behind);
    expect(fromCli.branch).toBe(fromModule.branch);
    expect(fromCli.baseSha).toBe(fromModule.baseSha);
  });

  it('SessionStart reports ahead/behind of origin/main, and names the ref', () => {
    const wt = join(tmp, 'noups');
    const out = sessionContext(wt);
    const id = workspaceIdentity({ cwd: wt });

    expect(out).toMatch(/ahead of origin\/main/);
    expect(out).toMatch(/behind origin\/main/);
    // The basis of the number must be visible: a remote-tracking ref is only
    // as fresh as the last fetch.
    expect(out).toMatch(/origin\/main ref:/);
    // Assert the LABELLED value, not a bare substring. `toContain('2')` passed
    // even with the old @{u} math restored, because "2" also appears in the
    // uncommitted-files and worktree counts. A failure injection caught that —
    // the assertion could not distinguish the number it was supposed to pin.
    expect(out).toContain(`ahead of origin/main: ${id.ahead}`);
  });

  it('SessionStart no longer says "ahead of upstream" or "BEHIND main"', () => {
    const out = sessionContext(join(tmp, 'noups'));
    expect(out).not.toMatch(/ahead of upstream/);
    expect(out).not.toMatch(/BEHIND main/);
  });

  it('SessionStart agrees with the authority on a stale-main workspace', () => {
    const wt = join(tmp, 'stale');
    const id = workspaceIdentity({ cwd: wt });
    const out = sessionContext(wt);

    // 2, not 0 — the old HEAD..main path could not see this.
    expect(id.behind).toBe(2);
    expect(out).toContain(`behind origin/main: ${id.behind}`);
  });
});
