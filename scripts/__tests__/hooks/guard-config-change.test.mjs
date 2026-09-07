// Fixture-stdin tests for .claude/hooks/guard-config-change.mjs
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { isGuardedPath, isGuardedBashWrite } from '../../../.claude/hooks/guard-config-change.mjs';

const HOOK = resolve(process.cwd(), '.claude/hooks/guard-config-change.mjs');

function run(input, env = {}) {
  const mergedEnv = { ...process.env, ...env };
  delete mergedEnv.HELM_CONFIG_EDIT;
  if (env.HELM_CONFIG_EDIT !== undefined) mergedEnv.HELM_CONFIG_EDIT = env.HELM_CONFIG_EDIT;
  try {
    execFileSync('node', [HOOK], {
      input: JSON.stringify(input),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: mergedEnv,
    });
    return { verdict: 'ALLOW', stderr: '' };
  } catch (err) {
    return { verdict: err.status === 2 ? 'BLOCK' : 'ALLOW', stderr: String(err.stderr ?? '') };
  }
}

describe('guard-config-change pure logic', () => {
  it('recognizes every guarded surface', () => {
    expect(isGuardedPath('.claude/settings.json')).toBe(true);
    expect(isGuardedPath('.claude/settings.local.json')).toBe(true);
    expect(isGuardedPath('.claude/hooks/guard-git.mjs')).toBe(true);
    expect(isGuardedPath('.claude/hooks/lib/workspace-identity.mjs')).toBe(true);
    expect(isGuardedPath('.mcp.json')).toBe(true);
    expect(isGuardedPath('.github/workflows/ci.yml')).toBe(true);
  });

  it('does not guard unrelated .claude paths', () => {
    expect(isGuardedPath('.claude/rules/shipping.md')).toBe(false);
    expect(isGuardedPath('.claude/skills/helm-process/SKILL.md')).toBe(false);
    expect(isGuardedPath('.claude/commands/land.md')).toBe(false);
    expect(isGuardedPath('src/lib/foo.ts')).toBe(false);
  });

  it('Bash: requires both a guarded path and a write-shaped token', () => {
    expect(isGuardedBashWrite('cat .claude/settings.json')).toBe(false);
    expect(isGuardedBashWrite('grep -n matcher .claude/settings.json')).toBe(false);
    expect(isGuardedBashWrite('git diff .claude/hooks/guard-git.mjs')).toBe(false);
    expect(isGuardedBashWrite('echo hi > .claude/settings.json')).toBe(true);
    expect(isGuardedBashWrite('sed -i "" "s/x/y/" .claude/hooks/guard-git.mjs')).toBe(true);
    expect(isGuardedBashWrite('cp foo.json .claude/settings.json')).toBe(true);
    expect(isGuardedBashWrite('rm .claude/hooks/guard-git.mjs')).toBe(true);
  });

  it('Bash: ignores unrelated write commands', () => {
    expect(isGuardedBashWrite('echo hi > /tmp/scratch.txt')).toBe(false);
    expect(isGuardedBashWrite('rm src/lib/foo.ts')).toBe(false);
  });
});

describe('guard-config-change subprocess contract', () => {
  it('blocks an Edit to .claude/settings.json without the env var', () => {
    const result = run(
      { tool_name: 'Edit', tool_input: { file_path: '.claude/settings.json' } },
      { HELM_CONFIG_EDIT: undefined },
    );
    expect(result.verdict).toBe('BLOCK');
    expect(result.stderr).toMatch(/HELM_CONFIG_EDIT=1/);
  });

  it('allows the same Edit with HELM_CONFIG_EDIT=1', () => {
    const result = run(
      { tool_name: 'Edit', tool_input: { file_path: '.claude/settings.json' } },
      { HELM_CONFIG_EDIT: '1' },
    );
    expect(result.verdict).toBe('ALLOW');
  });

  it('blocks a Write to a hook file without the env var', () => {
    const result = run({
      tool_name: 'Write',
      tool_input: { file_path: '.claude/hooks/guard-git.mjs' },
    });
    expect(result.verdict).toBe('BLOCK');
  });

  it('blocks a MultiEdit touching .github/workflows/ci.yml', () => {
    const result = run({
      tool_name: 'MultiEdit',
      tool_input: { file_path: '.github/workflows/ci.yml' },
    });
    expect(result.verdict).toBe('BLOCK');
  });

  it('allows an Edit to an unrelated file', () => {
    const result = run({ tool_name: 'Edit', tool_input: { file_path: 'src/lib/foo.ts' } });
    expect(result.verdict).toBe('ALLOW');
  });

  it('blocks a Bash write to .mcp.json, allows a Bash read', () => {
    const blocked = run({ tool_name: 'Bash', tool_input: { command: 'echo "{}" > .mcp.json' } });
    expect(blocked.verdict).toBe('BLOCK');
    const allowed = run({ tool_name: 'Bash', tool_input: { command: 'cat .mcp.json' } });
    expect(allowed.verdict).toBe('ALLOW');
  });

  it('ignores tool names it does not guard', () => {
    const result = run({ tool_name: 'Read', tool_input: { file_path: '.claude/settings.json' } });
    expect(result.verdict).toBe('ALLOW');
  });

  it('never throws on malformed stdin', () => {
    expect(() =>
      execFileSync('node', [HOOK], { input: 'not json', encoding: 'utf-8' }),
    ).not.toThrow();
  });
});
