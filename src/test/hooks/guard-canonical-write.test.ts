// Regression tests for .claude/hooks/guard-canonical-write.mjs
//
// The four cases the spec requires, against a REAL repo with a REAL linked
// worktree — not a mocked path pair, because the whole guard is "ask git where
// the canonical checkout is", and a mock would assert my assumption rather
// than git's answer.
//
// Test 3 is the one that matters most: it reproduces the bug class where the
// session is physically editing a worktree while a hook inspects the original
// checkout. It fails if resolution ever goes back to preferring
// CLAUDE_PROJECT_DIR.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK = resolve(__dirname, '../../../.claude/hooks/guard-canonical-write.mjs');

function git(args: string[], cwd: string) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** Run the guard exactly as Claude Code would: JSON on stdin. */
function runGuard(opts: {
  cwd: string;
  filePath: string;
  projectDir?: string;
  tool?: string;
}): { verdict: 'ALLOW' | 'BLOCK'; stderr: string } {
  const env = { ...process.env };
  if (opts.projectDir === undefined) delete env.CLAUDE_PROJECT_DIR;
  else env.CLAUDE_PROJECT_DIR = opts.projectDir;

  try {
    execFileSync('node', [HOOK], {
      input: JSON.stringify({
        session_id: 'test-session',
        cwd: opts.cwd,
        tool_name: opts.tool ?? 'Write',
        tool_input: { file_path: opts.filePath },
      }),
      env,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { verdict: 'ALLOW', stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stderr?: string };
    return {
      verdict: e.status === 2 ? 'BLOCK' : 'ALLOW',
      stderr: String(e.stderr ?? ''),
    };
  }
}

let tmp: string;
let canonical: string;
let worktree: string;

beforeAll(() => {
  // realpath: on macOS tmpdir() is /var/..., git reports /private/var/...
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'helm-canon-')));
  canonical = join(tmp, 'helmv3');
  worktree = join(tmp, 'worktrees', 'task-one');
  mkdirSync(canonical, { recursive: true });

  git(['init', '-q', '-b', 'main'], canonical);
  git(['config', 'user.email', 'test@example.com'], canonical);
  git(['config', 'user.name', 'Test'], canonical);
  mkdirSync(join(canonical, 'src'), { recursive: true });
  writeFileSync(join(canonical, 'src/app.ts'), 'export const x = 1;\n');
  git(['add', '-A'], canonical);
  git(['commit', '-qm', 'initial'], canonical);

  mkdirSync(join(tmp, 'worktrees'), { recursive: true });
  git(['worktree', 'add', '-q', '--no-track', '-b', 'agent/task-one', worktree], canonical);
});

afterAll(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe('guard-canonical-write — Test 1: canonical checkout blocks writes', () => {
  it('BLOCKS a Write inside the canonical checkout', () => {
    const r = runGuard({ cwd: canonical, filePath: join(canonical, 'src/app.ts') });
    expect(r.verdict).toBe('BLOCK');
  });

  it('names the canonical path and points at the workspace script', () => {
    const r = runGuard({ cwd: canonical, filePath: join(canonical, 'src/app.ts') });
    expect(r.stderr).toContain(canonical);
    expect(r.stderr).toContain('new-worktree.sh');
  });

  it('BLOCKS Edit and MultiEdit the same way', () => {
    for (const tool of ['Edit', 'MultiEdit']) {
      const r = runGuard({
        cwd: canonical,
        filePath: join(canonical, 'src/app.ts'),
        tool,
      });
      expect(r.verdict, tool).toBe('BLOCK');
    }
  });
});

describe('guard-canonical-write — Test 2: external task worktree allows writes', () => {
  it('ALLOWS a Write inside the linked worktree', () => {
    const r = runGuard({ cwd: worktree, filePath: join(worktree, 'src/app.ts') });
    expect(r.verdict).toBe('ALLOW');
  });
});

describe('guard-canonical-write — Test 3: worktree cwd overrides CLAUDE_PROJECT_DIR', () => {
  it('ALLOWS a worktree write while CLAUDE_PROJECT_DIR points at canonical', () => {
    // The bug class this exists to close: physically editing worktree B while
    // the hook inspects checkout A.
    const r = runGuard({
      cwd: worktree,
      filePath: join(worktree, 'src/app.ts'),
      projectDir: canonical,
    });
    expect(r.verdict).toBe('ALLOW');
  });

  it('resolves a RELATIVE path against the worktree, not CLAUDE_PROJECT_DIR', () => {
    const r = runGuard({
      cwd: worktree,
      filePath: 'src/app.ts',
      projectDir: canonical,
    });
    expect(r.verdict).toBe('ALLOW');
  });
});

describe('guard-canonical-write — Test 4: canonical cwd remains blocked', () => {
  it('BLOCKS when both cwd and CLAUDE_PROJECT_DIR are canonical', () => {
    const r = runGuard({
      cwd: canonical,
      filePath: join(canonical, 'src/app.ts'),
      projectDir: canonical,
    });
    expect(r.verdict).toBe('BLOCK');
  });

  it('BLOCKS a relative path resolved against the canonical checkout', () => {
    const r = runGuard({
      cwd: canonical,
      filePath: 'src/app.ts',
      projectDir: canonical,
    });
    expect(r.verdict).toBe('BLOCK');
  });
});

describe('guard-canonical-write — scope', () => {
  it('BLOCKS an ABSOLUTE canonical path even while sitting in a worktree', () => {
    // The invariant is about the FILE, not the session. A worktree session
    // reaching into the canonical checkout is the mutation this prevents.
    const r = runGuard({
      cwd: worktree,
      filePath: join(canonical, 'src/app.ts'),
      projectDir: canonical,
    });
    expect(r.verdict).toBe('BLOCK');
  });

  it('ALLOWS a path outside the repository entirely', () => {
    const r = runGuard({ cwd: worktree, filePath: join(tmp, 'scratch.txt') });
    expect(r.verdict).toBe('ALLOW');
  });

  it('ALLOWS a payload with no file_path rather than guessing', () => {
    const r = runGuard({ cwd: canonical, filePath: '' });
    expect(r.verdict).toBe('ALLOW');
  });

  it('does not consult branch names, features, or file contents', () => {
    // Same file, same tree, two very different branch/name shapes: identical
    // verdict. This is the anti-heuristic assertion.
    const a = runGuard({ cwd: worktree, filePath: join(worktree, 'src/app.ts') });
    const b = runGuard({
      cwd: worktree,
      filePath: join(worktree, 'supabase/migrations/0001_drop_everything.sql'),
    });
    expect(a.verdict).toBe('ALLOW');
    expect(b.verdict).toBe('ALLOW');
  });
});
