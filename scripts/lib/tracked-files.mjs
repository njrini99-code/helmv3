/**
 * ============================================================================
 * The tracked-file set — the only legitimate scope for a ratchet.
 * ----------------------------------------------------------------------------
 * A gate that resolves its scope with a filesystem walk counts whatever the
 * person running it happens to have on disk. Two checkouts of the SAME COMMIT
 * then disagree, neither engineer can reproduce the other's result, and each
 * concludes the other is confused.
 *
 * That is not hypothetical. On 2026-08-27 `markdown-lint-ratchet.mjs` walked
 * `docs/` with `readdirSync`. `.gitignore:11` ignores the whole of
 * `docs/redesign/`, which holds 21 `.md` files, so the canonical checkout
 * linted 1,479 files where CI linted 1,458. One session measured +393, CI
 * measured -1,457, on one commit. Two sessions spent an hour disagreeing about
 * a regression that only one tree could see, and nearly wrote a fix for a
 * defect that did not exist.
 *
 * The intake rule for any new gate, from that incident:
 *   **a gate must read `git ls-files`, never the filesystem.**
 *
 * This module exists so that rule lives in one place rather than being
 * re-implemented per script — four scripts had the same defect when this was
 * written, and a rule copied four times is a rule that rots four times.
 *
 * Note the walk itself is still fine, and often necessary: a script may need to
 * SEE an on-disk directory in order to report it as excluded. What must never
 * happen is a walk's output reaching the linted set unfiltered. Use
 * `keepTracked()` on the way out.
 * ========================================================================== */
import { execFileSync } from 'node:child_process';

let cache = null;

/**
 * Every path git tracks, as a Set of repo-relative POSIX paths.
 * Cached — `git ls-files` on a large repo is not free and the answer cannot
 * change mid-run.
 *
 * @param {string} [cwd] repo root; defaults to the process cwd
 * @returns {Set<string>}
 */
export function trackedFiles(cwd = process.cwd()) {
  if (cache) return cache;
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd,
    maxBuffer: 256 * 1024 * 1024,
  }).toString('utf8');
  cache = new Set(out.split('\0').filter(Boolean));
  return cache;
}

/**
 * Filter a walk's output down to what git actually tracks.
 *
 * @param {string[]} paths repo-relative paths from a filesystem walk
 * @param {string} [cwd]
 * @returns {string[]}
 */
export function keepTracked(paths, cwd = process.cwd()) {
  const tracked = trackedFiles(cwd);
  return paths.filter((p) => tracked.has(p));
}

/** Test seam — drop the cache so a test can vary the tracked set. */
export function __resetTrackedFilesCache() {
  cache = null;
}
