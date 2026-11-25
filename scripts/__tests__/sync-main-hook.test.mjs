// Fixture tests for .githooks/sync-main.sh: a disposable origin, a "canonical"
// clone and a task worktree. The helper runs inline (HELM_MAIN_SYNC_FOREGROUND).
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HELPER = resolve(process.cwd(), '.githooks/sync-main.sh');
const tempDirs = [];

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop(), { recursive: true, force: true });
});

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

function identity(dir) {
  git(['config', 'user.email', 'test@example.com'], dir);
  git(['config', 'user.name', 'Test'], dir);
  git(['config', 'commit.gpgsign', 'false'], dir);
}

function commit(dir, file, text) {
  writeFileSync(join(dir, file), text);
  git(['add', file], dir);
  git(['commit', '--quiet', '-m', file], dir);
  return git(['rev-parse', 'HEAD'], dir);
}

/** origin (bare) ← canonical clone on main; a second clone pushes "someone else's merge". */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sync-main-'));
  tempDirs.push(root);
  const origin = join(root, 'origin.git');
  git(['init', '--quiet', '--bare', '--initial-branch=main', origin], root);
  const canon = join(root, 'canon');
  git(['clone', '--quiet', origin, canon], root);
  identity(canon);
  git(['switch', '--quiet', '-c', 'main'], canon);
  commit(canon, 'README.md', 'base\n');
  git(['push', '--quiet', '-u', 'origin', 'main'], canon);
  const other = join(root, 'other');
  git(['clone', '--quiet', origin, other], root);
  identity(other);
  const advance = () => {
    const sha = commit(other, `f${Date.now()}${Math.random()}.txt`, 'x\n');
    git(['push', '--quiet', 'origin', 'main'], other);
    return sha;
  };
  return { root, canon, advance };
}

function runHelper(cwd, env = {}) {
  execFileSync('sh', [HELPER], { cwd, env: { ...process.env, HELM_MAIN_SYNC_FOREGROUND: '1', ...env } });
}

describe('sync-main.sh', () => {
  it('fast-forwards canonical main when it is clean, run from a task worktree', () => {
    const { root, canon, advance } = fixture();
    const wt = join(root, 'wt');
    git(['worktree', 'add', '--quiet', '-b', 'agent/x', wt], canon);
    const head = advance();
    runHelper(wt);
    expect(git(['rev-parse', 'main'], canon)).toBe(head);
    expect(git(['status', '--porcelain'], canon)).toBe('');
  });

  it('leaves canonical alone when it has tracked changes', () => {
    const { canon, advance } = fixture();
    const before = git(['rev-parse', 'main'], canon);
    writeFileSync(join(canon, 'README.md'), 'edited by a session\n');
    advance();
    runHelper(canon);
    expect(git(['rev-parse', 'main'], canon)).toBe(before);
    expect(git(['diff', '--name-only'], canon)).toBe('README.md');
  });

  it('keeps going past untracked files', () => {
    const { canon, advance } = fixture();
    writeFileSync(join(canon, 'notes.md'), 'scratch\n');
    const head = advance();
    runHelper(canon);
    expect(git(['rev-parse', 'main'], canon)).toBe(head);
  });

  it('moves only the main ref when canonical sits on another branch', () => {
    const { canon, advance } = fixture();
    git(['switch', '--quiet', '-c', 'agent/y'], canon);
    const branchHead = git(['rev-parse', 'HEAD'], canon);
    const head = advance();
    runHelper(canon);
    expect(git(['rev-parse', 'main'], canon)).toBe(head);
    expect(git(['rev-parse', 'HEAD'], canon)).toBe(branchHead);
  });

  it('never rewrites a local main that has diverged', () => {
    const { canon, advance } = fixture();
    const local = commit(canon, 'local.txt', 'unpushed\n');
    advance();
    runHelper(canon);
    expect(git(['rev-parse', 'main'], canon)).toBe(local);
  });

  it('does nothing when HELM_NO_MAIN_SYNC=1', () => {
    const { canon, advance } = fixture();
    const before = git(['rev-parse', 'main'], canon);
    advance();
    runHelper(canon, { HELM_NO_MAIN_SYNC: '1' });
    expect(git(['rev-parse', 'main'], canon)).toBe(before);
  });
});
