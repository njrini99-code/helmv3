import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Status } from '../result.mjs';
import { parseWorktreeList, isHarnessWorktree, run as worktreeRun } from '../checks/worktree-hygiene.mjs';

/**
 * repo:doctor's worktree-hygiene checks exist to catch exactly the incident
 * class autonomy.md and AGENTS.md record: a worktree made outside
 * scripts/new-worktree.sh that the lifecycle tool can never classify. These
 * pin the parser, the harness exemption (which must hold or this check is
 * permanently red on every machine running Claude Code's own worktree
 * isolation), and one real end-to-end FAIL against a disposable git repo.
 */

describe('parseWorktreeList', () => {
  it('extracts worktree paths from porcelain output', () => {
    const porcelain = 'worktree /a/b\nHEAD abc\nbranch refs/heads/main\n\nworktree /a/c\nHEAD def\n';
    expect(parseWorktreeList(porcelain)).toEqual(['/a/b', '/a/c']);
  });
  it('returns an empty array for empty input', () => {
    expect(parseWorktreeList('')).toEqual([]);
  });
});

describe('isHarnessWorktree', () => {
  const canonical = '/Users/x/Downloads/helmv3';
  it('exempts a path under .claude/worktrees/ — the harness never writes a marker there', () => {
    expect(isHarnessWorktree(`${canonical}/.claude/worktrees/agent-abc123`, canonical)).toBe(true);
  });
  it('does not exempt a worktree under ~/worktrees/helmv3/ (the supported creator writes a marker there)', () => {
    expect(isHarnessWorktree('/Users/x/worktrees/helmv3/some-task', canonical)).toBe(false);
  });
  it('does not exempt the canonical checkout itself (handled separately by the caller)', () => {
    expect(isHarnessWorktree(canonical, canonical)).toBe(false);
  });
});

describe('worktree.unmarked-worktree — end to end against a disposable repo', () => {
  let base: string;
  let extra: string;
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'a6-wt-base-'));
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: base });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: base });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: base });
    writeFileSync(join(base, 'f.txt'), 'x');
    execFileSync('git', ['add', 'f.txt'], { cwd: base });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: base });
  });
  afterEach(() => {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', extra], { cwd: base });
    } catch {
      /* already removed by the test */
    }
    rmSync(base, { recursive: true, force: true });
    rmSync(extra, { recursive: true, force: true });
  });

  it('FAILs when a linked worktree has no .helm/workspace.json', async () => {
    extra = mkdtempSync(join(tmpdir(), 'a6-wt-extra-')) + '-wt';
    execFileSync('git', ['worktree', 'add', '--detach', extra, 'HEAD'], { cwd: base });
    const results = await worktreeRun({ repoRoot: base, homeDir: mkdtempSync(join(tmpdir(), 'a6-home-')) });
    const r = results.find((x) => x.id === 'worktree.unmarked-worktree');
    expect(r?.status).toBe(Status.FAIL);
    // Compare realpaths: macOS resolves tmpdir()'s /var -> /private/var, and
    // `git worktree list` reports its own resolved spelling — the same
    // mismatch the check itself normalises for (see worktree-hygiene.mjs's
    // realpathOrSelf comment).
    expect(r?.evidence).toContain(realpathSync(extra));
  });

  it('PASSes when the linked worktree carries the marker', async () => {
    extra = mkdtempSync(join(tmpdir(), 'a6-wt-extra-')) + '-wt';
    execFileSync('git', ['worktree', 'add', '--detach', extra, 'HEAD'], { cwd: base });
    mkdirSync(join(extra, '.helm'), { recursive: true });
    writeFileSync(join(extra, '.helm', 'workspace.json'), JSON.stringify({ kind: 'task', parkPolicy: 'KEEP' }));
    const results = await worktreeRun({ repoRoot: base, homeDir: mkdtempSync(join(tmpdir(), 'a6-home-')) });
    const r = results.find((x) => x.id === 'worktree.unmarked-worktree');
    expect(r?.status).toBe(Status.PASS);
  });
});
