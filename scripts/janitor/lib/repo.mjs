/**
 * Shared, dependency-free repo-reading helpers for the Janitor classifiers.
 *
 * Every listing here goes through `git ls-files` / `git grep` / `git log`,
 * NEVER a raw filesystem walk. This repo has a recorded incident about
 * exactly the alternative: an internal `.worktrees/` checkout held more
 * .ts/.tsx files than `src/` itself, and `find`/`grep` do not honour
 * .gitignore, so a filesystem walk returns two hits for essentially every
 * file and a classifier can silently report on a copy nobody ships. See
 * scripts/knowledge/document-inventory.mjs's own header for the same rule
 * applied to that generator.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function git(repoRoot, args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Tracked files matching one or more pathspecs (globs), e.g. 'src/**\/*.ts'. */
export function lsFiles(repoRoot, pathspecs) {
  const args = ['ls-files', '--', ...(Array.isArray(pathspecs) ? pathspecs : [pathspecs])];
  const out = git(repoRoot, args);
  return out.split('\n').filter(Boolean);
}

/**
 * `git grep -n -E <pattern>` over one or more tracked pathspecs.
 * Returns [] on "no matches" (git grep exit 1), which is not an error here.
 * Throws on a real git-grep failure (exit >1 — bad pattern, not a repo, etc).
 *
 * NOTE: `-E` is POSIX Extended Regular Expressions, NOT PCRE — `\d`, `\w`
 * etc. are not supported and silently match nothing rather than erroring.
 * Use `[0-9]` / `[A-Za-z0-9_]` character classes instead. See
 * classifiers/abandoned-experiments.mjs's comment for the incident this
 * caused (a false-ZERO, the same failure class as a semgrep bad-path-glob).
 */
export function grep(repoRoot, pattern, pathspecs, { caseInsensitive = false } = {}) {
  const args = ['grep', '-n', '-E'];
  if (caseInsensitive) args.push('-i');
  args.push('--', pattern);
  if (pathspecs) args.push('--', ...(Array.isArray(pathspecs) ? pathspecs : [pathspecs]));
  try {
    const out = execFileSync('git', args, { cwd: repoRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    return parseGrepLines(out);
  } catch (err) {
    if (err.status === 1) return []; // no matches — not a failure
    throw err;
  }
}

function parseGrepLines(out) {
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(':');
      const idx2 = line.indexOf(':', idx + 1);
      if (idx === -1 || idx2 === -1) return { file: line, lineNo: null, text: '' };
      return {
        file: line.slice(0, idx),
        lineNo: Number(line.slice(idx + 1, idx2)),
        text: line.slice(idx2 + 1),
      };
    });
}

/**
 * Unix-epoch seconds of the last commit that touched `file`, or null if git
 * has no history for it (untracked, or a fresh worktree with a shallow
 * clone that does not reach the file's last real commit).
 */
export function lastCommitEpoch(repoRoot, file) {
  try {
    const out = git(repoRoot, ['log', '-1', '--format=%ct', '--', file]).trim();
    return out ? Number(out) : null;
  } catch {
    return null;
  }
}

export function daysSince(epochSeconds) {
  if (epochSeconds === null || !Number.isFinite(epochSeconds)) return null;
  return Math.floor((Date.now() / 1000 - epochSeconds) / 86400);
}

export function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

export function lineCount(path) {
  const content = readFileSync(path, 'utf-8');
  if (content.length === 0) return 0;
  return content.split('\n').length;
}

export function fileExists(repoRoot, relPath) {
  return existsSync(join(repoRoot, relPath));
}

export function statOrNull(path) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}
