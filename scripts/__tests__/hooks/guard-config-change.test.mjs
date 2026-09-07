// Fixture-stdin tests for .claude/hooks/guard-config-change.mjs
//
// Two independent questions, tested separately because the hook answers both:
//   1. is this path a control-plane config surface?   (isGuardedPath)
//   2. does the write land inside the CANONICAL checkout?  (isInsideCanonical)
// Only "yes" to both is a block. A config surface in a task worktree is not
// guarded — the PR is the review.
//
// Scope assertions use ABSOLUTE paths deliberately. A relative path resolves
// against the test runner's cwd, which is canonical in CI and a worktree
// locally, so a relative fixture would assert something different in each.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import {
  isGuardedPath,
  isGuardedBashWrite,
  isInsideCanonical,
  baseDirOf,
  writeTargets,
} from '../../../.claude/hooks/guard-config-change.mjs';
import {
  resolveActiveRoot,
  canonicalRootOf,
} from '../../../.claude/hooks/lib/workspace-identity.mjs';

const HOOK = resolve(process.cwd(), '.claude/hooks/guard-config-change.mjs');
const CANON = canonicalRootOf(resolveActiveRoot(process.cwd()));
const OUTSIDE = '/tmp/helm-guard-config-test-tree';

const inCanon = (p) => join(CANON, p);
const outside = (p) => join(OUTSIDE, p);

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

describe('guard-config-change path recognition', () => {
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
});

describe('guard-config-change scope', () => {
  it('places a canonical path inside canonical and a foreign path outside', () => {
    expect(isInsideCanonical(inCanon('.claude/settings.json'))).toBe(true);
    expect(isInsideCanonical(inCanon('src/lib/foo.ts'))).toBe(true);
    expect(isInsideCanonical(outside('.claude/settings.json'))).toBe(false);
    expect(isInsideCanonical('/tmp/notes.md')).toBe(false);
    expect(isInsideCanonical('')).toBe(false);
  });

  it('does not mistake a sibling directory sharing a prefix for canonical', () => {
    expect(isInsideCanonical(CANON + '-other/.mcp.json')).toBe(false);
  });

  it('reads the working directory off a leading cd, and only an unambiguous one', () => {
    expect(baseDirOf('cd /a/b && cp x y')).toBe('/a/b');
    expect(baseDirOf('cd "/a b" && cp x y')).toBe('/a b');
    expect(baseDirOf('cp x y')).toBe(null);
    expect(baseDirOf('cd "$WT" && cp x y')).toBe(null);
  });
});

describe('guard-config-change Bash write targets', () => {
  it('blocks a write whose TARGET is a guarded canonical path', () => {
    expect(isGuardedBashWrite(`echo hi > ${inCanon('.claude/settings.json')}`)).toBe(true);
    expect(isGuardedBashWrite(`echo hi >> ${inCanon('.mcp.json')}`)).toBe(true);
    expect(isGuardedBashWrite(`sed -i "" "s/x/y/" ${inCanon('.claude/hooks/guard-git.mjs')}`)).toBe(true);
    expect(isGuardedBashWrite(`cp foo.json ${inCanon('.claude/settings.json')}`)).toBe(true);
    expect(isGuardedBashWrite(`mv foo.yml ${inCanon('.github/workflows/ci.yml')}`)).toBe(true);
    expect(isGuardedBashWrite(`rm ${inCanon('.claude/hooks/guard-git.mjs')}`)).toBe(true);
    expect(isGuardedBashWrite(`tee ${inCanon('.mcp.json')}`)).toBe(true);
    expect(isGuardedBashWrite(`cat x | tee -a ${inCanon('.claude/settings.json')}`)).toBe(true);
    expect(isGuardedBashWrite(`git apply p.diff ${inCanon('.github/workflows/ci.yml')}`)).toBe(true);
    expect(isGuardedBashWrite(`dd if=/dev/zero of=${inCanon('.mcp.json')}`)).toBe(true);
  });

  it('allows the identical write in a task worktree', () => {
    expect(isGuardedBashWrite(`echo hi > ${outside('.claude/settings.json')}`)).toBe(false);
    expect(isGuardedBashWrite(`cp foo.json ${outside('.claude/hooks/guard-git.mjs')}`)).toBe(false);
    expect(isGuardedBashWrite(`cd ${OUTSIDE} && cp foo.json .claude/settings.json`)).toBe(false);
  });

  it('resolves a relative target against a leading cd', () => {
    expect(isGuardedBashWrite(`cd ${CANON} && cp foo.json .claude/settings.json`)).toBe(true);
  });

  // REGRESSION. `cp` and `install` were matched operand-by-operand, so
  // copying a canonical config file OUT to /tmp — a pure read — was refused.
  // `mv` must stay blocked: it removes the file it names first.
  it('allows copying a guarded path OUT, still blocks copying INTO one', () => {
    expect(isGuardedBashWrite(`cp ${inCanon('.mcp.json')} /tmp/x.json`)).toBe(false);
    expect(isGuardedBashWrite(`cp -p ${inCanon('.claude/settings.json')} /tmp/s.json`)).toBe(false);
    expect(isGuardedBashWrite(`cp foo.json ${inCanon('.mcp.json')}`)).toBe(true);
    // Both operands guarded: still a write, because the DESTINATION is.
    expect(
      isGuardedBashWrite(`cp ${inCanon('.mcp.json')} ${inCanon('.claude/settings.json')}`),
    ).toBe(true);
    // A canonical destination that is NOT a config surface is not this hook's
    // business — Bash writes into canonical are unguarded by design.
    expect(isGuardedBashWrite(`cp ${inCanon('.mcp.json')} ${inCanon('.mcp.bak.json')}`)).toBe(false);
    expect(isGuardedBashWrite(`install -m 644 foo ${inCanon('.mcp.json')}`)).toBe(true);
    // mv removes its source, so moving a guarded file OUT is still a write.
    expect(isGuardedBashWrite(`mv ${inCanon('.mcp.json')} /tmp/x.json`)).toBe(true);
  });

  it('allows reads of a guarded path', () => {
    expect(isGuardedBashWrite(`cat ${inCanon('.claude/settings.json')}`)).toBe(false);
    expect(isGuardedBashWrite(`grep -n matcher ${inCanon('.claude/settings.json')}`)).toBe(false);
    expect(isGuardedBashWrite(`git diff ${inCanon('.claude/hooks/guard-git.mjs')}`)).toBe(false);
    expect(isGuardedBashWrite(`/bin/ls ${inCanon('.claude/hooks/')}`)).toBe(false);
  });

  // REGRESSION. The hook once asked only whether a guarded path AND a write
  // token each appeared SOMEWHERE in the command, unrelated. Every line below
  // was refused, and none of them writes to a guarded surface.
  it('allows a read of a guarded path that redirects ELSEWHERE', () => {
    expect(isGuardedBashWrite(`grep -n jobs ${inCanon('.github/workflows/ci.yml')} > /tmp/out.txt`)).toBe(false);
    expect(isGuardedBashWrite(`grep -n jobs ${inCanon('.github/workflows/ci.yml')} 2>/dev/null`)).toBe(false);
    expect(isGuardedBashWrite(`cat ${inCanon('.mcp.json')} | jq . > /tmp/parsed.json`)).toBe(false);
    expect(isGuardedBashWrite(`node x.mjs 2>&1 | grep ${inCanon('.claude/hooks/guard-git.mjs')}`)).toBe(false);
  });

  it('allows a heredoc that merely QUOTES a guarded path', () => {
    const cmd = `cat > /tmp/notes.md <<EOF\nsee ${inCanon('.claude/hooks/guard-canonical-write.mjs')}\nEOF`;
    expect(isGuardedBashWrite(cmd)).toBe(false);
    expect(writeTargets(cmd)).toContain('/tmp/notes.md');
  });

  it('allows an unrelated rm in a command that names a guarded path', () => {
    expect(isGuardedBashWrite(`rm -r /tmp/build && cat ${inCanon('.mcp.json')}`)).toBe(false);
  });

  it('ignores unrelated write commands', () => {
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
  it('blocks an Edit to canonical .claude/settings.json without the env var', () => {
    const result = run(
      { tool_name: 'Edit', tool_input: { file_path: inCanon('.claude/settings.json') } },
      { HELM_CONFIG_EDIT: undefined },
    );
    expect(result.verdict).toBe('BLOCK');
    expect(result.stderr).toMatch(/HELM_CONFIG_EDIT=1/);
  });

  it('allows the same Edit in a task worktree', () => {
    const result = run({
      tool_name: 'Edit',
      tool_input: { file_path: outside('.claude/settings.json') },
    });
    expect(result.verdict).toBe('ALLOW');
  });

  it('names the worktree route first and the override as set-at-launch', () => {
    const result = run({
      tool_name: 'Edit',
      tool_input: { file_path: inCanon('.claude/settings.json') },
    });
    expect(result.stderr).toMatch(/worktree/);
    expect(result.stderr).toMatch(/LAUNCHED with/);
    expect(result.stderr).toMatch(/HELM_CONFIG_EDIT=1 claude/);
    // The override must not be stated as if it worked on THIS path. It does not:
    // guard-canonical-write.mjs refuses canonical Write/Edit with no env escape,
    // so naming it as the remedy here would be the same unreachable-remedy bug
    // this hook's own message existed to cause.
    expect(result.stderr).toMatch(/reaches Bash writes only/);
    expect(result.stderr).toMatch(/guard-canonical-write\.mjs still refuses canonical/);
  });

  it('allows a canonical Edit with HELM_CONFIG_EDIT=1', () => {
    const result = run(
      { tool_name: 'Edit', tool_input: { file_path: inCanon('.claude/settings.json') } },
      { HELM_CONFIG_EDIT: '1' },
    );
    expect(result.verdict).toBe('ALLOW');
  });

  it('blocks a Write to a canonical hook file, allows it in a worktree', () => {
    expect(
      run({ tool_name: 'Write', tool_input: { file_path: inCanon('.claude/hooks/guard-git.mjs') } })
        .verdict,
    ).toBe('BLOCK');
    expect(
      run({ tool_name: 'Write', tool_input: { file_path: outside('.claude/hooks/guard-git.mjs') } })
        .verdict,
    ).toBe('ALLOW');
  });

  it('blocks a MultiEdit touching a canonical workflow', () => {
    const result = run({
      tool_name: 'MultiEdit',
      tool_input: { file_path: inCanon('.github/workflows/ci.yml') },
    });
    expect(result.verdict).toBe('BLOCK');
  });

  it('allows an Edit to an unrelated file', () => {
    const result = run({
      tool_name: 'Edit',
      tool_input: { file_path: inCanon('src/lib/foo.ts') },
    });
    expect(result.verdict).toBe('ALLOW');
  });

  it('blocks a Bash write to canonical .mcp.json, allows a Bash read', () => {
    const blocked = run({
      tool_name: 'Bash',
      tool_input: { command: `echo "{}" > ${inCanon('.mcp.json')}` },
    });
    expect(blocked.verdict).toBe('BLOCK');
    const allowed = run({
      tool_name: 'Bash',
      tool_input: { command: `cat ${inCanon('.mcp.json')}` },
    });
    expect(allowed.verdict).toBe('ALLOW');
  });

  it('allows a Bash read of a workflow that redirects elsewhere', () => {
    const result = run({
      tool_name: 'Bash',
      tool_input: { command: `grep -n jobs ${inCanon('.github/workflows/ci.yml')} > /tmp/out.txt` },
    });
    expect(result.verdict).toBe('ALLOW');
  });

  it('ignores tool names it does not guard', () => {
    const result = run({
      tool_name: 'Read',
      tool_input: { file_path: inCanon('.claude/settings.json') },
    });
    expect(result.verdict).toBe('ALLOW');
  });

  it('never throws on malformed stdin', () => {
    expect(() =>
      execFileSync('node', [HOOK], { input: 'not json', encoding: 'utf-8' }),
    ).not.toThrow();
  });
});
