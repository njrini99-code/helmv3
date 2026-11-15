#!/usr/bin/env node
/**
 * Give a checkout its node_modules: an APFS clone of the deps store when this
 * lockfile has an entry, one real `npm ci` (which then fills the store) when it
 * does not. scripts/lib/deps-store.mjs has the why and the store layout.
 *
 * A clone is a real directory that costs about 25 MiB and 10 s, so every
 * worktree gets a correct tree for its own lockfile: no symlinks (Turbopack
 * refuses them and npm writes through them), no stale canonical tree, and no
 * 2-4 GiB private install per worktree.
 *
 * Who calls it: create-workspace.mjs (new-worktree.sh, the WorktreeCreate hook),
 * .githooks/post-checkout (every `git worktree add`, clone only), the
 * deps-hygiene SessionStart hook (clone only), check-changed and the replay
 * runner (--check, then install).
 *
 * THE DISK POLICY, and why it is two numbers rather than one
 *
 *   HELM_DISK_RESERVE_GIB   (12)  never spend below this. It is not headroom
 *                                 for the install — it is the floor that keeps
 *                                 the MACHINE usable. On 2026-08-29 the volume
 *                                 reached zero bytes and nothing could run at
 *                                 all: writing a command's output failed, so no
 *                                 command could be issued to clean up. The
 *                                 reserve exists so that state is unreachable.
 *   HELM_INSTALL_BUDGET_GIB (5)   conservative estimate of one install. The
 *                                 measured cost was 1.9-3.8 GiB; the budget is
 *                                 deliberately larger, because the observed
 *                                 cost of one day is not a promise about the
 *                                 next.
 *   HELM_CLONE_RESERVE_GIB (2)    a clone's own floor (cloneDecision says why it is not 12).
 *   HELM_CLONE_BUDGET_GIB (0.5)   a clone's cost (measured 23 MiB) with room.
 *
 * An install needs 12 + 5 GiB free; a clone needs 2 + 0.5 GiB free.
 *
 * Usage: node scripts/ensure-worktree-deps.mjs [dir] [--check] [--clone-only] [--refresh] [--quiet]
 *        node scripts/ensure-worktree-deps.mjs --gc
 *   --check       say whether the checkout is ready or could be made ready; change nothing
 *   --clone-only  never run npm ci (hooks): clone on a store hit, otherwise say how to fill it
 *   --refresh     replace a node_modules installed for a different lockfile
 *   --gc          remove store entries no checkout uses (keeps main's and the newest 3)
 * The last stdout line is always `deps: <state>`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  clearStaleTemps,
  depsKey,
  depsPlan,
  dirMatchesLock,
  entryDir,
  gcPlan,
  keyForDir,
  listEntries,
  nodeModulesKind,
  placeClone,
  readMarker,
  sameVolume,
  seedStore,
  storeHit,
  storeRoot,
  writeMarker,
} from './lib/deps-store.mjs';

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const CLONE_ONLY = args.includes('--clone-only');
const REFRESH = args.includes('--refresh');
const GC = args.includes('--gc');
const QUIET = args.includes('--quiet');
const DIR = resolve(args.find((a) => !a.startsWith('--')) ?? process.cwd());

export const RESERVE_GIB = Number(process.env.HELM_DISK_RESERVE_GIB ?? 12);
export const BUDGET_GIB = Number(process.env.HELM_INSTALL_BUDGET_GIB ?? 5);
export const CLONE_RESERVE_GIB = Number(process.env.HELM_CLONE_RESERVE_GIB ?? 2);
export const CLONE_BUDGET_GIB = Number(process.env.HELM_CLONE_BUDGET_GIB ?? 0.5);

/**
 * `--include=dev` because a worktree install exists to run the gates (vitest,
 * tsc, eslint, the supabase CLI), and with NODE_ENV=production npm defaults
 * `omit` to `dev` and silently installs a third of the tree. Seen 2026-10-11:
 * 277 of 977 packages, no vitest, from the desktop health routine's shell.
 */
export const NPM_CI_ARGS = Object.freeze(['ci', '--silent', '--include=dev']);

export function freeGib(path) {
  try {
    const out = execFileSync('/bin/df', ['-Pk', path], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    const line = out.trim().split('\n')[1];
    if (!line) return null;
    const avail = Number(line.split(/\s+/)[3]);
    return Number.isFinite(avail) ? Math.floor((avail / 1048576) * 10) / 10 : null;
  } catch {
    return null;
  }
}

/** Pure so the policy is testable without filling a disk. */
export function installDecision(freeGibValue, reserve = RESERVE_GIB, budget = BUDGET_GIB) {
  if (freeGibValue === null || freeGibValue === undefined) {
    return { ok: false, code: 'UNKNOWN_DISK', need: reserve + budget, reason: 'could not measure free space' };
  }
  const need = reserve + budget;
  if (freeGibValue < need) {
    return {
      ok: false,
      code: 'INSUFFICIENT',
      need,
      reason: `${freeGibValue} GiB free; an install needs ${need} GiB (reserve ${reserve} + budget ${budget})`,
    };
  }
  return { ok: true, code: 'OK', need, reason: `${freeGibValue} GiB free` };
}

/**
 * A clone's own floor. The reserve exists so that THIS operation cannot be the
 * one that takes the volume to zero; a clone writes about 25 MiB, so a few GiB
 * is that guarantee. Holding a clone to the install's 12 GiB floor refused a
 * 25 MiB clone at 12.4 GiB free (2026-11-15) and left the worktree with no
 * node_modules, which sends agents back to a symlink or a private npm ci.
 * Other sessions' builds and .next caches swing free space by GiBs; no floor
 * on a clone prevents that. A clone grows only when something writes into
 * node_modules later (caches, an npm install there), which the install floor
 * never covered either.
 */
export function cloneDecision(freeGibValue, reserve = CLONE_RESERVE_GIB, budget = CLONE_BUDGET_GIB) {
  const need = reserve + budget;
  if (freeGibValue === null || freeGibValue === undefined) {
    return { ok: false, code: 'UNKNOWN_DISK', need, reason: 'could not measure free space' };
  }
  if (freeGibValue < need) {
    return { ok: false, code: 'INSUFFICIENT', need, reason: `${freeGibValue} GiB free; a clone needs ${need} GiB (reserve ${reserve} + budget ${budget})` };
  }
  return { ok: true, code: 'OK', need, reason: `${freeGibValue} GiB free` };
}

const say = (line) => {
  if (!QUIET) console.log(line);
};
const done = (state, code = 0) => {
  console.log(`deps: ${state}`);
  process.exit(code);
};
function refuse(reason) {
  console.error(`refusing: ${reason}`);
  console.error('Reclaim first — parking removes a checkout WITHOUT abandoning its branch:');
  console.error('  node scripts/worktree-lifecycle.mjs           # report');
  console.error('  node scripts/worktree-lifecycle.mjs --park    # remove disposable checkouts');
  console.error('  node scripts/ensure-worktree-deps.mjs --gc    # remove unused deps store entries');
  done('refused', 1);
}

/** Add a checkout's tree to the store, only after its installed files prove it is this lockfile's tree. */
function seedQuietly(key, fromNodeModules, source) {
  const proof = dirMatchesLock(dirname(fromNodeModules));
  if (!proof.ok) {
    console.error(`deps store: not adding ${key} from ${source}: ${proof.mismatches.slice(0, 2).join('; ')}`);
    return;
  }
  const r = seedStore({ key, fromNodeModules, source });
  if (r.ok && !r.already) say(`deps store: added ${key} (${source}) at ${entryDir(key)}`);
  else if (!r.ok && !r.busy) console.error(`deps store: could not add ${key}: ${r.error}`);
}

function gc() {
  const root = storeRoot();
  const entries = listEntries(root);
  const referenced = new Set();
  let mainKey = null;
  try {
    const list = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: DIR, encoding: 'utf-8' });
    for (const line of list.split('\n')) if (line.startsWith('worktree ')) {
      const m = readMarker(line.slice(9));
      if (m?.key) referenced.add(m.key);
    }
    mainKey = depsKey({ lockText: execFileSync('git', ['show', 'origin/main:package-lock.json'], { cwd: DIR, encoding: 'utf-8', maxBuffer: 1e9 }) });
  } catch {
    /* outside a repo: keep by age only */
  }
  const plan = gcPlan({ entries, referenced, mainKey, keepNewest: Number(process.env.HELM_DEPS_KEEP ?? 3) });
  const before = freeGib(root);
  for (const key of plan.remove) {
    rmSync(entryDir(key, root), { recursive: true, force: true });
    say(`deps store: removed ${key}`);
  }
  say(`deps store: kept ${plan.keep.length}, removed ${plan.remove.length}; free ${before} -> ${freeGib(root)} GiB`);
  done('gc');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (GC) gc();
  if (!existsSync(resolve(DIR, 'package.json'))) {
    console.error(`no package.json at ${DIR}`);
    process.exit(2);
  }

  if (!CHECK) clearStaleTemps(DIR);
  const key = keyForDir(DIR);
  let kind = nodeModulesKind(DIR);
  const marker = kind === 'dir' ? readMarker(DIR) : null;
  const match = kind === 'dir' && key && marker?.key !== key ? dirMatchesLock(DIR) : { ok: false, mismatches: [] };
  const hit = key ? storeHit(key) && sameVolume(storeRoot(), DIR) : false;
  let plan = depsPlan({ key, kind, markerKey: marker?.key ?? null, installMatches: match.ok, hit });

  if (CHECK) {
    if (plan.action === 'install') {
      const d = installDecision(freeGib(DIR));
      if (!d.ok) refuse(d.reason);
      say(`ok: ${d.reason} (need ${d.need} GiB to install)`);
    } else if (plan.action === 'clone') {
      const d = cloneDecision(freeGib(DIR));
      if (!d.ok) refuse(d.reason);
      say(`ok: ${plan.why}; a clone needs ${d.need} GiB free`);
    } else {
      say(`ok: ${plan.why}`);
    }
    done(`check-${plan.action}`);
  }

  if (plan.action === 'none') done('none');
  if (plan.action === 'ok') {
    if (!hit && key) seedQuietly(key, join(DIR, 'node_modules'), `checkout ${DIR}`);
    say(`dependencies already installed in ${DIR} (lockfile ${key})`);
    done('ok');
  }
  if (plan.action === 'adopt') {
    writeMarker(DIR, { key, source: 'adopted' });
    if (!hit) seedQuietly(key, join(DIR, 'node_modules'), `adopted ${DIR}`);
    say(`node_modules in ${DIR} matches its lockfile; marked it (${key})`);
    done('adopted');
  }

  let staleAside = null;
  if (plan.action === 'stale') {
    if (!REFRESH) {
      const sample = match.mismatches.slice(0, 3).join('; ');
      console.error(
        `node_modules in ${DIR} was installed for a different lockfile (${match.mismatches.length} differences${sample ? `, e.g. ${sample}` : ''}).`,
      );
      console.error(`Replace it with this lockfile's tree: node scripts/ensure-worktree-deps.mjs ${DIR} --refresh`);
      done('stale');
    }
    staleAside = join(DIR, `node_modules.stale-${Date.now()}`);
    renameSync(join(DIR, 'node_modules'), staleAside);
    kind = 'missing';
    plan = depsPlan({ key, kind, hit });
  }
  const putBack = () => {
    if (staleAside && !existsSync(join(DIR, 'node_modules'))) renameSync(staleAside, join(DIR, 'node_modules'));
  };
  const dropAside = () => {
    if (staleAside) rmSync(staleAside, { recursive: true, force: true });
  };

  if (plan.action === 'clone') {
    const d = cloneDecision(freeGib(DIR));
    if (!d.ok) {
      putBack();
      refuse(d.reason);
    }
    if (plan.replace) unlinkSync(join(DIR, 'node_modules'));
    const r = placeClone({ src: join(entryDir(key), 'node_modules'), destNodeModules: join(DIR, 'node_modules') });
    if (!r.ok) {
      putBack();
      console.error(`clone failed: ${r.error}`);
      done('refused', 1);
    }
    writeMarker(DIR, { key, source: 'clone' });
    dropAside();
    say(`node_modules cloned from the deps store into ${DIR} (lockfile ${key})`);
    done('cloned');
  }

  // plan.action === 'install'
  if (CLONE_ONLY) {
    putBack();
    console.error(
      `no deps store entry for this lockfile (${key}) yet. Fill it once: node scripts/ensure-worktree-deps.mjs ${DIR}` +
        ' (one npm ci; every checkout on this lockfile clones it after that).',
    );
    done('missing');
  }
  const decision = installDecision(freeGib(DIR));
  if (!decision.ok) {
    putBack();
    refuse(decision.reason);
  }
  if (plan.replace) unlinkSync(join(DIR, 'node_modules'));
  say(`installing dependencies in ${DIR} (${decision.reason})`);
  const r = spawnSync('npm', [...NPM_CI_ARGS], { cwd: DIR, stdio: 'inherit' });
  if (r.status !== 0) {
    const after = freeGib(DIR);
    if (after !== null && after < RESERVE_GIB) {
      console.error(`npm ci failed and free space is ${after} GiB, below the ${RESERVE_GIB} GiB reserve.`);
      console.error('Removing the partial node_modules — a failed install must not cost space.');
      spawnSync('/bin/rm', ['-rf', resolve(DIR, 'node_modules')], { stdio: 'ignore' });
    } else {
      console.error('npm ci failed. The worktree is intact — re-run this command to retry.');
    }
    putBack();
    done('refused', 1);
  }
  writeMarker(DIR, { key, source: 'install' });
  dropAside();
  mkdirSync(storeRoot(), { recursive: true });
  if (sameVolume(storeRoot(), DIR)) seedQuietly(key, join(DIR, 'node_modules'), `npm ci in ${DIR}`);
  else console.error(`deps store ${storeRoot()} is on another volume; not adding this install (a clone needs one volume).`);
  say('dependencies installed');
  done('installed');
}
