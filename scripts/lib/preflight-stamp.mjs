#!/usr/bin/env node
/**
 * preflight-stamp.mjs — the record that `npm run preflight` passed, and the
 * one check every consumer uses to decide whether it still applies.
 *
 * The stamp (`.helm/runtime/preflight.json`, gitignored, per checkout) names
 * the git TREE preflight tested, not just the commit. Preflight may run
 * before the commit exists: it hashes the tracked working tree (index plus
 * unstaged edits to tracked files) into a tree object. A commit made from
 * exactly those files has that same tree, so committing after a green
 * preflight does not force a re-run; any edit afterwards does.
 *
 * Consumers: scripts/preflight.mjs (writes), .githooks/pre-push and
 * .claude/hooks/require-preflight.mjs (verify).
 *
 * CLI:  node scripts/lib/preflight-stamp.mjs verify [<rev>]   exit 0 = stamp matches
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STAMP_PATH = '.helm/runtime/preflight.json';

function git(root, args, env) {
  return execFileSync('git', args, {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: env ?? process.env,
  }).trim();
}

/** Tree object of a revision, or null when it does not resolve. */
export function treeOf(root, rev = 'HEAD') {
  try {
    return git(root, ['rev-parse', `${rev}^{tree}`]);
  } catch {
    return null;
  }
}

/**
 * Tree object of the tracked working tree: the index with every tracked
 * file's current content staged. Uses a throwaway copy of the index, so the
 * real index is never touched. Untracked files are not included (see
 * untrackedFiles()).
 */
export function workingTreeHash(root) {
  const gitIndex = resolve(root, git(root, ['rev-parse', '--git-path', 'index']));
  const tmpIndex = join(tmpdir(), `helm-preflight-index-${process.pid}-${Date.now()}`);
  try {
    if (existsSync(gitIndex)) copyFileSync(gitIndex, tmpIndex);
    const env = { ...process.env, GIT_INDEX_FILE: tmpIndex };
    git(root, ['add', '--update', '--', '.'], env);
    return git(root, ['write-tree'], env);
  } finally {
    rmSync(tmpIndex, { force: true });
  }
}

/** Untracked, non-ignored paths (present during checks but not in the stamped tree). */
export function untrackedFiles(root) {
  try {
    return git(root, ['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export function readStamp(root) {
  try {
    return JSON.parse(readFileSync(join(root, STAMP_PATH), 'utf8'));
  } catch {
    return null;
  }
}

export function writeStamp(root, data) {
  const path = join(root, STAMP_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  return path;
}

/**
 * Does the stamp cover `rev`? Returns { ok, reason, stamp, tree }.
 * Any mode counts (fast or full); the stamp's tree must equal rev's tree.
 */
export function verifyStamp(root, rev = 'HEAD') {
  const tree = treeOf(root, rev);
  if (!tree) return { ok: false, reason: `cannot resolve ${rev}`, stamp: null, tree: null };
  const stamp = readStamp(root);
  if (!stamp) return { ok: false, reason: `no preflight stamp (${STAMP_PATH} missing)`, stamp, tree };
  if (stamp.treeHash !== tree) {
    return { ok: false, reason: `preflight stamp is for a different tree (files changed since the last green preflight at ${String(stamp.headSha ?? '').slice(0, 9)})`, stamp, tree };
  }
  return { ok: true, reason: `preflight (${stamp.mode}) passed for this tree at ${stamp.finishedAt ?? '?'}`, stamp, tree };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, rev = 'HEAD'] = process.argv.slice(2);
  if (cmd !== 'verify') {
    console.error('usage: node scripts/lib/preflight-stamp.mjs verify [<rev>]');
    process.exit(2);
  }
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel']);
  const r = verifyStamp(isAbsolute(root) ? root : process.cwd(), rev);
  console.log(r.reason);
  process.exit(r.ok ? 0 : 1);
}
