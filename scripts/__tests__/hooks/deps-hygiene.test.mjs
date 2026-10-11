// Fixture tests for .claude/hooks/deps-hygiene.mjs (advisory SessionStart + PostToolUse(Bash))
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { commandRoot, nodeModulesState, ON_DEMAND_TOOLS } from '../../../.claude/hooks/deps-hygiene.mjs';

const HOOK = resolve(process.cwd(), '.claude/hooks/deps-hygiene.mjs');
let base;
const dirs = {};

function run(event, root, command) {
  const out = execFileSync('node', [HOOK], {
    input: JSON.stringify({ hook_event_name: event, tool_name: 'Bash', tool_input: { command } }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf-8',
  });
  return out.trim() ? JSON.parse(out).hookSpecificOutput.additionalContext : '';
}

beforeAll(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'deps-hygiene-')));
  for (const n of ['donor', 'linked', 'dangling', 'plain', 'skewed']) mkdirSync(join(base, n));
  mkdirSync(join(base, 'donor/node_modules'));
  writeFileSync(join(base, 'donor/package-lock.json'), '{"a":1}');
  writeFileSync(join(base, 'linked/package-lock.json'), '{"a":1}');
  writeFileSync(join(base, 'skewed/package-lock.json'), '{"a":2}');
  symlinkSync(join(base, 'donor/node_modules'), join(base, 'linked/node_modules'));
  symlinkSync(join(base, 'donor/node_modules'), join(base, 'skewed/node_modules'));
  symlinkSync(join(base, 'gone/node_modules'), join(base, 'dangling/node_modules'));
  mkdirSync(join(base, 'plain/node_modules'));
  Object.assign(dirs, Object.fromEntries(['donor', 'linked', 'dangling', 'plain', 'skewed'].map((n) => [n, join(base, n)])));
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
  it('is silent for a healthy shared install with matching lockfiles', () => {
    expect(run('SessionStart', dirs.linked, '')).not.toMatch(/broken link|differ/);
  });
  it('reports a broken node_modules link', () => {
    expect(run('SessionStart', dirs.dangling, '')).toMatch(/broken link/);
  });
  it('reports lockfile skew against the donor', () => {
    expect(run('SessionStart', dirs.skewed, '')).toMatch(/package-lock\.json differ/);
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
