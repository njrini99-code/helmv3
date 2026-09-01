#!/usr/bin/env node
/**
 * workspace-clean.mjs — reclaim local-only build and test artifacts.
 *
 * Everything here is REGENERABLE by a command in package.json. Nothing tracked
 * by git is ever a target, and the script proves that per-path rather than
 * trusting the allowlist: a path with any tracked file under it is refused,
 * even if someone adds it to TARGETS by mistake.
 *
 * What it deliberately does NOT do:
 *
 *   node_modules   ~3.8 GiB but a slow, network-dependent rebuild. Opt in with
 *                  --deep when you actually mean it.
 *   worktrees      scripts/worktree-lifecycle.mjs is the lifecycle authority.
 *                  A second deletion algorithm is how a checkout with an owner
 *                  gets removed — see AGENTS.md, 2026-08-30.
 *   .env family    never a build artifact, never regenerable.
 *
 * The disk policy is NOT a second one: RESERVE_GIB and freeGib() are imported
 * from ensure-worktree-deps.mjs, which already owns "how much space must stay
 * free in this repo". Two thresholds that can disagree is worse than one.
 *
 * Usage:
 *   node scripts/workspace-clean.mjs              report only (default)
 *   node scripts/workspace-clean.mjs --apply      delete the reclaimable paths
 *   node scripts/workspace-clean.mjs --deep       include node_modules
 *   node scripts/workspace-clean.mjs --if-below N no-op unless free < N GiB
 */
import { execFileSync } from 'node:child_process';
import { rmSync, statSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';

import { freeGib, RESERVE_GIB } from './ensure-worktree-deps.mjs';

const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim();

/** Regenerable local artifacts, each with the command that rebuilds it. */
const TARGETS = [
  { path: '.next', regen: 'npm run build / npm run dev' },
  { path: '.turbo', regen: 'next build' },
  { path: 'test-results', regen: 'npm run test:e2e' },
  { path: 'playwright-report', regen: 'npm run test:e2e' },
  { path: 'coverage', regen: 'npm run test:coverage' },
  { path: '.ruff_cache', regen: 'ruff' },
  { path: 'node_modules/.cache', regen: 'any build' },
];
const DEEP_TARGETS = [{ path: 'node_modules', regen: 'npm install  (slow, needs network)' }];

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const deep = argv.includes('--deep');
const ifBelowIdx = argv.indexOf('--if-below');
const ifBelow = ifBelowIdx === -1 ? null : Number(argv[ifBelowIdx + 1]);

function bytes(p) {
  try {
    const out = execFileSync('du', ['-sk', p], { encoding: 'utf-8' });
    return Number(out.split(/\s+/)[0]) * 1024;
  } catch {
    return 0;
  }
}
const gib = (b) => (b / 1024 ** 3).toFixed(2);

/**
 * A target is removable only if it resolves INSIDE the repo and git tracks
 * nothing under it. Both are checked every run — the allowlist is a
 * convenience, not the safety property.
 */
function refuseReason(rel) {
  const abs = resolve(REPO, rel);
  if (abs !== REPO && !abs.startsWith(REPO + sep)) return 'resolves outside the repository';
  if (abs === REPO) return 'is the repository root';
  if (!existsSync(abs)) return 'absent';
  try {
    const tracked = execFileSync('git', ['ls-files', '--', rel], { cwd: REPO, encoding: 'utf-8' }).trim();
    if (tracked) return `git tracks ${tracked.split('\n').length} file(s) under it`;
  } catch {
    return 'could not ask git whether it is tracked';
  }
  try {
    if (statSync(abs).isSymbolicLink()) return 'is a symlink';
  } catch {
    return 'could not stat it';
  }
  return null;
}

const free = freeGib(REPO);
console.log(`workspace-clean — ${free ?? '?'} GiB free, reserve ${RESERVE_GIB} GiB`);

if (ifBelow !== null && Number.isFinite(ifBelow) && free !== null && free >= ifBelow) {
  console.log(`Free space ${free} GiB is at or above --if-below ${ifBelow} GiB. Nothing to do.`);
  process.exit(0);
}

const candidates = deep ? [...TARGETS, ...DEEP_TARGETS] : TARGETS;
let reclaimable = 0;
const actionable = [];

for (const t of candidates) {
  const why = refuseReason(t.path);
  if (why === 'absent') continue;
  if (why) {
    console.log(`  SKIP  ${t.path.padEnd(24)} ${why}`);
    continue;
  }
  const size = bytes(resolve(REPO, t.path));
  reclaimable += size;
  actionable.push({ ...t, size });
  console.log(`  ${(apply ? 'CLEAN' : 'would').padEnd(6)}${t.path.padEnd(24)} ${gib(size).padStart(7)} GiB   regen: ${t.regen}`);
}

if (!actionable.length) {
  console.log('\nNothing reclaimable.');
  process.exit(0);
}

console.log(`\n  reclaimable: ${gib(reclaimable)} GiB across ${actionable.length} path(s)`);

if (!apply) {
  console.log('  Report only. Re-run with --apply to delete' + (deep ? '.' : ', or --deep to include node_modules.'));
  process.exit(0);
}

for (const t of actionable) {
  rmSync(resolve(REPO, t.path), { recursive: true, force: true });
  console.log(`  removed ${t.path}`);
}
const after = freeGib(REPO);
console.log(`\n  ${gib(reclaimable)} GiB reclaimed · ${after ?? '?'} GiB free (was ${free ?? '?'})`);
if (after !== null && after < RESERVE_GIB) {
  console.log(`  STILL BELOW RESERVE (${RESERVE_GIB} GiB). Worktrees are the usual next`);
  console.log('  cause — check `npm run worktrees`, which owns that decision.');
}
