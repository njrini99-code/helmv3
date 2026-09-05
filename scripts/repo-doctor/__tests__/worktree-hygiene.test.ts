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
});
