// Regression test for the workspace-identity P0.
//
// THE BUG: every hook resolved the repo root as
//   process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd()
// so a session working inside a git worktree was handed the branch, dirty
// state and ahead/behind of the CANONICAL checkout instead of its own.
//
// This test builds a REAL repo with a REAL linked worktree, then sets
// CLAUDE_PROJECT_DIR to the canonical checkout while passing the worktree as
// the hook's cwd — the exact shape the plan specifies. It is written so that
// restoring the old precedence makes it FAIL: the two checkouts are on
// different branches with different dirty state, so an assertion on the
// branch name alone distinguishes them.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';

import {
  resolveActiveRoot,
  canonicalRootOf,
  workspaceIdentity,
  hasUnsafeUpstream,
} from '../../../.claude/hooks/lib/workspace-identity.mjs';

function git(args: string[], cwd: string) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

let tmp: string;
let canonical: string;
let worktree: string;
const ORIGINAL_ENV = process.env.CLAUDE_PROJECT_DIR;

beforeAll(() => {
  // realpath: macOS /var -> /private/var, and git reports the resolved path.
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'helm-wsid-')));
  canonical = join(tmp, 'canonical');
  worktree = join(tmp, 'worktrees', 'task-one');
  mkdirSync(canonical, { recursive: true });

  git(['init', '-q', '-b', 'main'], canonical);
  git(['config', 'user.email', 'test@example.com'], canonical);
  git(['config', 'user.name', 'Test'], canonical);
  writeFileSync(join(canonical, 'README.md'), '# canonical\n');
  git(['add', 'README.md'], canonical);
  git(['commit', '-qm', 'initial'], canonical);

  // A linked worktree on its own branch — the situation the bug appears in.
  mkdirSync(join(tmp, 'worktrees'), { recursive: true });
  git(['worktree', 'add', '-q', '-b', 'agent/task-one', worktree], canonical);

  // Make the two checkouts distinguishable: only the worktree is dirty.
  writeFileSync(join(worktree, 'scratch.txt'), 'uncommitted\n');
});

afterAll(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.CLAUDE_PROJECT_DIR;
  else process.env.CLAUDE_PROJECT_DIR = ORIGINAL_ENV;
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe('resolveActiveRoot', () => {
  it('returns the WORKTREE when CLAUDE_PROJECT_DIR points at the canonical checkout', () => {
    // The exact adversarial setup from the plan.
    process.env.CLAUDE_PROJECT_DIR = canonical;

    const root = resolveActiveRoot({ cwd: worktree });

    expect(root).toBe(worktree);
    // Stated as its own assertion: this is the line that fails under the old
    // precedence, where CLAUDE_PROJECT_DIR won.
    expect(root).not.toBe(canonical);
  });

  it('resolves a SUBDIRECTORY of the worktree to the worktree top-level', () => {
    process.env.CLAUDE_PROJECT_DIR = canonical;
    const sub = join(worktree, 'nested', 'deeper');
    mkdirSync(sub, { recursive: true });

    expect(resolveActiveRoot({ cwd: sub })).toBe(worktree);
  });

  it('falls back to CLAUDE_PROJECT_DIR when the payload carries no cwd', () => {
    process.env.CLAUDE_PROJECT_DIR = canonical;

    expect(resolveActiveRoot({})).toBe(canonical);
    expect(resolveActiveRoot(undefined)).toBe(canonical);
  });

  it('trusts an existing directory the caller named, even outside any repo', () => {
    // Existence wins; git resolution is a refinement, not a validity filter.
    //
    // This is load-bearing, not a curiosity. guard-concurrent-edit's fixture
    // is a plain mkdtemp directory with no git in it. When "not a work tree"
    // meant "skip this candidate", resolution fell through to process.cwd()
    // — the real helmv3 repo — and the guard looked for peer session ledgers
    // in the wrong tree, found none, and ALLOWED an edit it must BLOCK.
    process.env.CLAUDE_PROJECT_DIR = canonical;
    const plain = join(tmp, 'plain-dir');
    mkdirSync(plain, { recursive: true });

    expect(resolveActiveRoot({ cwd: plain })).toBe(plain);
  });

  it('skips a candidate that does not exist', () => {
    process.env.CLAUDE_PROJECT_DIR = canonical;

    expect(resolveActiveRoot({ cwd: join(tmp, 'does-not-exist') })).toBe(
      canonical,
    );
  });
});

describe('canonicalRootOf', () => {
  it('finds the canonical checkout from inside a linked worktree', () => {
    expect(canonicalRootOf(worktree)).toBe(canonical);
  });

  it('is identity for the canonical checkout itself', () => {
    expect(canonicalRootOf(canonical)).toBe(canonical);
  });
});

describe('workspaceIdentity', () => {
  it('reports the worktree branch and dirty state, not the canonical ones', () => {
    process.env.CLAUDE_PROJECT_DIR = canonical;

    const id = workspaceIdentity({ cwd: worktree });

    expect(id.root).toBe(worktree);
    expect(id.canonicalRoot).toBe(canonical);
    expect(id.kind).toBe('task');
    expect(id.branch).toBe('agent/task-one');
    // The canonical checkout is CLEAN; only the worktree is dirty. Under the
    // old precedence this read false.
    expect(id.dirty).toBe(true);
  });

  it('classifies the canonical checkout as kind=canonical and sees it clean', () => {
    process.env.CLAUDE_PROJECT_DIR = canonical;

    const id = workspaceIdentity({ cwd: canonical });

    expect(id.kind).toBe('canonical');
    expect(id.branch).toBe('main');
    expect(id.dirty).toBe(false);
  });

  it('never throws outside a git repository', () => {
    const outside = join(tmp, 'not-a-repo');
    mkdirSync(outside, { recursive: true });
    delete process.env.CLAUDE_PROJECT_DIR;

    expect(() => workspaceIdentity({ cwd: outside })).not.toThrow();
  });
});

describe('hasUnsafeUpstream', () => {
  it('flags a task branch tracking origin/main', () => {
    expect(
      hasUnsafeUpstream({ branch: 'agent/task-one', upstream: 'origin/main' }),
    ).toBe(true);
  });

  it('does not flag main tracking origin/main', () => {
    expect(hasUnsafeUpstream({ branch: 'main', upstream: 'origin/main' })).toBe(
      false,
    );
  });

  it('does not flag a branch with no upstream, which is the desired state', () => {
    expect(hasUnsafeUpstream({ branch: 'agent/task-one', upstream: null })).toBe(
      false,
    );
  });

  it('does not flag a task branch tracking its own remote counterpart', () => {
    expect(
      hasUnsafeUpstream({
        branch: 'agent/task-one',
        upstream: 'origin/agent/task-one',
      }),
    ).toBe(false);
  });
});
