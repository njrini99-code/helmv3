/**
 * Fact gathering shared by scripts/worktree-lifecycle.mjs (the sweep) and
 * scripts/lib/remove-workspace.mjs (the WorktreeRemove hook). These talk to
 * git and gh; scripts/lib/worktree-lifecycle.mjs decides from what they return.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';

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

// ---------------------------------------------------------------------------
// Processes whose working directory is inside a checkout
// ---------------------------------------------------------------------------
//
// This used to run `lsof +D <worktree>` once per checkout. `+D` walks the whole
// directory tree looking for open files, which on a worktree with a symlinked
// or populated node_modules took minutes per row. Only a process's CWD matters
// here, and `lsof -d cwd` lists exactly those for every process in one call.
// One scan, then a prefix match per checkout.
//
// The matcher is deliberately NOT less sensitive than `+D` was: it reports a
// holder for a shell or Claude session sitting anywhere under the checkout, and
// an unreadable scan answers `null` (unknown), never "no".

/**
 * Parse `lsof -d cwd -Fpn` output into { pid, path } pairs.
 * Field output is one tagged field per line: `p<pid>`, `fcwd`, `n<path>`.
 *
 * @param {string} output
 * @returns {Array<{ pid: number, path: string }>}
 */
export function parseCwdHolders(output) {
  const holders = [];
  let pid = NaN;
  for (const line of String(output).split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    else if (line.startsWith('n') && Number.isInteger(pid)) holders.push({ pid, path: line.slice(1) });
  }
  return holders;
}

/**
 * Whether any holder's cwd is `dir` or below it. Compares both the path as
 * given and its realpath, because lsof reports resolved paths (/private/var)
 * while git may record the symlinked one (/var).
 *
 * @param {Array<{ pid: number, path: string }>} holders
 * @param {string} dir
 * @param {(p: string) => string} [real]
 */
export function hasCwdHolderIn(holders, dir, real = (p) => realpathSync(p)) {
  const roots = new Set([resolve(dir)]);
  try {
    roots.add(real(dir));
  } catch {
    /* directory gone or unreadable: the literal path still counts */
  }
  return holders.some((h) => [...roots].some((r) => h.path === r || h.path.startsWith(r + sep)));
}

let cwdHoldersCache;

/**
 * One scan of every process's cwd, cached for the life of this process.
 * Returns null when lsof is absent or produced nothing it could report.
 *
 * @param {(cmd: string, args: string[], opts: object) => string} [exec]
 */
export function listCwdHolders(exec = execFileSync) {
  if (cwdHoldersCache !== undefined && exec === execFileSync) return cwdHoldersCache;
  let out;
  try {
    out = exec('lsof', ['-d', 'cwd', '-Fpn'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    // lsof exits 1 when it could not stat SOME process (permission); the
    // output it did produce is still valid. No output at all means unknown.
    out = e && typeof e.stdout === 'string' && e.stdout.length > 0 ? e.stdout : null;
  }
  const result = out === null ? null : parseCwdHolders(out);
  if (exec === execFileSync) cwdHoldersCache = result;
  return result;
}

/**
 * True/false when known, null when lsof could not answer.
 * @param {string} dir
 */
export function hasLiveProcessIn(dir, exec) {
  const holders = listCwdHolders(exec);
  return holders === null ? null : hasCwdHolderIn(holders, dir);
}
