// Unit tests for scripts/lib/deps-store.mjs: node_modules for every checkout as a
// copy-on-write clone of a store entry keyed by the lockfile.
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cloneDir,
  COMPLETE,
  depsKey,
  depsPlan,
  dirMatchesLock,
  gcPlan,
  installMatchesLock,
  MARKER,
  nodeModulesKind,
  placeClone,
  readMarker,
  seedStore,
  storeHit,
  writeMarker,
} from '../lib/deps-store.mjs';

const copy = (src: string, dest: string) => {
  cpSync(src, dest, { recursive: true, verbatimSymlinks: true });
  return { ok: true };
};

let tmp: string;
beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'deps-store-')));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

function fakeTree(dir: string, version = '1.0.0') {
  mkdirSync(join(dir, 'node_modules/a/bin'), { recursive: true });
  writeFileSync(join(dir, 'node_modules/a/package.json'), JSON.stringify({ name: 'a', version }));
  writeFileSync(join(dir, 'node_modules/a/bin/a.js'), 'console.log(1)\n');
  mkdirSync(join(dir, 'node_modules/.bin'), { recursive: true });
  symlinkSync('../a/bin/a.js', join(dir, 'node_modules/.bin/a'));
}

describe('depsKey', () => {
  const base = { lockText: '{"lockfileVersion":3}', abi: '137', platform: 'darwin', arch: 'arm64' };
  it('is stable for the same inputs', () => {
    expect(depsKey(base)).toBe(depsKey({ ...base }));
    expect(depsKey(base)).toMatch(/^[0-9a-f]{16}$/);
  });
  it('changes with the lockfile, the Node ABI, the platform and the arch', () => {
    const k = depsKey(base);
    expect(depsKey({ ...base, lockText: '{"lockfileVersion":3,"x":1}' })).not.toBe(k);
    expect(depsKey({ ...base, abi: '127' })).not.toBe(k);
    expect(depsKey({ ...base, platform: 'linux' })).not.toBe(k);
    expect(depsKey({ ...base, arch: 'x64' })).not.toBe(k);
  });
});

describe('installMatchesLock', () => {
  const lock = {
    packages: {
      '': { name: 'root' },
      'node_modules/a': { version: '1.0.0' },
      'node_modules/b': { version: '2.0.0', dev: true },
      'node_modules/@esbuild/linux-x64': { version: '0.27.0', optional: true },
    },
  };
  it('matches when every pinned package is installed at its version (optional ones may be absent)', () => {
    const hidden = { packages: { 'node_modules/a': { version: '1.0.0' }, 'node_modules/b': { version: '2.0.0' } } };
    expect(installMatchesLock(lock, hidden)).toEqual({ ok: true, mismatches: [] });
  });
  it('fails on a version difference and on a missing required package', () => {
    const hidden = { packages: { 'node_modules/a': { version: '0.9.0' } } };
    const r = installMatchesLock(lock, hidden);
    expect(r.ok).toBe(false);
    expect(r.mismatches).toEqual(['node_modules/a 0.9.0 != 1.0.0', 'missing node_modules/b']);
  });
  it('fails closed on unreadable input', () => {
    expect(installMatchesLock(null, {}).ok).toBe(false);
  });
});

describe('dirMatchesLock reads the installed package.json files, not only the install record', () => {
  const lock = { lockfileVersion: 3, packages: { '': {}, 'node_modules/a': { version: '1.0.0' } } };
  function checkout(installed: string) {
    const dir = join(tmp, `c-${installed}`);
    mkdirSync(join(dir, 'node_modules/a'), { recursive: true });
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify(lock));
    // The install record claims what the lockfile pins (2026-11-15: a write through a
    // symlink rewrote this file to list versions that were not installed).
    writeFileSync(join(dir, 'node_modules/.package-lock.json'), JSON.stringify(lock));
    writeFileSync(join(dir, 'node_modules/a/package.json'), JSON.stringify({ name: 'a', version: installed }));
    return dir;
  }
  it('matches when the record and the installed files agree', () => {
    expect(dirMatchesLock(checkout('1.0.0'))).toEqual({ ok: true, mismatches: [] });
  });
  it('does not match when an installed package.json disagrees with a record that claims a match', () => {
    const r = dirMatchesLock(checkout('0.9.0'));
    expect(r.ok).toBe(false);
    expect(r.mismatches).toEqual(['node_modules/a installed 0.9.0 != 1.0.0']);
  });
});

describe('depsPlan', () => {
  const key = 'k1';
  it('does nothing without a lockfile', () => {
    expect(depsPlan({ key: null, kind: 'missing' }).action).toBe('none');
  });
  it('keeps a tree whose marker matches', () => {
    expect(depsPlan({ key, kind: 'dir', markerKey: key }).action).toBe('ok');
  });
  it('adopts an unmarked tree that matches the lockfile, and calls a different one stale', () => {
    expect(depsPlan({ key, kind: 'dir', markerKey: null, installMatches: true }).action).toBe('adopt');
    expect(depsPlan({ key, kind: 'dir', markerKey: 'old', installMatches: false }).action).toBe('stale');
  });
  it('clones on a store hit and installs on a miss, for a missing tree', () => {
    expect(depsPlan({ key, kind: 'missing', hit: true })).toMatchObject({ action: 'clone', replace: false });
    expect(depsPlan({ key, kind: 'missing', hit: false })).toMatchObject({ action: 'install', replace: false });
  });
  it('replaces a symlinked or dangling node_modules instead of keeping it', () => {
    expect(depsPlan({ key, kind: 'link', hit: true })).toMatchObject({ action: 'clone', replace: true });
    expect(depsPlan({ key, kind: 'dangling', hit: false })).toMatchObject({ action: 'install', replace: true });
  });
});

describe('nodeModulesKind, markers', () => {
  it('classifies missing, dir, link and dangling', () => {
    expect(nodeModulesKind(join(tmp, 'none'))).toBe('missing');
    fakeTree(join(tmp, 'd'));
    expect(nodeModulesKind(join(tmp, 'd'))).toBe('dir');
    mkdirSync(join(tmp, 'l'));
    symlinkSync(join(tmp, 'd/node_modules'), join(tmp, 'l/node_modules'));
    expect(nodeModulesKind(join(tmp, 'l'))).toBe('link');
    mkdirSync(join(tmp, 'x'));
    symlinkSync(join(tmp, 'gone'), join(tmp, 'x/node_modules'));
    expect(nodeModulesKind(join(tmp, 'x'))).toBe('dangling');
  });
  it('round-trips the marker', () => {
    fakeTree(join(tmp, 'd'));
    writeMarker(join(tmp, 'd'), { key: 'abc', source: 'clone' });
    expect(readMarker(join(tmp, 'd'))).toMatchObject({ key: 'abc', source: 'clone' });
    expect(existsSync(join(tmp, 'd/node_modules', MARKER))).toBe(true);
  });
});

describe('placeClone', () => {
  it('places the copy atomically and keeps relative links', () => {
    fakeTree(join(tmp, 'src'));
    mkdirSync(join(tmp, 'dest'));
    const r = placeClone({ src: join(tmp, 'src/node_modules'), destNodeModules: join(tmp, 'dest/node_modules'), copier: copy });
    expect(r.ok).toBe(true);
    expect(readFileSync(join(tmp, 'dest/node_modules/a/package.json'), 'utf-8')).toContain('"a"');
    expect(lstatSync(join(tmp, 'dest/node_modules/.bin/a')).isSymbolicLink()).toBe(true);
    expect(existsSync(join(tmp, 'dest/node_modules/.bin/a'))).toBe(true);
  });
  it('leaves nothing behind when the copier fails', () => {
    fakeTree(join(tmp, 'src'));
    mkdirSync(join(tmp, 'dest'));
    const r = placeClone({
      src: join(tmp, 'src/node_modules'),
      destNodeModules: join(tmp, 'dest/node_modules'),
      copier: () => ({ ok: false, error: 'boom' }),
    });
    expect(r).toMatchObject({ ok: false, error: 'boom' });
    expect(existsSync(join(tmp, 'dest/node_modules'))).toBe(false);
  });
});

describe('seedStore', () => {
  it('writes the entry, then the completion marker last, and drops the source marker', () => {
    fakeTree(join(tmp, 'src'));
    writeMarker(join(tmp, 'src'), { key: 'k', source: 'install' });
    const root = join(tmp, 'store');
    expect(storeHit('k', root)).toBe(false);
    const r = seedStore({ key: 'k', fromNodeModules: join(tmp, 'src/node_modules'), root, copier: copy, source: 'test' });
    expect(r.ok).toBe(true);
    expect(storeHit('k', root)).toBe(true);
    expect(JSON.parse(readFileSync(join(root, 'k', COMPLETE), 'utf-8'))).toMatchObject({ key: 'k', source: 'test' });
    expect(existsSync(join(root, 'k/node_modules', MARKER))).toBe(false);
  });
  it('refuses while another session holds the seeding lock', () => {
    fakeTree(join(tmp, 'src'));
    const root = join(tmp, 'store');
    mkdirSync(join(root, 'k.lock'), { recursive: true });
    const r = seedStore({ key: 'k', fromNodeModules: join(tmp, 'src/node_modules'), root, copier: copy, source: 'test' });
    expect(r).toMatchObject({ ok: false, busy: true });
    expect(storeHit('k', root)).toBe(false);
  });
  it('is a no-op for an entry that already exists', () => {
    fakeTree(join(tmp, 'src'));
    const root = join(tmp, 'store');
    seedStore({ key: 'k', fromNodeModules: join(tmp, 'src/node_modules'), root, copier: copy, source: 'one' });
    const r = seedStore({ key: 'k', fromNodeModules: join(tmp, 'src/node_modules'), root, copier: copy, source: 'two' });
    expect(r).toMatchObject({ ok: true, already: true });
  });
});

describe('gcPlan', () => {
  const entries = [
    { key: 'main', at: '2026-11-15T10:00:00Z' },
    { key: 'used', at: '2026-10-01T00:00:00Z' },
    { key: 'new1', at: '2026-11-14T00:00:00Z' },
    { key: 'new2', at: '2026-11-13T00:00:00Z' },
    { key: 'old', at: '2026-09-01T00:00:00Z' },
  ];
  it("keeps main's key, every key a checkout uses, and the newest few; removes the rest", () => {
    const plan = gcPlan({ entries, referenced: new Set(['used']), mainKey: 'main', keepNewest: 2 });
    expect(plan.keep.sort()).toEqual(['main', 'new1', 'used']);
    expect(plan.remove.sort()).toEqual(['new2', 'old']);
  });
});

describe.runIf(process.platform === 'darwin')('cloneDir on APFS', () => {
  it('clones a tree with cp -c and keeps relative links', () => {
    fakeTree(join(tmp, 'src'));
    const r = cloneDir(join(tmp, 'src/node_modules'), join(tmp, 'out'));
    expect(r.ok).toBe(true);
    expect(readFileSync(join(tmp, 'out/a/package.json'), 'utf-8')).toContain('"a"');
    expect(lstatSync(join(tmp, 'out/.bin/a')).isSymbolicLink()).toBe(true);
  });
});
