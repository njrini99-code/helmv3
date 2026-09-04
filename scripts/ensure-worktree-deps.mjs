#!/usr/bin/env node
/**
 * Install a worktree's dependencies, on demand, with a disk preflight.
 *
 * Creating a checkout should not mean creating another ~3.8 GiB node_modules.
 * Most control-plane, docs and config work never needs one. So new-worktree.sh
 * no longer installs by default, and this is what installs when a task first
 * reaches a command that genuinely requires dependencies.
 *
 * THE POLICY, and why it is two numbers rather than one
 *
 *   HELM_DISK_RESERVE_GIB   (12)  never spend below this. It is not headroom
 *                                 for the install — it is the floor that keeps
 *                                 the MACHINE usable. On 2026-08-29 the volume
 *                                 reached zero bytes and nothing could run at
 *                                 all: writing a command's output failed, so no
 *                                 command could be issued to clean up. The
 *                                 reserve exists so that state is unreachable.
 *   HELM_INSTALL_BUDGET_GIB (5)   conservative estimate of one install. The
 *                                 measured cost was 3.8 GiB; the budget is
 *                                 deliberately larger, because the observed
 *                                 cost of one day is not a promise about the
 *                                 next.
 *
 * An install therefore needs reserve + budget free before it starts.
 *
 * Usage: node scripts/ensure-worktree-deps.mjs [dir] [--check]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const DIR = resolve(args.find((a) => !a.startsWith('--')) ?? process.cwd());

export const RESERVE_GIB = Number(process.env.HELM_DISK_RESERVE_GIB ?? 12);
export const BUDGET_GIB = Number(process.env.HELM_INSTALL_BUDGET_GIB ?? 5);

export function freeGib(path) {
  try {
    const out = execFileSync('/bin/df', ['-Pk', path], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    const line = out.trim().split('\n')[1];
    if (!line) return null;
    const avail = Number(line.split(/\s+/)[3]);
    return Number.isFinite(avail) ? Math.floor(avail / 1048576) : null;
  } catch {
    return null;
  }
}

/**
 * Can this worktree SHARE the canonical checkout's node_modules instead of
 * paying for its own?
 *
 * new-worktree.sh's header rejects `ln -s "$root/node_modules"` outright, and
 * its reason is correct as far as it goes: "Two branches with different
 * lockfiles then test against whichever tree was installed last, which
 * manufactures both fake failures and fake passes."
 *
 * But that reason is conditional on the lockfiles DIFFERING, and it was
 * written as if they always do. Most task branches never touch
 * package-lock.json, so for them the shared tree is not merely cheaper — it is
 * the IDENTICAL tree a real install would have produced, byte for byte.
 *
 * That gap left the repo holding two contradictory policies at once, on the
 * same machine: this script installing ~3.8 GiB per worktree to avoid lockfile
 * skew, while `worktree.symlinkDirectories` in ~/.claude/settings.json
 * symlinks node_modules for Claude Code's own worktrees. Six worktrees in one
 * day took the volume to zero bytes free (2026-08-29), and sessions had
 * meanwhile started hand-symlinking to get around it — reproducing by hand the
 * exact thing this file warns against, without the lockfile check that makes
 * it safe.
 *
 * So the condition is checked instead of assumed. Identical lockfile AND an
 * installed canonical tree => share it. Anything else => a real install, and
 * the original warning stands untouched.
 */
export function shareDecision(dir, canonicalRoot) {
  if (!canonicalRoot || resolve(dir) === resolve(canonicalRoot)) {
    return { share: false, reason: 'this IS the canonical checkout' };
  }
  const theirs = resolve(canonicalRoot, 'node_modules');
  if (!existsSync(theirs)) {
    return { share: false, reason: 'canonical has no node_modules to share' };
  }
  const a = resolve(dir, 'package-lock.json');
  const b = resolve(canonicalRoot, 'package-lock.json');
  if (!existsSync(a) || !existsSync(b)) {
    return { share: false, reason: 'a package-lock.json is missing' };
  }
  const ha = readFileSync(a);
  const hb = readFileSync(b);
  if (!ha.equals(hb)) {
    return {
      share: false,
      reason: 'package-lock.json DIFFERS from canonical — a shared tree would test the wrong dependencies',
    };
  }
  return { share: true, reason: 'package-lock.json is byte-identical to canonical', target: theirs };
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

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync(resolve(DIR, 'package.json'))) {
    console.error(`no package.json at ${DIR}`);
    process.exit(2);
  }
  if (existsSync(resolve(DIR, 'node_modules'))) {
    console.log(`dependencies already installed in ${DIR}`);
    process.exit(0);
  }

  // Share the canonical tree when it is provably the same tree (see
  // shareDecision). This runs BEFORE the disk preflight on purpose: sharing
  // costs no space, so it must not be refused for lack of space.
  const canonicalRoot = (() => {
    try {
      return execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
        cwd: DIR, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
      }).trim().replace(/\/\.git\/?$/, '');
    } catch { return null; }
  })();
  const share = shareDecision(DIR, canonicalRoot);
  if (share.share) {
    if (CHECK) {
      console.log(`ok: can share canonical node_modules (${share.reason})`);
      process.exit(0);
    }
    symlinkSync(share.target, resolve(DIR, 'node_modules'));
    console.log(`linked node_modules -> ${share.target}`);
    console.log(`  ${share.reason}; 0 bytes spent, no install needed.`);
    process.exit(0);
  }
  console.log(`installing rather than sharing: ${share.reason}`);

  const decision = installDecision(freeGib(DIR));
  if (!decision.ok) {
    console.error(`refusing to install: ${decision.reason}`);
    console.error('');
    console.error('Reclaim first — parking removes a checkout WITHOUT abandoning its branch:');
    console.error('  node scripts/worktree-lifecycle.mjs           # report');
    console.error('  node scripts/worktree-lifecycle.mjs --park    # remove disposable checkouts');
    console.error('');
    console.error('Override with HELM_DISK_RESERVE_GIB / HELM_INSTALL_BUDGET_GIB if you know better.');
    process.exit(1);
  }
  if (CHECK) {
    console.log(`ok: ${decision.reason} (need ${decision.need} GiB)`);
    process.exit(0);
  }

  console.log(`installing dependencies in ${DIR} (${decision.reason})`);
  const r = spawnSync('npm', ['ci', '--silent'], { cwd: DIR, stdio: 'inherit' });
  if (r.status !== 0) {
    const after = freeGib(DIR);
    if (after !== null && after < RESERVE_GIB) {
      console.error(`npm ci failed and free space is ${after} GiB, below the ${RESERVE_GIB} GiB reserve.`);
      console.error('Removing the partial node_modules — a failed install must not cost space.');
      spawnSync('/bin/rm', ['-rf', resolve(DIR, 'node_modules')], { stdio: 'ignore' });
      process.exit(1);
    }
    console.error('npm ci failed. The worktree is intact — re-run this command to retry.');
    process.exit(1);
  }
  console.log('dependencies installed');
}
