import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Status } from '../result.mjs';
import { untrackedDirsInScope, mangleProjectPath, run as diskRun } from '../checks/disk-hygiene.mjs';

describe('untrackedDirsInScope', () => {
  it('picks a top-level untracked directory', () => {
    expect(untrackedDirsInScope('?? scratch-export/\n')).toEqual(['scratch-export']);
  });
  it('picks an untracked directory nested under docs/', () => {
    expect(untrackedDirsInScope('?? docs/qa/new-audit/\n')).toEqual(['docs/qa/new-audit']);
  });
  it('ignores an untracked directory nested under something other than docs/', () => {
    expect(untrackedDirsInScope('?? src/some-new-dir/\n')).toEqual([]);
  });
  it('ignores untracked FILES (no trailing slash)', () => {
    expect(untrackedDirsInScope('?? loose-file.txt\n')).toEqual([]);
  });
  it('ignores modified/staged entries (not "??")', () => {
    expect(untrackedDirsInScope(' M src/x.ts\nA  docs/y.md\n')).toEqual([]);
  });
});

describe('mangleProjectPath', () => {
  it('replaces every path separator with a hyphen', () => {
    expect(mangleProjectPath('/Users/ricknini/Downloads/helmv3')).toBe('-Users-ricknini-Downloads-helmv3');
  });
});

describe('disk hygiene checks — end to end against disposable fixtures', () => {
  let repo: string;
  let home: string;
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'a6-disk-repo-'));
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo });
    writeFileSync(join(repo, 'f.txt'), 'x');
    execFileSync('git', ['add', 'f.txt'], { cwd: repo });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo });
    home = mkdtempSync(join(tmpdir(), 'a6-disk-home-'));
  });
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  it('disk.untracked-bloat PASSes on a clean tree', async () => {
    const results = await diskRun({ repoRoot: repo, homeDir: home });
    expect(results.find((r) => r.id === 'disk.untracked-bloat')?.status).toBe(Status.PASS);
  });

  it('disk.untracked-bloat WARNs on an untracked directory over 50 MB at the repo root', async () => {
    const big = join(repo, 'scratch-export');
    mkdirSync(big);
    // One 60 MB file is enough to cross the 50 MB threshold without writing
    // millions of tiny files.
    writeFileSync(join(big, 'blob.bin'), Buffer.alloc(60 * 1024 * 1024));
    const results = await diskRun({ repoRoot: repo, homeDir: home });
    const r = results.find((x) => x.id === 'disk.untracked-bloat');
    expect(r?.status).toBe(Status.WARN);
    expect(r?.evidence).toEqual([expect.objectContaining({ path: 'scratch-export' })]);
  });

  it('disk.untracked-bloat does not flag an untracked dir under 50 MB', async () => {
    const small = join(repo, 'small-scratch');
    mkdirSync(small);
    writeFileSync(join(small, 'blob.bin'), Buffer.alloc(1024));
    const results = await diskRun({ repoRoot: repo, homeDir: home });
    expect(results.find((r) => r.id === 'disk.untracked-bloat')?.status).toBe(Status.PASS);
  });

  it('disk.auto-memory-dir PASSes when no store exists', async () => {
    const results = await diskRun({ repoRoot: repo, homeDir: home });
    expect(results.find((r) => r.id === 'disk.auto-memory-dir')?.status).toBe(Status.PASS);
  });

  it('disk.auto-memory-dir WARNs when the harness auto-memory directory exists for this project', async () => {
    const mangled = mangleProjectPath(repo);
    const memDir = join(home, '.claude', 'projects', mangled, 'memory');
    mkdirSync(memDir, { recursive: true });
    const results = await diskRun({ repoRoot: repo, homeDir: home });
    const r = results.find((x) => x.id === 'disk.auto-memory-dir');
    expect(r?.status).toBe(Status.WARN);
    expect(r?.actual).toBe(memDir);
  });
});
