import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Status } from '../result.mjs';
import { run as worktreeRun } from '../checks/worktree-hygiene.mjs';

/**
 * repo:doctor's worktree-hygiene module owns two checks: canonical drift
 * (off main, no open PR) and oversized .next caches. It used to own a third
 * — "every worktree carries .helm/workspace.json" — built 2026-09-05 and
 * deleted the same day, in the same change, once merging origin/main
 * revealed checks/workspace.mjs (#1840/A1) already implements the identical
 * check as `workspace.worktree-markers`. See worktree-hygiene.mjs's own
 * header for the full account; that check's tests now live in
 * workspace.mjs's own test coverage, not here — this file does not
 * duplicate them.
 */

function makeFakeGh(dir: string, script: string) {
  const p = join(dir, 'gh');
  writeFileSync(p, `#!/bin/sh\n${script}\n`);
  chmodSync(p, 0o755);
  return dir;
}

describe('worktree.canonical-off-main / worktree.oversized-next — against a disposable repo', () => {
  let base: string;
  let home: string;
  let originalPath: string | undefined;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'a6-wt-canon-'));
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: base });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: base });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: base });
    writeFileSync(join(base, 'f.txt'), 'x');
    execFileSync('git', ['add', 'f.txt'], { cwd: base });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: base });
    home = mkdtempSync(join(tmpdir(), 'a6-wt-home-'));
    originalPath = process.env.PATH;
  });
  afterEach(() => {
    process.env.PATH = originalPath;
    rmSync(base, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  it('PASSes canonical-off-main when the checkout is on main', async () => {
    const results = await worktreeRun({ repoRoot: base, homeDir: home });
    expect(results.find((r) => r.id === 'worktree.canonical-off-main')?.status).toBe(Status.PASS);
  });

  it('WARNs canonical-off-main when off main with no open PR (gh reachable)', async () => {
    execFileSync('git', ['checkout', '-q', '-b', 'some-task'], { cwd: base });
    const binDir = mkdtempSync(join(tmpdir(), 'a6-wt-bin-'));
    makeFakeGh(binDir, 'echo 0');
    process.env.PATH = `${binDir}:${originalPath}`;
    const results = await worktreeRun({ repoRoot: base, homeDir: home });
    expect(results.find((r) => r.id === 'worktree.canonical-off-main')?.status).toBe(Status.WARN);
  });

  it('PASSes canonical-off-main when off main WITH an open PR (gh reachable)', async () => {
    execFileSync('git', ['checkout', '-q', '-b', 'some-task'], { cwd: base });
    const binDir = mkdtempSync(join(tmpdir(), 'a6-wt-bin-'));
    makeFakeGh(binDir, 'echo 1');
    process.env.PATH = `${binDir}:${originalPath}`;
    const results = await worktreeRun({ repoRoot: base, homeDir: home });
    expect(results.find((r) => r.id === 'worktree.canonical-off-main')?.status).toBe(Status.PASS);
  });

  it('degrades canonical-off-main to LOCAL_ONLY (never FAIL/UNKNOWN) when gh cannot run', async () => {
    execFileSync('git', ['checkout', '-q', '-b', 'some-task'], { cwd: base });
    // /usr/bin keeps git resolvable (Xcode CLT git, separate from Homebrew's
    // git+gh, which both live in /opt/homebrew/bin) while `gh` is nowhere on
    // this PATH at all — isolates "gh specifically is unreachable" from
    // "nothing is reachable", which a blanket PATH='' would conflate (the
    // git call this check ALSO makes would fail first and mask the case
    // this test exists to prove).
    process.env.PATH = '/usr/bin:/bin';
    const results = await worktreeRun({ repoRoot: base, homeDir: home });
    const r = results.find((x) => x.id === 'worktree.canonical-off-main');
    expect(r?.status).toBe(Status.LOCAL_ONLY);
  });

  it('PASSes oversized-next when no .next directory exists anywhere', async () => {
    const results = await worktreeRun({ repoRoot: base, homeDir: home });
    expect(results.find((r) => r.id === 'worktree.oversized-next')?.status).toBe(Status.PASS);
  });

  it('does not flag a small .next directory', async () => {
    mkdirSync(join(base, '.next'), { recursive: true });
    writeFileSync(join(base, '.next', 'small.bin'), Buffer.alloc(1024));
    const results = await worktreeRun({ repoRoot: base, homeDir: home });
    expect(results.find((r) => r.id === 'worktree.oversized-next')?.status).toBe(Status.PASS);
  });

  it('PASSes branch-count and budget-exceeded on a fresh single-branch, single-worktree repo', async () => {
    const results = await worktreeRun({ repoRoot: base, homeDir: home });
    expect(results.find((r) => r.id === 'worktree.branch-count')?.status).toBe(Status.PASS);
    expect(results.find((r) => r.id === 'worktree.budget-exceeded')?.status).toBe(Status.PASS);
  });

  it('FAILs branch-count once local branches exceed the 25-branch ceiling', async () => {
    for (let i = 0; i < 26; i += 1) {
      execFileSync('git', ['branch', `spare-${i}`], { cwd: base });
    }
    const results = await worktreeRun({ repoRoot: base, homeDir: home });
    const r = results.find((x) => x.id === 'worktree.branch-count');
    expect(r?.status).toBe(Status.FAIL);
    expect(r?.count).toBeGreaterThan(25);
  });

  it('FAILs budget-exceeded once mutation worktrees exceed budget+1', async () => {
    const wtHome = mkdtempSync(join(tmpdir(), 'a6-wt-mut-'));
    const prevBudget = process.env.HELM_MAX_MUTATION_WORKTREES;
    process.env.HELM_MAX_MUTATION_WORKTREES = '1';
    try {
      // budget 1 + ceiling 1 = 2; three task worktrees, each carrying a
      // .helm/workspace.json (declared kind 'task'), exceed it.
      for (let i = 0; i < 3; i += 1) {
        const wtPath = join(wtHome, `task-${i}`);
        execFileSync('git', ['worktree', 'add', '--no-track', '-b', `agent/task-${i}`, wtPath, 'main'], { cwd: base });
        mkdirSync(join(wtPath, '.helm'), { recursive: true });
        writeFileSync(join(wtPath, '.helm', 'workspace.json'), JSON.stringify({ kind: 'task', parkPolicy: 'PARK_IF_REPRODUCIBLE' }));
      }
      const results = await worktreeRun({ repoRoot: base, homeDir: home });
      const r = results.find((x) => x.id === 'worktree.budget-exceeded');
      expect(r?.status).toBe(Status.FAIL);
      expect(r?.used).toBeGreaterThan(r?.ceiling as number);
    } finally {
      if (prevBudget === undefined) delete process.env.HELM_MAX_MUTATION_WORKTREES;
      else process.env.HELM_MAX_MUTATION_WORKTREES = prevBudget;
      execFileSync('git', ['worktree', 'prune'], { cwd: base });
      rmSync(wtHome, { recursive: true, force: true });
    }
  });

  it('FAILs stale-merged-pr for a worktree whose branch PR merged over 24h ago', async () => {
    const wtHome = mkdtempSync(join(tmpdir(), 'a6-wt-stale-'));
    const wtPath = join(wtHome, 'landed');
    execFileSync('git', ['worktree', 'add', '--no-track', '-b', 'agent/landed', wtPath, 'main'], { cwd: base });
    const binDir = mkdtempSync(join(tmpdir(), 'a6-wt-bin-'));
    const oldMergedAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    makeFakeGh(
      binDir,
      `case "$*" in\n` +
        `  *"--json number,state,mergedAt"*) echo '[{"number":1863,"state":"MERGED","mergedAt":"${oldMergedAt}"}]' ;;\n` +
        `  *) echo 0 ;;\n` +
        `esac`,
    );
    process.env.PATH = `${binDir}:${originalPath}`;
    try {
      const results = await worktreeRun({ repoRoot: base, homeDir: home });
      const r = results.find((x) => x.id === 'worktree.stale-merged-pr');
      expect(r?.status).toBe(Status.FAIL);
    } finally {
      execFileSync('git', ['worktree', 'remove', '--force', wtPath], { cwd: base });
      rmSync(wtHome, { recursive: true, force: true });
    }
  });

  it('PASSes stale-merged-pr for a worktree whose branch PR merged under 24h ago', async () => {
    const wtHome = mkdtempSync(join(tmpdir(), 'a6-wt-fresh-'));
    const wtPath = join(wtHome, 'fresh');
    execFileSync('git', ['worktree', 'add', '--no-track', '-b', 'agent/fresh', wtPath, 'main'], { cwd: base });
    const binDir = mkdtempSync(join(tmpdir(), 'a6-wt-bin-'));
    const recentMergedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    makeFakeGh(
      binDir,
      `case "$*" in\n` +
        `  *"--json number,state,mergedAt"*) echo '[{"number":1900,"state":"MERGED","mergedAt":"${recentMergedAt}"}]' ;;\n` +
        `  *) echo 0 ;;\n` +
        `esac`,
    );
    process.env.PATH = `${binDir}:${originalPath}`;
    try {
      const results = await worktreeRun({ repoRoot: base, homeDir: home });
      const r = results.find((x) => x.id === 'worktree.stale-merged-pr');
      expect(r?.status).toBe(Status.PASS);
    } finally {
      execFileSync('git', ['worktree', 'remove', '--force', wtPath], { cwd: base });
      rmSync(wtHome, { recursive: true, force: true });
    }
  });
});
