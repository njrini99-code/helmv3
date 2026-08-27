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
// GUARD_BASH_HOOK lets a candidate fix be verified against this suite before it
// is written into `.claude/hooks/`, which is deliberately write-denied. Defaults
// to the real hook, so CI and a bare `npm test` are unchanged.
const HOOK = process.env.GUARD_BASH_HOOK ?? resolve(REPO, '.claude/hooks/guard-bash.sh');

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

/**
 * Rule 12 — vercel production shapes, reached by the CLI path AGENTS.md mandates.
 *
 * All three of rule 12's regexes anchored on `(^|[;&|[:space:]])vercel`, so
 * `vercel` had to start the command or follow whitespace/a separator. But
 * AGENTS.md ("Helm agent canonicality") instructs every agent to use the
 * repo-local binary — `./node_modules/.bin/vercel` — where the preceding
 * character is `/`. That form matched none of the three, and the permission
 * layer did not cover it either: `Bash(vercel promote:*)` is a command-PREFIX
 * match, and the repo-local path is a different prefix. So the one production-
 * mutating CLI in this repo had ZERO coverage on BOTH layers, via exactly the
 * invocation the constitution tells agents to use. Measured 2026-08-26: 8 of 16
 * production-mutating shapes escaped.
 *
 * The fix adds `/` to the anchor class rather than removing the anchor, so
 * `vercel` still does not match as a bare substring — the ALLOW cases below
 * pin that, including URLs containing "vercel.com".
 *
 * WHY EVERY SHAPE IS ASSERTED SEPARATELY
 * --------------------------------------
 * Rule 12 nests: an outer gate, then three independent inner checks. Fixing
 * only the outer gate lets a command reach the block and fall through every
 * inner check UNBLOCKED — while a harness that tests just the gate goes green.
 * A false green on a production-promote guard is the worst possible outcome,
 * so each of `--prod`, `promote`, `rollback` and `alias set` is asserted
 * against each path form.
 */
describe('guard-bash rule 12 — vercel production shapes', () => {
  const PATH_FORMS = [
    ['bare binary', 'vercel'],
    ['repo-local (what AGENTS.md mandates)', './node_modules/.bin/vercel'],
    ['absolute repo-local', `${REPO}/node_modules/.bin/vercel`],
    ['npx', 'npx vercel'],
  ] as const;

  const PROD_SHAPES = [
    ['deploy --prod', 'deploy --prod'],
    ['promote', 'promote dpl_abc123'],
    ['rollback', 'rollback'],
    ['alias set', 'alias set x.vercel.app helm.app'],
  ] as const;

  for (const [formLabel, prefix] of PATH_FORMS) {
    it.each(PROD_SHAPES.map(([s, args]) => [s, `${prefix} ${args}`]))(
      `BLOCKS %s via ${formLabel}`,
      (_shape, cmd) => {
        expect(runGuard(cmd)).toBe('BLOCK');
      },
    );
  }

  it.each([
    ['list deployments', 'vercel ls'],
    ['inspect via repo-local', './node_modules/.bin/vercel inspect dpl_abc'],
    ['env ls via repo-local', './node_modules/.bin/vercel env ls'],
    ['logs via repo-local', './node_modules/.bin/vercel logs dpl_abc'],
    ['projects ls via npx', 'npx vercel projects ls'],
  ])('ALLOWS read-only %s', (_label, cmd) => {
    // The daily reliability workflow reads Vercel; only mutation is barred.
    expect(runGuard(cmd)).toBe('ALLOW');
  });

  it.each([
    ['a docs URL', 'curl https://vercel.com/docs'],
    ['a URL in prose', 'echo see https://vercel.com for details'],
  ])('does not fire on %s', (_label, cmd) => {
    // Adding `/` to the anchor must not turn every vercel.com mention into a
    // block — the trailing ([[:space:]]|$) is what keeps this correct.
    expect(runGuard(cmd)).toBe('ALLOW');
  });
});

/**
 * Security scan CLAUDE-SECURITY-20260826-224016, findings F3 + F4.
 *
 * Both were confirmed by running this hook before the fix: `/usr/bin/git push
 * --force`, `\git push --force` and a backslash-newline continuation all
 * reached exit 0 (allow), while the same commands on one line blocked. The
 * `vercel` rule was already immune because #1627 had added `/` to ITS anchor —
 * the git rules were simply never given the same fix.
 *
 * These rules are the last blocking layer on shared-history rewrite and on
 * repo-global stash theft, and `Bash(git push:*)` is allow-listed, so a bypass
 * here is not theoretical.
 */
describe('guard-bash — git invocation shapes that used to bypass every git rule', () => {
  describe('F4: the anchor must recognise path-qualified and escaped git', () => {
    it.each([
      ['absolute path', '/usr/bin/git push --force'],
      ['homebrew path', '/opt/homebrew/bin/git push -f'],
      // A leading backslash is the standard way to skip a shell alias or
      // function, and bash strips it before tokenizing — so this runs git.
      ['backslash-escaped', '\\git push --force'],
    ])('blocks a force push via %s', (_label, cmd) => {
      expect(runGuard(cmd)).toBe('BLOCK');
    });

    it('blocks git stash via an absolute path', () => {
      expect(runGuard('/usr/bin/git stash')).toBe('BLOCK');
    });

    it('blocks an in-repo worktree add via an absolute path', () => {
      expect(runGuard('/usr/bin/git worktree add .worktrees/x')).toBe('BLOCK');
    });
  });

  describe('F3: bash line-continuations are collapsed before matching', () => {
    it.each([
      ['between git and push', 'git \\\n  push --force'],
      ['before the force flag', 'git push \\\n  --force'],
      ['inside the subcommand', 'git \\\n  stash'],
    ])('blocks a continuation %s', (_label, cmd) => {
      // grep matches one LINE at a time; bash joins these into one command.
      // Without normalisation the two halves never share a grep record.
      expect(runGuard(cmd)).toBe('BLOCK');
    });
  });

  describe('the normalisation must not manufacture blocks', () => {
    it('leaves a BARE newline alone, so two benign commands stay separate', () => {
      // Eating bare newlines would join unrelated commands into one record and
      // invent matches that the shell would never produce.
      expect(runGuard('git status\ngit log --oneline -1')).toBe('ALLOW');
    });

    it.each([
      ['a normal push', 'git push origin br:refs/heads/br'],
      ['a read-only stash query', 'git stash list'],
      ['git mentioned inside a grep pattern', 'grep -n "git push" README.md'],
      ['plain status', 'git status'],
    ])('still allows %s', (_label, cmd) => {
      expect(runGuard(cmd)).toBe('ALLOW');
    });
  });
});
