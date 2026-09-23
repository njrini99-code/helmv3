import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchArguments, resolveLaunchDirectory } from '../claude.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'helm-launch-')));
  roots.push(root);
  mkdirSync(join(root, '.claude/agents'), { recursive: true });
  writeFileSync(join(root, '.claude/settings.json'), JSON.stringify({ permissions: { allow: ['Bash', 'mcp__supabase'] }, hooks: { SessionStart: [{ hooks: [{ command: 'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/session.mjs' }] }] } }));
  writeFileSync(join(root, '.claude/agents/reader.md'), '---\nname: reader\ndescription: Read the database\nmodel: sonnet\ndisallowedTools: Write, Edit\n---\nInspect using available tools.\n');
  writeFileSync(join(root, 'AGENTS.md'), 'Current task authority.\n');
  writeFileSync(join(root, '.mcp.json'), '{}');
  return root;
}
const value = (args, key) => args[args.indexOf(key) + 1];

describe('canonical Claude launch profile', () => {
  it('excludes stale branch project settings while retaining user and shared local preferences', () => {
    const root = fixture();
    const args = launchArguments(root, ['--model', 'haiku']);
    expect(value(args, '--setting-sources')).toBe('user,local');
    const settings = JSON.parse(value(args, '--settings'));
    expect(settings.permissions.allow).toContain('mcp__supabase');
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe(`node '${root}'/.claude/hooks/session.mjs`);
    expect(value(args, '--mcp-config')).toBe(join(root, '.mcp.json'));
    expect(args).not.toContain('--strict-mcp-config');
    expect(args.slice(-2)).toEqual(['--model', 'haiku']);
    const reader = JSON.parse(value(args, '--agents')).reader;
    expect(reader.tools).toBeUndefined();
    expect(reader.disallowedTools).toEqual(['Write', 'Edit']);
    expect(value(args, '--append-system-prompt')).toContain('Current task authority.');
  });

  it('keeps an old source checkout and its tracked files intact', () => {
    const root = fixture();
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
    git('add', '.claude', '.mcp.json', 'AGENTS.md'); git('commit', '-qm', 'initial');
    const old = join(root, 'old');
    git('worktree', 'add', '-qb', 'old-code', old);
    writeFileSync(join(old, '.claude/settings.json'), '{"permissions":{"deny":["mcp__supabase"]}}\n');
    const before = execFileSync('git', ['diff'], { cwd: old, encoding: 'utf8' });
    expect(resolveLaunchDirectory(old, root)).toEqual({ canonicalRoot: root, cwd: old });
    const args = launchArguments(root);
    expect(JSON.parse(value(args, '--settings')).permissions.deny).toBeUndefined();
    expect(execFileSync('git', ['diff'], { cwd: old, encoding: 'utf8' })).toBe(before);
    expect(resolveLaunchDirectory(tmpdir(), root)).toEqual({ canonicalRoot: root, cwd: root });
  });
});
