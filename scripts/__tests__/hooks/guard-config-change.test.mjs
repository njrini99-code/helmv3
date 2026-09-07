// Fixture-stdin tests for .claude/hooks/guard-config-change.mjs
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  isGuardedPath,
  isGuardedBashWrite,
  writeTargets,
} from '../../../.claude/hooks/guard-config-change.mjs';

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

  it('Bash: blocks a write whose TARGET is a guarded path', () => {
    expect(isGuardedBashWrite('echo hi > .claude/settings.json')).toBe(true);
    expect(isGuardedBashWrite('echo hi >> .mcp.json')).toBe(true);
    expect(isGuardedBashWrite('sed -i "" "s/x/y/" .claude/hooks/guard-git.mjs')).toBe(true);
    expect(isGuardedBashWrite('cp foo.json .claude/settings.json')).toBe(true);
    expect(isGuardedBashWrite('mv foo.yml .github/workflows/ci.yml')).toBe(true);
    expect(isGuardedBashWrite('rm .claude/hooks/guard-git.mjs')).toBe(true);
    expect(isGuardedBashWrite('tee .mcp.json')).toBe(true);
    expect(isGuardedBashWrite('cat x | tee -a .claude/settings.json')).toBe(true);
    expect(isGuardedBashWrite('git apply patch.diff .github/workflows/ci.yml')).toBe(true);
    expect(isGuardedBashWrite('dd if=/dev/zero of=.mcp.json')).toBe(true);
  });

  it('Bash: allows reads of a guarded path', () => {
    expect(isGuardedBashWrite('cat .claude/settings.json')).toBe(false);
    expect(isGuardedBashWrite('grep -n matcher .claude/settings.json')).toBe(false);
    expect(isGuardedBashWrite('git diff .claude/hooks/guard-git.mjs')).toBe(false);
    expect(isGuardedBashWrite('/bin/ls .claude/hooks/')).toBe(false);
  });

  // REGRESSION (2026-09-07). Until this date the hook asked only whether a
  // guarded path AND a write token each appeared SOMEWHERE in the command,
  // unrelated. Every line below was refused, and none of them writes to a
  // guarded surface. This is the bug the writeTargets() rewrite fixes.
  it('Bash: allows a read of a guarded path that redirects ELSEWHERE', () => {
    expect(isGuardedBashWrite('grep -n jobs .github/workflows/ci.yml > /tmp/out.txt')).toBe(false);
    expect(isGuardedBashWrite('grep -n jobs .github/workflows/ci.yml 2>/dev/null')).toBe(false);
    expect(isGuardedBashWrite('cat .mcp.json | jq . > /tmp/parsed.json')).toBe(false);
    expect(isGuardedBashWrite('node x.mjs 2>&1 | grep .claude/hooks/guard-git.mjs')).toBe(false);
  });

  it('Bash: allows a heredoc that merely QUOTES a guarded path', () => {
    const cmd = 'cat > /tmp/notes.md <<EOF\nsee .claude/hooks/guard-canonical-write.mjs\nEOF';
    expect(isGuardedBashWrite(cmd)).toBe(false);
    expect(writeTargets(cmd)).toContain('/tmp/notes.md');
  });

  it('Bash: allows an unrelated rm in a command that names a guarded path', () => {
    expect(isGuardedBashWrite('rm -r /tmp/build && cat .mcp.json')).toBe(false);
  });

  it('Bash: ignores unrelated write commands', () => {
    expect(isGuardedBashWrite('echo hi > /tmp/scratch.txt')).toBe(false);
    expect(isGuardedBashWrite('rm src/lib/foo.ts')).toBe(false);
  });

  it('writeTargets extracts destinations, not sources', () => {
    expect(writeTargets('echo hi > /tmp/a.txt')).toEqual(['/tmp/a.txt']);
    expect(writeTargets('grep x /tmp/in.txt')).toEqual([]);
    expect(writeTargets('cat a 2>&1')).toEqual([]);
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

  it('says the override must be set at launch, not exported mid-session', () => {
    const result = run({
      tool_name: 'Edit',
      tool_input: { file_path: '.claude/settings.json' },
    });
    expect(result.stderr).toMatch(/LAUNCHED with/);
    expect(result.stderr).toMatch(/HELM_CONFIG_EDIT=1 claude/);
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

  it('allows a Bash read of a workflow that redirects elsewhere', () => {
    const result = run({
      tool_name: 'Bash',
      tool_input: { command: 'grep -n jobs .github/workflows/ci.yml > /tmp/out.txt' },
    });
    expect(result.verdict).toBe('ALLOW');
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
