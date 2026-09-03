// Shared fixture-repo builder for Janitor classifier tests.
//
// Several classifiers shell out to real git (`git ls-files`, `git grep`,
// `git log`) rather than walking the filesystem directly — deliberately,
// per lib/repo.mjs's header comment about the .worktrees/ incident. Testing
// them faithfully means giving them a REAL, disposable git repository, not
// mocking git out from under them.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

function git(repoRoot, args, env) {
  execFileSync('git', args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
}

/**
 * Create a throwaway git repo at a temp path, write `files` (a map of
 * relative-path -> content), and commit them all. Returns the repo path.
 * `files` entries may set a `commitDate` (an ISO string) via the special
 * `__commitDates` map to backdate a file's last-commit age for the
 * stale-todos classifier — git honors GIT_AUTHOR_DATE/GIT_COMMITTER_DATE on
 * the commit that introduces the file.
 */
export function makeFixtureRepo(files, { commitDates = {} } = {}) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'janitor-fixture-'));
  git(repoRoot, ['init', '-q']);
  git(repoRoot, ['config', 'user.email', 'janitor-test@example.invalid']);
  git(repoRoot, ['config', 'user.name', 'Janitor Test']);

  // Group files by commitDate so each date becomes its own commit (files
  // with no explicit date go in a final "recent" commit).
  const byDate = new Map();
  for (const [path, content] of Object.entries(files)) {
    const date = commitDates[path] ?? null;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push([path, content]);
  }

  for (const [date, entries] of byDate.entries()) {
    for (const [path, content] of entries) {
      const full = join(repoRoot, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    git(repoRoot, ['add', '-A']);
    const env = date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {};
    git(repoRoot, ['commit', '-q', '-m', `fixture: ${date ?? 'recent'}`], env);
  }

  return repoRoot;
}

export function cleanupFixtureRepo(repoRoot) {
  rmSync(repoRoot, { recursive: true, force: true });
}

export async function withFixtureRepo(files, options, fn) {
  const actualFn = typeof options === 'function' ? options : fn;
  const actualOptions = typeof options === 'function' ? {} : options;
  const repoRoot = makeFixtureRepo(files, actualOptions);
  try {
    return await actualFn(repoRoot);
  } finally {
    cleanupFixtureRepo(repoRoot);
  }
}
