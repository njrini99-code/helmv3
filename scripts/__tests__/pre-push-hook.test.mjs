// Fixture-repo tests for .githooks/pre-push.
//
// Each test builds a small, disposable git repository under the OS temp
// dir, feeds the real hook script (resolved from THIS repo, never copied)
// a fake `<local ref> <local sha> <remote ref> <remote sha>` stdin line —
// exactly the shape git itself writes to a pre-push hook's stdin — and
// asserts on its exit code and printed output. The hook resolves its own
// REPO_ROOT via `git rev-parse --show-toplevel` against the process cwd, so
// running it with `cwd` pointed at the fixture makes it operate entirely on
// the fixture's files; nothing here touches this repo's real
// docs/generated/ or git state.
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK = resolve(process.cwd(), '.githooks/pre-push');

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

// What the fixture's stand-in generator always (re)writes, regardless of
// what was committed — this is what makes "stale" and "clean" different:
// stale commits something else under docs/generated/GENERATED.md, clean
// commits exactly this.
const REGENERATED_CONTENT = 'REGENERATED\n';

/**
 * Build a minimal fixture repo with a fake but real chain of the npm
 * scripts the hook shells out to for the generated-docs step, so the hook
 * exercises its real regenerate-then-diff logic against fake generators
 * instead of a special test-only code path.
 *
 * `committedContent` is what docs/generated/GENERATED.md holds in the base
 * commit — passing `REGENERATED_CONTENT` makes the base commit already
 * "current" (clean); anything else makes the generator's next run produce a
 * diff (stale).
 */
function makeFixture(committedContent) {
  const dir = mkdtempSync(join(tmpdir(), 'pre-push-hook-'));
  tempDirs.push(dir);

  git(['init', '--quiet'], dir);
  git(['config', 'user.email', 'test@example.com'], dir);
  git(['config', 'user.name', 'Test'], dir);
  git(['config', 'commit.gpgsign', 'false'], dir);

  mkdirSync(join(dir, 'docs', 'generated'), { recursive: true });
  mkdirSync(join(dir, 'scripts'), { recursive: true });

  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'pre-push-hook-fixture',
        private: true,
        scripts: {
          'knowledge:doc-inventory': 'node scripts/gen-fixture-docs.mjs',
          'knowledge:world-model': 'node -e "process.exit(0)"',
          'knowledge:feature-map': 'node -e "process.exit(0)"',
          'knowledge:entry-points': 'node -e "process.exit(0)"',
          'markdown:ratchet': 'node scripts/markdown-lint-ratchet.mjs',
        },
      },
      null,
      2
    )
  );

  // Stand-in for the real four `knowledge:*` generators the hook chains
  // together — one script that ALWAYS writes REGENERATED_CONTENT is enough
  // to prove the hook's regenerate-then-diff logic; the other three scripts
  // above are no-ops that only prove the `&&` chain runs them.
  writeFileSync(
    join(dir, 'scripts', 'gen-fixture-docs.mjs'),
    `#!/usr/bin/env node\nimport { writeFileSync as w } from 'node:fs';\nw('docs/generated/GENERATED.md', ${JSON.stringify(REGENERATED_CONTENT)});\n`
  );

  // Stand-in for the real scripts/markdown-lint-ratchet.mjs: the hook calls
  // it by path directly (not through npm run), so the fixture needs a file
  // there too. Always exits 0 — this test is about the generated-docs step,
  // not the markdown ratchet itself.
  writeFileSync(join(dir, 'scripts', 'markdown-lint-ratchet.mjs'), '#!/usr/bin/env node\nprocess.exit(0);\n');

  // Committed docs/generated content — whatever the caller passed as the
  // "already on disk" version. Matching REGENERATED_CONTENT makes the next
  // regen a no-op diff (clean); anything else makes it produce one (stale).
  writeFileSync(join(dir, 'docs', 'generated', 'GENERATED.md'), committedContent);
  writeFileSync(join(dir, 'docs', 'foo.md'), '# Foo\n');

  git(['add', '.'], dir);
  git(['commit', '--quiet', '-m', 'base'], dir);
  const base = git(['rev-parse', 'HEAD'], dir);

  return { dir, base };
}

function runHook({ cwd, localSha, remoteSha, env = {} }) {
  const stdin = `refs/heads/test ${localSha} refs/heads/test ${remoteSha}\n`;
  try {
    const stdout = execFileSync('bash', [HOOK], {
      cwd,
      input: stdin,
      encoding: 'utf-8',
      env: { ...process.env, ...env },
    });
    return { status: 0, output: stdout };
  } catch (err) {
    return { status: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe('.githooks/pre-push', () => {
  it('skips entirely when HELM_SKIP_PREPUSH=1', () => {
    const { dir, base } = makeFixture('NEW\n');
    const result = runHook({ cwd: dir, localSha: base, remoteSha: base, env: { HELM_SKIP_PREPUSH: '1' } });
    expect(result.status).toBe(0);
    expect(result.output).toContain('HELM_SKIP_PREPUSH=1');
    expect(result.output).toContain('SKIPPED');
  });

  it('fails the push when regenerating docs/generated/ produces a diff (stale)', () => {
    // The fixture's regen script always writes "NEW\n"; committing
    // docs/generated/GENERATED.md as "OLD\n" guarantees a diff once the
    // hook re-runs it.
    const { dir, base } = makeFixture('OLD\n');
    writeFileSync(join(dir, 'docs', 'foo.md'), '# Foo\n\nAnother line.\n');
    git(['add', '.'], dir);
    git(['commit', '--quiet', '-m', 'edit docs'], dir);
    const head = git(['rev-parse', 'HEAD'], dir);

    const result = runHook({ cwd: dir, localSha: head, remoteSha: base });

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('generated docs were stale');
    expect(result.output).toContain('commit docs/generated and push again');
  });

  it('passes a clean docs change whose generated output already matches', () => {
    // Committed docs/generated/GENERATED.md already equals what the regen
    // script produces, so re-running it makes no diff.
    const { dir, base } = makeFixture(REGENERATED_CONTENT);
    writeFileSync(join(dir, 'docs', 'foo.md'), '# Foo\n\nAnother line.\n');
    git(['add', '.'], dir);
    git(['commit', '--quiet', '-m', 'edit docs'], dir);
    const head = git(['rev-parse', 'HEAD'], dir);

    const result = runHook({ cwd: dir, localSha: head, remoteSha: base });

    expect(result.status).toBe(0);
    expect(result.output).toContain('generated docs OK');
    expect(result.output).not.toContain('FAILED');
  });
});
