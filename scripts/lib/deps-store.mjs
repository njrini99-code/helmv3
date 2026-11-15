/**
 * node_modules for every checkout, as a copy-on-write clone of a store entry
 * keyed by the lockfile.
 *
 * WHY
 *
 * Each of the earlier ways to give a worktree its dependencies broke something:
 *   - a symlink to the canonical checkout's node_modules (create-workspace's
 *     old default): Turbopack refuses a node_modules outside the project root;
 *     an npm write through the link (even --package-lock-only) rewrites the
 *     canonical tree for everyone (2026-10-10, again 2026-11-15); and the
 *     canonical tree drifts from main (70 packages behind on 2026-11-15), so a
 *     linked worktree tests against versions its lockfile does not pin;
 *   - a private `npm ci` per worktree: about 2-4 GiB each, which took the
 *     volume to zero bytes free on 2026-08-29 and again on 2026-11-15;
 *   - nothing (a raw `git worktree add`, a Desktop session, an isolated
 *     subagent): no tests, no `npx --no-install` tools.
 *
 * On APFS, `cp -c` clones files: a 2.1 GiB node_modules cloned in 11 s and cost
 * 23 MiB (measured 2026-11-15), and every native binary (esbuild, Next's SWC),
 * vitest and `next dev` ran from the clone. A clone is a real directory, so
 * Turbopack accepts it, and writes into it never reach the source.
 *
 * THE STORE
 *
 * <HELM_DEPS_STORE or ~/.helm/deps-store>/<key>/node_modules, where key hashes
 * package-lock.json with the Node ABI, platform and arch (native modules are
 * built per ABI). An entry is filled only from a fresh `npm ci` against that
 * lockfile, or from an install whose node_modules/.package-lock.json matches
 * the lockfile entry by entry. It is built in a temp dir, renamed into place,
 * and complete.json is written last, so a half-built entry is never a hit. An
 * mkdir lock keeps two sessions from filling the same entry at once.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** Written inside a checkout's node_modules: which store key the tree is. */
export const MARKER = '.helm-deps.json';
/** Written last in a store entry: the entry is whole. */
export const COMPLETE = 'complete.json';
/** A seeding lock older than this is left over from a crash. */
export const STALE_LOCK_MS = 30 * 60 * 1000;

export function storeRoot(env = process.env) {
  return resolve(env.HELM_DEPS_STORE || join(homedir(), '.helm', 'deps-store'));
}

export function depsKey({ lockText, abi = process.versions.modules, platform = process.platform, arch = process.arch }) {
  return createHash('sha256').update(`${platform}-${arch}-abi${abi}\n`).update(lockText).digest('hex').slice(0, 16);
}

/** The key for a checkout's own package-lock.json, or null when it has none. */
export function keyForDir(dir, runtime = {}) {
  try {
    return depsKey({ lockText: readFileSync(join(dir, 'package-lock.json'), 'utf-8'), ...runtime });
  } catch {
    return null;
  }
}

/** 'missing' | 'dir' | 'link' | 'dangling' for <dir>/node_modules. */
export function nodeModulesKind(dir) {
  const p = join(dir, 'node_modules');
  try {
    if (!lstatSync(p).isSymbolicLink()) return 'dir';
    return existsSync(p) ? 'link' : 'dangling';
  } catch {
    return 'missing';
  }
}

export function readMarker(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'node_modules', MARKER), 'utf-8'));
  } catch {
    return null;
  }
}

export function writeMarker(dir, info) {
  writeFileSync(join(dir, 'node_modules', MARKER), `${JSON.stringify({ ...info, at: new Date().toISOString() }, null, 2)}\n`);
}

/**
 * Does an installed tree (node_modules/.package-lock.json) hold exactly what a
 * lockfile pins? Every node_modules/* entry must be installed at its version;
 * an optional one may be absent (platform packages such as @esbuild/linux-x64).
 */
export function installMatchesLock(lock, hidden) {
  const want = lock?.packages;
  const have = hidden?.packages;
  if (!want || !have) return { ok: false, mismatches: ['unreadable lockfile or install record'] };
  const mismatches = [];
  for (const [path, entry] of Object.entries(want)) {
    if (!path.startsWith('node_modules/')) continue;
    const got = have[path];
    if (!got) {
      if (!entry.optional) mismatches.push(`missing ${path}`);
      continue;
    }
    if (got.version !== entry.version) mismatches.push(`${path} ${got.version} != ${entry.version}`);
  }
  return { ok: mismatches.length === 0, mismatches };
}

/**
 * Does a checkout's node_modules hold its lockfile's tree? Both the install
 * record (node_modules/.package-lock.json) AND each installed package.json
 * must agree: on 2026-11-15 a write through a symlink rewrote the record to
 * list versions that were not installed, so the record alone is not proof.
 * About 1,000 small reads.
 */
export function dirMatchesLock(dir) {
  let lock;
  try {
    lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf-8'));
    const record = installMatchesLock(lock, JSON.parse(readFileSync(join(dir, 'node_modules', '.package-lock.json'), 'utf-8')));
    if (!record.ok) return record;
  } catch {
    return { ok: false, mismatches: ['unreadable lockfile or install record'] };
  }
  const mismatches = [];
  for (const [path, entry] of Object.entries(lock.packages || {})) {
    if (!path.startsWith('node_modules/') || entry.link) continue;
    let installed;
    try {
      installed = JSON.parse(readFileSync(join(dir, path, 'package.json'), 'utf-8')).version;
    } catch {
      if (!entry.optional) mismatches.push(`missing ${path}/package.json`);
      continue;
    }
    // npm records the cleaned semver: a package.json "v0.0.10" is "0.0.10" in the lockfile.
    const clean = (v) => String(v ?? '').trim().replace(/^[v=]+/, '');
    if (clean(installed) !== clean(entry.version)) mismatches.push(`${path} installed ${installed} != ${entry.version}`);
  }
  return { ok: mismatches.length === 0, mismatches };
}

/** Build caches that must not travel from one checkout into the store. */
export const CACHE_DIRS = Object.freeze(['.cache', '.vite']);

/** Remove leftover clone temp dirs (a killed hook) older than STALE_LOCK_MS. */
export function clearStaleTemps(dir, now = Date.now()) {
  let removed = 0;
  try {
    for (const name of readdirSync(dir)) {
      if (!name.startsWith('node_modules.tmp-')) continue;
      const p = join(dir, name);
      if (now - statSync(p).mtimeMs > STALE_LOCK_MS) {
        rmSync(p, { recursive: true, force: true });
        removed += 1;
      }
    }
  } catch {
    /* nothing to clear */
  }
  return removed;
}

/**
 * What to do for one checkout. Pure.
 *   none    no package-lock.json
 *   ok      node_modules is this lockfile's tree (marker)
 *   adopt   an unmarked tree that matches the lockfile: mark it, and seed the store from it
 *   stale   a real tree for some other lockfile: replace only when asked (--refresh)
 *   clone   no usable tree, the store has this key
 *   install no usable tree, the store does not have this key
 * A symlinked or dangling node_modules is never kept: `replace` says the link goes first.
 */
export function depsPlan({ key, kind, markerKey = null, installMatches = false, hit = false }) {
  if (!key) return { action: 'none', replace: false, why: 'no package-lock.json' };
  if (kind === 'dir') {
    if (markerKey === key) return { action: 'ok', replace: false, why: 'node_modules is this lockfile’s tree' };
    if (installMatches) return { action: 'adopt', replace: false, why: 'the installed tree matches this lockfile' };
    return { action: 'stale', replace: false, why: 'node_modules was installed for a different lockfile' };
  }
  const replace = kind === 'link' || kind === 'dangling';
  if (hit) return { action: 'clone', replace, why: 'the store has this lockfile’s tree' };
  return { action: 'install', replace, why: 'the store has no tree for this lockfile yet' };
}

export function entryDir(key, root = storeRoot()) {
  return join(root, key);
}

export function storeHit(key, root = storeRoot()) {
  const entry = entryDir(key, root);
  return existsSync(join(entry, COMPLETE)) && existsSync(join(entry, 'node_modules'));
}

export function sameVolume(a, b) {
  try {
    return statSync(a).dev === statSync(b).dev;
  } catch {
    return false;
  }
}

/**
 * Default copier. macOS: APFS clonefile through `cp -c` (callers check the
 * volume first; a cross-volume clone is never attempted). Elsewhere (CI):
 * GNU cp with --reflink=auto, which clones where the filesystem can.
 */
export function cloneDir(src, dest) {
  const args = process.platform === 'darwin' ? ['-cR', src, dest] : ['-R', '--reflink=auto', src, dest];
  const r = spawnSync('cp', args, { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf-8' });
  return r.status === 0 ? { ok: true } : { ok: false, error: (r.stderr || '').trim() || `cp exited ${r.status}` };
}

/** Copy src into destNodeModules through a temp dir and one rename: never a half tree. */
export function placeClone({ src, destNodeModules, copier = cloneDir }) {
  const tmp = `${destNodeModules}.tmp-${process.pid}-${Date.now()}`;
  rmSync(tmp, { recursive: true, force: true });
  const r = copier(src, tmp);
  if (!r.ok) {
    rmSync(tmp, { recursive: true, force: true });
    return r;
  }
  try {
    renameSync(tmp, destNodeModules);
  } catch (error) {
    rmSync(tmp, { recursive: true, force: true });
    return { ok: false, error: `could not move the clone into place: ${error.message}` };
  }
  return { ok: true };
}

function takeLock(lock) {
  try {
    mkdirSync(lock);
    return true;
  } catch {
    try {
      if (Date.now() - statSync(lock).mtimeMs > STALE_LOCK_MS) {
        rmSync(lock, { recursive: true, force: true });
        mkdirSync(lock);
        return true;
      }
    } catch {
      /* another session won the race */
    }
    return false;
  }
}

/** Add a tree to the store under key, from a node_modules known to match that key. */
export function seedStore({ key, fromNodeModules, root = storeRoot(), copier = cloneDir, source }) {
  if (storeHit(key, root)) return { ok: true, already: true };
  mkdirSync(root, { recursive: true });
  const lock = join(root, `${key}.lock`);
  if (!takeLock(lock)) return { ok: false, busy: true, error: 'another session is filling this store entry' };
  const entry = entryDir(key, root);
  const tmp = `${entry}.tmp-${process.pid}`;
  try {
    if (storeHit(key, root)) return { ok: true, already: true };
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    const r = copier(fromNodeModules, join(tmp, 'node_modules'));
    if (!r.ok) return r;
    rmSync(join(tmp, 'node_modules', MARKER), { force: true });
    for (const cache of CACHE_DIRS) rmSync(join(tmp, 'node_modules', cache), { recursive: true, force: true });
    rmSync(entry, { recursive: true, force: true });
    renameSync(tmp, entry);
    writeFileSync(join(entry, COMPLETE), `${JSON.stringify({ key, source, at: new Date().toISOString() }, null, 2)}\n`);
    return { ok: true };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(lock, { recursive: true, force: true });
  }
}

/** Complete store entries, newest first. */
export function listEntries(root = storeRoot()) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const name of readdirSync(root)) {
    try {
      const info = JSON.parse(readFileSync(join(root, name, COMPLETE), 'utf-8'));
      out.push({ key: name, at: info.at || null, source: info.source || null });
    } catch {
      /* not a complete entry */
    }
  }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** Which entries to keep: main's key, every key a checkout uses, and the newest few. Pure. */
export function gcPlan({ entries, referenced, mainKey, keepNewest = 3 }) {
  const newest = [...entries].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const keep = new Set(newest.slice(0, Math.max(0, keepNewest)).map((e) => e.key));
  if (mainKey && entries.some((e) => e.key === mainKey)) keep.add(mainKey);
  for (const e of entries) if (referenced.has(e.key)) keep.add(e.key);
  return { keep: [...keep], remove: entries.map((e) => e.key).filter((k) => !keep.has(k)) };
}
