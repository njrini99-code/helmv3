// Fixture tests for .claude/hooks/deps-hygiene.mjs (advisory SessionStart + PostToolUse(Bash))
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { commandRoot, nodeModulesState, ON_DEMAND_TOOLS } from '../../../.claude/hooks/deps-hygiene.mjs';
import { keyForDir, seedStore } from '../../lib/deps-store.mjs';

const HOOK = resolve(process.cwd(), '.claude/hooks/deps-hygiene.mjs');
let base;
const dirs = {};

function run(event, root, command) {
  const out = execFileSync('node', [HOOK], {
    input: JSON.stringify({ hook_event_name: event, tool_name: 'Bash', tool_input: { command } }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, HELM_DEPS_STORE: join(base, 'store'), HELM_CLONE_RESERVE_GIB: '0' },
    encoding: 'utf-8',
  });
  return out.trim() ? JSON.parse(out).hookSpecificOutput.additionalContext : '';
}

const LOCK = JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/a': { version: '1.0.0' } } });
const NAMES = ['donor', 'linked', 'dangling', 'plain', 'healthy', 'stale', 'missing'];

beforeAll(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'deps-hygiene-')));
  for (const n of NAMES) mkdirSync(join(base, n));
  mkdirSync(join(base, 'donor/node_modules'));
  writeFileSync(join(base, 'donor/package-lock.json'), '{"a":1}');
  writeFileSync(join(base, 'linked/package-lock.json'), '{"a":1}');
  symlinkSync(join(base, 'donor/node_modules'), join(base, 'linked/node_modules'));
  symlinkSync(join(base, 'gone/node_modules'), join(base, 'dangling/node_modules'));
  mkdirSync(join(base, 'plain/node_modules'));
  // healthy: installed for its own lockfile; stale: installed for another one; missing: none at all.
  for (const n of ['healthy', 'stale', 'missing']) {
    writeFileSync(join(base, n, 'package.json'), '{"name":"x","private":true}');
    writeFileSync(join(base, n, 'package-lock.json'), LOCK);
  }
  mkdirSync(join(base, 'healthy/node_modules/a'), { recursive: true });
  writeFileSync(join(base, 'healthy/node_modules/.package-lock.json'), LOCK);
  writeFileSync(join(base, 'healthy/node_modules/a/package.json'), '{"name":"a","version":"1.0.0"}');
  mkdirSync(join(base, 'stale/node_modules'));
  writeFileSync(
    join(base, 'stale/node_modules/.package-lock.json'),
    JSON.stringify({ packages: { 'node_modules/a': { version: '0.9.0' } } }),
  );
  Object.assign(dirs, Object.fromEntries(NAMES.map((n) => [n, join(base, n)])));
});
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('nodeModulesState', () => {
  it('classifies dir, link, dangling and missing', () => {
    expect(nodeModulesState(dirs.plain).kind).toBe('dir');
    expect(nodeModulesState(dirs.linked).kind).toBe('link');
    expect(nodeModulesState(dirs.dangling).kind).toBe('dangling');
    expect(nodeModulesState(join(base, 'nothing')).kind).toBe('missing');
  });
});

describe('SessionStart', () => {
  it('is silent for a tree installed for its own lockfile', () => {
    expect(run('SessionStart', dirs.healthy, '')).toBe('');
  });
  it('reports a symlinked node_modules as unsupported', () => {
    expect(run('SessionStart', dirs.linked, '')).toMatch(/is a symlink .* not supported/);
  });
  it('reports a broken node_modules link', () => {
    expect(run('SessionStart', dirs.dangling, '')).toMatch(/broken link/);
  });
  it('flags a tree installed for another lockfile, without touching it', () => {
    expect(run('SessionStart', dirs.stale, '')).toMatch(/installed for a different lockfile .* --refresh/);
    expect(existsSync(join(dirs.stale, 'node_modules/.package-lock.json'))).toBe(true);
  });
  it('clones a missing node_modules when the store has this lockfile', () => {
    const dir = join(base, 'clonable');
    mkdirSync(join(dir, 'src/node_modules/a'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{"name":"y","private":true}');
    // Its own lockfile, so this store entry is not also a hit for the "missing" fixture.
    writeFileSync(join(dir, 'package-lock.json'), LOCK.replace('"lockfileVersion":3', '"name":"clonable","lockfileVersion":3'));
    writeFileSync(join(dir, 'src/node_modules/a/package.json'), '{"name":"a","version":"1.0.0"}');
    const store = join(base, 'store');
    expect(seedStore({ key: keyForDir(dir), fromNodeModules: join(dir, 'src/node_modules'), root: store, source: 'test' }).ok).toBe(true);
    expect(run('SessionStart', dir, '')).toMatch(/cloned it from the deps store/);
    expect(existsSync(join(dir, 'node_modules/a/package.json'))).toBe(true);
  });
  it('names the one command that fills the store when node_modules is missing and the store is empty', () => {
    expect(run('SessionStart', dirs.missing, '')).toMatch(/no tree for this lockfile yet/);
    expect(existsSync(join(dirs.missing, 'node_modules'))).toBe(false);
  });
});

describe('PostToolUse(Bash)', () => {
  it('warns after install-ish npm through a symlinked node_modules, even lockfile-only', () => {
    expect(run('PostToolUse', dirs.linked, 'npm uninstall x --package-lock-only')).toMatch(/ran through node_modules/);
    expect(run('PostToolUse', dirs.linked, 'npm ci')).toMatch(/ran through node_modules/);
  });
  it('is silent for unrelated commands and for read-only npm', () => {
    expect(run('PostToolUse', dirs.linked, 'git status && npm run guards')).toBe('');
    expect(run('PostToolUse', dirs.linked, 'npm ls --all')).toBe('');
  });
  it('points bare on-demand tools at their pinned invocation, and not pinned calls', () => {
    for (const tool of Object.keys(ON_DEMAND_TOOLS)) {
      expect(run('PostToolUse', dirs.plain, `npx ${tool} run x`)).toMatch(new RegExp(`${tool} is not a repo dependency`));
      expect(run('PostToolUse', dirs.plain, `npx --yes ${tool}@1.2.3 run x`)).toBe('');
    }
  });
  it('never fails on malformed stdin', () => {
    expect(() => execFileSync('node', [HOOK], { input: 'not json', encoding: 'utf-8' })).not.toThrow();
  });
});

describe('commandRoot', () => {
  it('uses a leading cd over the session cwd', () => {
    expect(commandRoot('cd /tmp/a && npm ci', '/work/b', '/proj')).toBe('/tmp/a');
  });
  it('expands ~ and strips quotes', () => {
    expect(commandRoot('cd "~/x y" && npm i', '/w', '/p')).toBe(`${process.env.HOME}/x y`);
  });
  it('resolves a relative cd against the cwd', () => {
    expect(commandRoot('cd sub; npm i', '/w', '/p')).toBe('/w/sub');
  });
  it('falls back to cwd, then the project dir', () => {
    expect(commandRoot('npm ci', '/w', '/p')).toBe('/w');
    expect(commandRoot('npm ci', undefined, '/p')).toBe('/p');
  });
});
