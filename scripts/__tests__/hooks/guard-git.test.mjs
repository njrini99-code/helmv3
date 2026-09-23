// Fixture-stdin tests for .claude/hooks/guard-git.mjs
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { evaluateCommand, targetRefOf } from '../../../.claude/hooks/guard-git.mjs';

const HOOK = resolve(process.cwd(), '.claude/hooks/guard-git.mjs');

function run(command, toolName = 'Bash') {
  try {
    execFileSync('node', [HOOK], {
      input: JSON.stringify({ tool_name: toolName, tool_input: { command } }),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { verdict: 'ALLOW', stderr: '' };
  } catch (err) {
    return { verdict: err.status === 2 ? 'BLOCK' : 'ALLOW', stderr: String(err.stderr ?? '') };
  }
}

describe('guard-git pure logic', () => {
  it('blocks a bare git push --force', () => {
    expect(evaluateCommand('git push origin main --force')).toMatch(/force/);
  });

  it('blocks a bare git push -f', () => {
    expect(evaluateCommand('git push -f origin agent/foo')).toMatch(/force/);
  });

  it('allows --force-with-lease targeting a non-main ref', () => {
    expect(evaluateCommand('git push --force-with-lease origin agent/foo')).toBeNull();
  });

  it('blocks --force-with-lease targeting main', () => {
    expect(evaluateCommand('git push --force-with-lease origin main')).toMatch(/force/);
  });

  it('blocks --force-with-lease with no explicit ref (defaults to current branch, treated as main-risk)', () => {
    // No explicit target ref means we cannot prove it's not main — block.
    expect(evaluateCommand('git push --force-with-lease')).toMatch(/force/);
  });

  it('allows an ordinary push', () => {
    expect(evaluateCommand('git push origin agent/foo', 'agent/foo')).toBeNull();
  });

  it('blocks a plain push to main from a non-main branch', () => {
    expect(evaluateCommand('git push origin main', 'agent/foo')).toMatch(/targeting main/);
    expect(evaluateCommand('git push origin HEAD:main', 'agent/foo')).toMatch(/targeting main/);
  });

  it('allows a plain push to main when already on main', () => {
    expect(evaluateCommand('git push origin main', 'main')).toBeNull();
  });

  it('allows a plain push to main when the branch is unknown (best-effort only)', () => {
    expect(evaluateCommand('git push origin main', null)).toBeNull();
  });

  it('allows branch creation but preserves worktree deletion checks', () => {
    expect(evaluateCommand('git worktree add ../foo')).toBeNull();
    expect(evaluateCommand('git worktree remove ../foo')).toMatch(/worktree remove/);
    expect(evaluateCommand('git checkout -b agent/foo')).toBeNull();
    expect(evaluateCommand('git switch -c agent/foo')).toBeNull();
  });

  it('does not block scripts/new-worktree.sh', () => {
    expect(evaluateCommand('scripts/new-worktree.sh my-task')).toBeNull();
  });

  it('blocks git add -A and git add .', () => {
    expect(evaluateCommand('git add -A')).toMatch(/git add/);
    expect(evaluateCommand('git add --all')).toMatch(/git add/);
    expect(evaluateCommand('git add .')).toMatch(/git add/);
  });

  it('does not block git add with explicit paths', () => {
    expect(evaluateCommand('git add src/foo.ts src/bar.ts')).toBeNull();
    expect(evaluateCommand('git add .claude/hooks/guard-git.mjs')).toBeNull();
  });

  it('blocks git branch -D', () => {
    expect(evaluateCommand('git branch -D agent/old-task')).toMatch(/branch -D/);
  });

  it('does not block an ordinary git branch list/create', () => {
    expect(evaluateCommand('git branch')).toBeNull();
    expect(evaluateCommand('git branch -d agent/old-task')).toBeNull();
  });

  it('leaves merge authorization to the task and required GitHub checks', () => {
    expect(evaluateCommand('gh pr merge 123 --squash')).toBeNull();
    expect(evaluateCommand('gh pr merge --admin 123')).toBeNull();
  });

  it('does not block npm run pr:land', () => {
    expect(evaluateCommand('npm run pr:land')).toBeNull();
  });

  it('leaves production approval to permissions.ask', () => {
    expect(evaluateCommand('vercel --prod')).toBeNull();
    expect(evaluateCommand('vercel deploy --prod')).toBeNull();
    expect(evaluateCommand('vercel promote dpl_123')).toBeNull();
    expect(evaluateCommand('vercel rollback')).toBeNull();
    expect(evaluateCommand('vercel env rm MY_VAR')).toBeNull();
  });

  it('allows a preview deploy', () => {
    expect(evaluateCommand('vercel deploy')).toBeNull();
  });

  it('does not misread an unrelated -f elsewhere in a compound command as a force-push flag', () => {
    // Regression: FORCE_FLAG_RE used to be tested against the whole command
    // string, so `git push origin agent/foo && rm -f x.txt` was refused as
    // a force push even though `-f` belongs to the unrelated `rm`.
    expect(evaluateCommand('git push origin agent/foo && rm -f x.txt', 'agent/foo')).toBeNull();
    expect(evaluateCommand('git push origin agent/foo; rm -f x.txt', 'agent/foo')).toBeNull();
  });

  it('still blocks a genuine force flag placed after a compound separator', () => {
    expect(evaluateCommand('echo hi && git push -f origin agent/foo')).toMatch(/force/);
  });

  it('targetRefOf extracts the explicit ref', () => {
    expect(targetRefOf('git push origin agent/foo')).toBe('agent/foo');
    expect(targetRefOf('git push origin HEAD:main')).toBe('main');
    expect(targetRefOf('git push origin')).toBeNull();
  });
});

describe('guard-git subprocess contract', () => {
  it('only inspects Bash tool calls', () => {
    const result = run('git push --force origin main', 'mcp__supabase__execute_sql');
    expect(result.verdict).toBe('ALLOW');
  });

  it('blocks over stdin exactly like the pure function', () => {
    expect(run('git push --force origin main').verdict).toBe('BLOCK');
    expect(run('git push --force-with-lease origin agent/foo').verdict).toBe('ALLOW');
  });

  it('never throws on malformed stdin', () => {
    expect(() =>
      execFileSync('node', [HOOK], { input: 'not json', encoding: 'utf-8' }),
    ).not.toThrow();
  });
});
