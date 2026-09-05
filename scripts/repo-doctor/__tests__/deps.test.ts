import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Status } from '../result.mjs';
import { diffLockfiles, run as depsRun } from '../checks/deps.mjs';

function lockfile(packages: Record<string, { version: string }>) {
  return JSON.stringify({
    name: 'fixture',
    version: '0.0.0',
    lockfileVersion: 3,
    requires: true,
    packages,
  });
}

describe('diffLockfiles', () => {
  it('reports nothing when both maps agree', () => {
    const both = { 'node_modules/left-pad': { version: '1.3.0' } };
    expect(diffLockfiles({ packages: both }, { packages: both })).toEqual({
      missing: [],
      extra: [],
      versionMismatch: [],
    });
  });

  it('flags a package declared in package-lock.json but not installed', () => {
    const d = diffLockfiles(
      { packages: { 'node_modules/left-pad': { version: '1.3.0' } } },
      { packages: {} },
    );
    expect(d.missing).toEqual(['node_modules/left-pad']);
    expect(d.extra).toEqual([]);
    expect(d.versionMismatch).toEqual([]);
  });

  it('flags a package installed but not declared', () => {
    const d = diffLockfiles(
      { packages: {} },
      { packages: { 'node_modules/left-pad': { version: '1.3.0' } } },
    );
    expect(d.extra).toEqual(['node_modules/left-pad']);
    expect(d.missing).toEqual([]);
    expect(d.versionMismatch).toEqual([]);
  });

  it('flags a version mismatch between declared and installed', () => {
    const d = diffLockfiles(
      { packages: { 'node_modules/left-pad': { version: '1.3.0' } } },
      { packages: { 'node_modules/left-pad': { version: '1.2.0' } } },
    );
    expect(d.versionMismatch).toEqual([
      { path: 'node_modules/left-pad', declared: '1.3.0', installed: '1.2.0' },
    ]);
    expect(d.missing).toEqual([]);
    expect(d.extra).toEqual([]);
  });

  it('treats an absent packages map as empty rather than throwing', () => {
    expect(() => diffLockfiles({}, {})).not.toThrow();
    expect(diffLockfiles({}, {})).toEqual({ missing: [], extra: [], versionMismatch: [] });
  });
});

describe('deps.lockfile-drift — end to end against disposable fixtures', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'a-deps-repo-'));
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('PASSes when package-lock.json and node_modules/.package-lock.json agree', async () => {
    const packages = {
      'node_modules/left-pad': { version: '1.3.0' },
      'node_modules/lodash': { version: '4.17.21' },
    };
    writeFileSync(join(repo, 'package-lock.json'), lockfile(packages));
    mkdirSync(join(repo, 'node_modules'), { recursive: true });
    writeFileSync(join(repo, 'node_modules', '.package-lock.json'), lockfile(packages));

    const results = await depsRun({ repoRoot: repo });
    const r = results.find((x) => x.id === 'deps.lockfile-drift');
    expect(r?.status).toBe(Status.PASS);
  });

  it('DRIFTs when a fixture copy of package-lock.json disagrees with node_modules/.package-lock.json', async () => {
    // Seed the drift explicitly and only in a throwaway fixture directory —
    // never against the real repo lockfile or the real node_modules.
    writeFileSync(
      join(repo, 'package-lock.json'),
      lockfile({ 'node_modules/left-pad': { version: '1.3.0' } }),
    );
    mkdirSync(join(repo, 'node_modules'), { recursive: true });
    writeFileSync(
      join(repo, 'node_modules', '.package-lock.json'),
      lockfile({ 'node_modules/left-pad': { version: '1.2.0' } }),
    );

    const results = await depsRun({ repoRoot: repo });
    const r = results.find((x) => x.id === 'deps.lockfile-drift');
    expect(r?.status).toBe(Status.DRIFT);
    expect(r?.versionMismatchCount).toBe(1);
    expect(r?.remediation).toBe('npm ci');
  });

  it('DRIFTs when node_modules has a package package-lock.json does not declare', async () => {
    writeFileSync(join(repo, 'package-lock.json'), lockfile({}));
    mkdirSync(join(repo, 'node_modules'), { recursive: true });
    writeFileSync(
      join(repo, 'node_modules', '.package-lock.json'),
      lockfile({ 'node_modules/stray-dep': { version: '9.9.9' } }),
    );

    const results = await depsRun({ repoRoot: repo });
    const r = results.find((x) => x.id === 'deps.lockfile-drift');
    expect(r?.status).toBe(Status.DRIFT);
    expect(r?.extraCount).toBe(1);
  });

  it('reports UNKNOWN, not FAIL, when nothing has been installed yet', async () => {
    writeFileSync(join(repo, 'package-lock.json'), lockfile({}));
    // No node_modules directory at all — a fresh clone / uninstalled worktree.

    const results = await depsRun({ repoRoot: repo });
    const r = results.find((x) => x.id === 'deps.lockfile-drift');
    expect(r?.status).toBe(Status.UNKNOWN);
  });

  it('FAILs when package-lock.json itself is missing', async () => {
    mkdirSync(join(repo, 'node_modules'), { recursive: true });
    writeFileSync(join(repo, 'node_modules', '.package-lock.json'), lockfile({}));

    const results = await depsRun({ repoRoot: repo });
    const r = results.find((x) => x.id === 'deps.lockfile-drift');
    expect(r?.status).toBe(Status.FAIL);
  });

  it('is BLOCKED (fails closed), never silently green, on unparsable JSON', async () => {
    writeFileSync(join(repo, 'package-lock.json'), '{ not json');
    mkdirSync(join(repo, 'node_modules'), { recursive: true });
    writeFileSync(join(repo, 'node_modules', '.package-lock.json'), lockfile({}));

    const results = await depsRun({ repoRoot: repo });
    const r = results.find((x) => x.id === 'deps.lockfile-drift');
    expect(r?.status).toBe(Status.BLOCKED);
  });
});
