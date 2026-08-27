// NOTE 2026-08-27: `git stash` was REMOVED from this hook by owner directive
// and is no longer blocked. Rows that used it as their sample command were
// dropped, not rewritten — each of those tables still exercises the same
// normalization anchor through the force-push, clean -fd and worktree rows.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * `.claude/hooks/guard-bash.sh` — command normalization, across EVERY rule.
 *
 * WHY THIS FILE EXISTS, SPECIFICALLY
 * ----------------------------------
 * `guard-bash-worktree.test.ts` pins rules 4, 11 and 12 thoroughly — but every
 * one of its cases is a SINGLE-LINE command string built inline. That shape is
 * the blind spot: the hook captures `.tool_input.command` with `$(...)`, which
 * strips only TRAILING newlines, and then feeds it to `grep`, which evaluates
 * one line at a time. Bash removes a backslash-newline pair before tokenization,
 * so a command the shell runs as one logical invocation can be written with its
 * keywords on separate grep records, matching nothing.
 *
 * Measured 2026-08-26 against the hook as it then stood: a backslash line
 * continuation defeated TEN of the ELEVEN rules — stash, force push, clean -fd,
 * worktree add, `supabase config push`, `supabase db reset`, `supabase db push`,
 * destructive SQL via psql, `rm -rf .next`, and every vercel production shape.
 * Only rule 3 (exit-code masking) survived, and only incidentally.
 *
 * This is not an exotic input. `CLAUDE.md` mandates heredoc-based multi-line
 * `git commit` invocations, so multi-line Bash payloads are the house style.
 *
 * Two adjacent normalization holes are pinned here for the same reason:
 *   - the git rules (1, 4, 11) anchor on `(^|[;&|[:space:]])git`, with no `/`,
 *     so `/usr/bin/git push --force` matches nothing. Rule 12 received exactly
 *     this fix for `vercel` (commit dd5f63509) and the git rules never did.
 *   - a leading backslash (`\git`, `\vercel`) is the standard way to bypass a
 *     shell alias, and defeats every anchored rule including the fixed rule 12.
 *
 * THESE ASSERT THE DESIRED VERDICT, NOT TODAY'S.
 * A test written against current behavior would lock the bypass in. Each case
 * below is a command that really does execute its dangerous form under bash.
 */

const REPO = resolve(__dirname, '../../..');
// GUARD_BASH_HOOK lets a candidate fix be verified against this suite before it
// is written into `.claude/hooks/` — that directory is deliberately write-denied,
// so a fix is developed against a copy and proven here first.
const HOOK = process.env.GUARD_BASH_HOOK ?? resolve(REPO, '.claude/hooks/guard-bash.sh');

/** Exit 2 = blocked; anything else = allowed. Never exit 1 (that is "hook error"). */
function runGuard(command: string): 'BLOCK' | 'ALLOW' {
  try {
    execFileSync('bash', [HOOK], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
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

/**
 * Insert a bash line-continuation after the first token. Bash strips the
 * `\` + newline before tokenizing, so this runs identically to the input.
 */
function continueAfterFirstToken(cmd: string): string {
  const [head, ...rest] = cmd.split(' ');
  return `${head} \\\n${rest.join(' ')}`;
}

/** Every dangerous shape the hook claims to block, in its plain single-line form. */
const DANGEROUS = [
  ['rule 2  — rm -rf .next', 'rm -rf .next'],
  ['rule 4  — force push', 'git push --force origin main'],
  ['rule 6  — supabase config push', 'supabase config push'],
  ['rule 7  — supabase db reset', 'supabase db reset'],
  ['rule 7b — supabase db push', 'supabase db push'],
  ['rule 8  — destructive SQL via psql', 'psql -c "drop table golf_rounds"'],
  ['rule 9  — git clean -fd', 'git clean -fd'],
  ['rule 11 — worktree inside the repo', 'git worktree add .claude/worktrees/x -b b'],
  ['rule 12 — vercel promote', 'vercel promote dpl_abc123'],
] as const;

describe('guard-bash — a line continuation must not defeat any rule', () => {
  it.each(DANGEROUS.map(([label, cmd]) => [label, continueAfterFirstToken(cmd)]))(
    'BLOCKS %s written across a continuation',
    (_label, cmd) => {
      expect(runGuard(cmd)).toBe('BLOCK');
    },
  );

  it('BLOCKS a force flag split mid-token by a continuation', () => {
    // Executes as `git push -vf origin main` — a combined force flag whose
    // `f` never appears adjacent to the `-v` the regex looks for.
    expect(runGuard('git push -v\\\nf origin main')).toBe('BLOCK');
  });

  it('BLOCKS git and push separated by a continuation', () => {
    expect(runGuard('git \\\npush --force origin main')).toBe('BLOCK');
  });

  // Regression, found in review 2026-08-26. `\\` is ONE LITERAL backslash, so
  // the newline after it ends the command — bash runs these as TWO commands and
  // the second one really does force-push. The first version of the fix joined
  // them anyway, producing `xyzgit push --force …`, which destroyed the leading
  // boundary the anchor requires and turned a block into an allow. Asserted for
  // several rules because they share that anchor.
  it.each([
    ['force push', 'xyz\\\\\ngit push --force origin main'],
    ['worktree inside the repo', 'xyz\\\\\ngit worktree add .claude/worktrees/x -b b'],
    ['vercel promote', 'xyz\\\\\nvercel promote dpl_abc123'],
  ])('BLOCKS %s that follows an escaped backslash (two real commands)', (_label, cmd) => {
    expect(runGuard(cmd)).toBe('BLOCK');
  });
});

describe('guard-bash — a path-qualified binary must not defeat any rule', () => {
  // AGENTS.md mandates repo-local, path-qualified CLI invocation, so this is
  // the form the constitution actively pushes agents toward.
  it.each([
    ['force push', '/usr/bin/git push --force origin main'],
    ['force push via homebrew path', '/opt/homebrew/bin/git push -f origin main'],
    ['git clean -fd', '/usr/bin/git clean -fd'],
    ['worktree inside the repo', '/usr/bin/git worktree add .claude/worktrees/x -b b'],
  ])('BLOCKS %s', (_label, cmd) => {
    expect(runGuard(cmd)).toBe('BLOCK');
  });
});

describe('guard-bash — a leading backslash must not defeat any rule', () => {
  // `\git` skips a shell alias or function and runs the real binary. It is a
  // documented, ordinary technique, not an obfuscation.
  it.each([
    ['force push', '\\git push --force origin main'],
    ['worktree inside the repo', '\\git worktree add .claude/worktrees/x -b b'],
    ['vercel promote', '\\vercel promote dpl_abc123'],
  ])('BLOCKS %s', (_label, cmd) => {
    expect(runGuard(cmd)).toBe('BLOCK');
  });
});

/**
 * The regression risk of normalizing is that a control stops blocking, or that
 * an ordinary command starts blocking. Both directions are asserted so a fix
 * cannot pass by simply blocking more.
 */
describe('guard-bash — normalization must not break the plain forms', () => {
  it.each(DANGEROUS)('still BLOCKS %s in its plain single-line form', (_label, cmd) => {
    expect(runGuard(cmd)).toBe('BLOCK');
  });

  it.each([
    ['a plain push', 'git push origin main'],
    ['set-upstream', 'git push -u origin main'],
    ['a multi-line commit, the house style', 'git commit -m "subject" \\\n  -m "body"'],
    ['a multi-line npm invocation', 'npm run \\\n  typecheck'],
    ['worktree outside the repo across a continuation', 'git worktree add \\\n  ../helmv3-wt -b x'],
    ['a vercel read across a continuation', 'vercel \\\n  env ls'],
    ['a docs URL mentioning vercel.com', 'curl https://vercel.com/docs'],
    ['a path containing the word git', 'cat /var/log/gitlab/x.log'],
  ])('still ALLOWS %s', (_label, cmd) => {
    expect(runGuard(cmd)).toBe('ALLOW');
  });
});
