import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * `.claude/hooks/guard-bash.sh` rule 11 — nested worktrees.
 *
 * `.claude/rules/autonomy.md` had said "put worktrees outside the repo" in prose
 * for weeks. On 2026-08-19 there were nine of them inside `.claude/worktrees/`,
 * and two carried a `CLAUDE.md` that differed from root — so which copy a
 * session started in decided which instructions it received. Prose did not
 * prevent a single one; this rule is the mechanical version.
 *
 * WHY THIS TEST EXISTS, SPECIFICALLY
 * ---------------------------------
 * The first version of the rule allowed everything. `sed 's/…\\+//'` returns an
 * empty string on BSD sed (macOS, where this hook actually runs) because BSD
 * basic regex has no `\+`. The extraction silently produced nothing, the loop
 * never ran, and every nested worktree passed. A guard that cannot fire is worse
 * than no guard, because it is believed.
 *
 * The second version blocked legitimate EXTERNAL worktrees, by treating the
 * branch name after `-b` as a destination path and by not collapsing `..`.
 *
 * Both bugs were invisible by reading and obvious the moment the hook was
 * actually executed. So this asserts BOTH directions: nested must block, and
 * external must still be allowed.
 */

const REPO = resolve(__dirname, '../../..');
const HOOK = resolve(REPO, '.claude/hooks/guard-bash.sh');

/** Exit 2 = blocked; anything else = allowed. Never exit 1 (that is "hook error"). */
function runGuard(command: string): 'BLOCK' | 'ALLOW' {
  try {
    execFileSync('bash', [HOOK], {
      input: JSON.stringify({ tool_input: { command } }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: REPO },
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return 'ALLOW';
  } catch (err) {
    const code = (err as { status?: number }).status;
    return code === 2 ? 'BLOCK' : 'ALLOW';
  }
}

describe('guard-bash rule 11 — nested worktrees', () => {
  it.each([
    ['relative path under .claude/worktrees', 'git worktree add .claude/worktrees/foo -b x'],
    ['a bare subdirectory', 'git worktree add ./sub/tree -b x'],
    ['-b given BEFORE the destination', 'git worktree add -b x .claude/worktrees/z'],
  ])('BLOCKS %s', (_label, cmd) => {
    expect(runGuard(cmd)).toBe('BLOCK');
  });

  it('BLOCKS an absolute path inside the repo', () => {
    expect(runGuard(`git worktree add ${REPO}/.worktrees/bar -b x`)).toBe('BLOCK');
  });

  it.each([
    ['a sibling directory reached via ..', 'git worktree add ../helmv3-wt -b x'],
    ['an absolute path outside the repo', 'git worktree add /tmp/helmv3-wt -b x'],
  ])('ALLOWS %s', (_label, cmd) => {
    // Without `..` collapsing, the sibling case string-prefix-matches the repo
    // root and is wrongly blocked. That regression shipped once.
    expect(runGuard(cmd)).toBe('ALLOW');
  });

  it('does not fire on other git worktree subcommands', () => {
    expect(runGuard('git worktree list')).toBe('ALLOW');
    expect(runGuard('git worktree remove ../foo')).toBe('ALLOW');
  });

  it('does not fire on unrelated commands', () => {
    expect(runGuard('npm run typecheck')).toBe('ALLOW');
  });
});

/**
 * Rule 4 — force push, in every spelling.
 *
 * The original regex `push.*(--force|-f)([space]|$)` matched only a STANDALONE
 * `-f`/`--force`. A combined short flag carries force intent with no `-f`
 * substring — `git push -vf` is verbose+force, `-fv` puts `-f` before a
 * non-boundary — so both bypassed the guard entirely. Invisible by reading,
 * obvious the moment the hook runs. This asserts BOTH directions: every force
 * spelling blocks, and ordinary pushes still pass.
 */
describe('guard-bash rule 4 — force push', () => {
  it.each([
    ['long --force', 'git push --force origin main'],
    ['short -f', 'git push -f origin main'],
    ['combined -vf (the reported bypass)', 'git push -vf origin main'],
    ['combined -fv', 'git push -fv origin main'],
    ['combined -uf', 'git push -uf origin main'],
    ['--force at end of line', 'git push origin main --force'],
    ['--force-with-lease (still a history rewrite)', 'git push --force-with-lease origin main'],
    ['with a global -c flag before push', 'git -c foo=bar push -vf origin main'],
  ])('BLOCKS %s', (_label, cmd) => {
    expect(runGuard(cmd)).toBe('BLOCK');
  });

  it.each([
    ['plain push', 'git push origin main'],
    ['set-upstream -u', 'git push -u origin main'],
    ['verbose -v', 'git push -v origin main'],
    ['--dry-run', 'git push --dry-run origin main'],
    ['an explicit refspec', 'git push origin HEAD:refs/heads/x'],
  ])('ALLOWS %s', (_label, cmd) => {
    expect(runGuard(cmd)).toBe('ALLOW');
  });
});
