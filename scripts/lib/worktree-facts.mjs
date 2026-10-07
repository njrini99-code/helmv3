/**
 * Fact gathering shared by scripts/worktree-lifecycle.mjs (the sweep) and
 * scripts/lib/remove-workspace.mjs (the WorktreeRemove hook). These talk to
 * git and gh; scripts/lib/worktree-lifecycle.mjs decides from what they return.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A git runner bound to `repo`. Returns trimmed stdout, or null on failure.
 * `raw: true` skips the trim — porcelain status lines start with a space.
 */
export function gitIn(repo) {
  return function git(a, opts = {}) {
    try {
      const out = execFileSync('git', a, {
        cwd: opts.cwd ?? repo,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return opts.raw ? out : out.trim();
    } catch {
      return null;
    }
  };
}

/**
 * PR lookup. HELM_PR_LOOKUP is the testability seam — `gh` cannot answer for
 * fixture branches that were never pushed. It receives a branch name and
 * prints "<number> <STATE> <headSha>", or "NONE".
 *
 * Returns { lookup: 'OK'|'FAILED', number, state, headSha }. A failed lookup is
 * FAILED, never NONE: #1668 exists because those were conflated.
 */
export function prFor(branch, repo) {
  const parse = (out) => {
    if (!out || out === 'NONE') return { lookup: 'OK', state: 'NONE' };
    const [num, state, sha] = out.split(/\s+/);
    return { lookup: 'OK', number: Number(num), state, headSha: sha ?? null };
  };
  const stub = process.env.HELM_PR_LOOKUP;
  try {
    if (stub) {
      return parse(execFileSync(stub, [branch], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim());
    }
    return parse(execFileSync(
      'gh',
      ['api', `repos/{owner}/{repo}/pulls?state=all&head={owner}:${branch}&per_page=1`,
       '--jq', '.[0] | if . == null then "NONE" else "\\(.number) \\(if .merged_at then "MERGED" else (.state|ascii_upcase) end) \\(.head.sha)" end'],
      { cwd: repo, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim());
  } catch {
    return { lookup: 'FAILED' };
  }
}

/** The integration trunk ref: origin/main when present, else main. */
export function trunkRef(git) {
  return git(['rev-parse', '--verify', '--quiet', 'origin/main']) ? 'origin/main' : 'main';
}

/** Commits on `ref` that are not on the trunk; null when unreadable. */
export function uniqueCommits(git, ref) {
  const n = git(['rev-list', '--count', `${trunkRef(git)}..${ref}`]);
  return n === null ? null : Number(n);
}

/**
 * Is every change `sha` makes already in the trunk? True when merging it into
 * the trunk is a no-op: `git merge-tree --write-tree` (git >= 2.38) produces the
 * trunk's own tree. Conflicts, a different tree, or an old git all answer
 * false/null — never a false "yes".
 */
export function contentInMain(git, sha) {
  if (!sha) return null;
  const trunk = trunkRef(git);
  const mainTree = git(['rev-parse', `${trunk}^{tree}`]);
  const merged = git(['merge-tree', '--write-tree', trunk, sha]);
  if (!mainTree || merged === null) return null;
  return merged.split('\n')[0] === mainTree;
}

/**
 * Predicate for effectiveDirty(): is this file's content one the repository
 * already knows — canonical's current copy, or any version the trunk has held?
 * Such a file is a stale copy, not work, so discarding it loses nothing.
 */
export function knownCopyPredicate(git, canonicalRoot) {
  const cache = new Map();
  const knownBlobs = (path) => {
    if (cache.has(path)) return cache.get(path);
    const blobs = new Set();
    const raw = git(['log', '--format=', '--raw', '--no-abbrev', trunkRef(git), '--', path]) ?? '';
    for (const line of raw.split('\n')) {
      const m = /^:\d+ \d+ ([0-9a-f]+) ([0-9a-f]+) /.exec(line);
      if (m) { blobs.add(m[1]); blobs.add(m[2]); }
    }
    if (canonicalRoot && existsSync(resolve(canonicalRoot, path))) {
      const h = git(['hash-object', resolve(canonicalRoot, path)]);
      if (h) blobs.add(h);
    }
    cache.set(path, blobs);
    return blobs;
  };
  return (worktreePath) => (path) => {
    const h = git(['hash-object', resolve(worktreePath, path)]);
    return Boolean(h) && knownBlobs(path).has(h);
  };
}

/** `.helm/workspace.json` parkPolicy, read from the checkout itself. */
export function workspaceIntent(path) {
  const f = resolve(path, '.helm/workspace.json');
  if (!existsSync(f)) return { marker: 'absent', parkPolicy: null };
  try {
    const j = JSON.parse(readFileSync(f, 'utf-8'));
    return { marker: 'present', parkPolicy: typeof j.parkPolicy === 'string' ? j.parkPolicy : null };
  } catch {
    return { marker: 'unreadable', parkPolicy: null };
  }
}

/**
 * Preserve the exact proven-merged tip before deleting its branch/ref.
 *
 * A local branch is recoverable from the reflog for a while, but that is not
 * the lifecycle guarantee: a proven-merged deletion must leave a durable,
 * named record. An existing archive tag is acceptable only when it resolves to
 * the same tip. A conflict or an inability to create/verify the tag is a hard
 * veto on the destructive operation.
 */
export function archiveBeforeDelete(git, branch, sha, prNumber, log = console.log) {
  const tag = `archive/${branch}`;
  const ref = `refs/tags/${tag}^{}`;
  const existing = git(['rev-parse', '--verify', ref]);
  if (existing !== null) {
    if (existing === sha) return true;
    log(`gc: SKIP ${branch} — ${tag} already points to ${existing.slice(0, 9)}, expected ${sha.slice(0, 9)}`);
    return false;
  }
  const message = prNumber
    ? `Archive ${branch} after PR #${prNumber} merged`
    : `Archive ${branch} after verified merge`;
  if (git(['tag', '--annotate', tag, sha, '--message', message]) === null) {
    log(`gc: SKIP ${branch} — could not create archive tag ${tag}`);
    return false;
  }
  if (git(['rev-parse', '--verify', ref]) !== sha) {
    log(`gc: SKIP ${branch} — archive tag ${tag} did not verify at ${sha.slice(0, 9)}`);
    return false;
  }
  return true;
}

/** `git status --porcelain` for `path`, untrimmed; null when unreadable. */
export function statusPorcelain(git, path) {
  return git(['status', '--porcelain'], { cwd: path, raw: true });
}

/** Restore stale copies (effectiveDirty's `ignored`) so `git worktree remove` needs no --force. */
export function restoreCopies(git, worktreePath, paths) {
  if (!paths?.length) return true;
  return git(['checkout', '--', ...paths], { cwd: worktreePath }) !== null;
}
