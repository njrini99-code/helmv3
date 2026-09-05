// Lockfile drift: `node_modules/.package-lock.json` records what `npm
// install`/`npm ci` ACTUALLY resolved and installed the last time either ran;
// `package-lock.json` at the repo root records what SHOULD be installed given
// the current `package.json` + lockfile. They drift whenever someone edits
// `package.json` (adds/bumps a dependency), edits `package-lock.json` by hand,
// or resolves a merge conflict in either file, without re-running npm
// afterward — exactly the gap `npm ci` exists to close, and exactly the gap
// that leaves a contributor (or CI, if a lockfile change ever landed without a
// paired install) debugging behavior from a dependency version nobody
// actually has on disk.
//
// This compares the full "packages" maps of both files rather than only the
// top-level `dependencies`/`devDependencies` entries in package.json: a
// mismatch several levels down in the tree (a transitive bump) is exactly as
// real a drift as a direct one, and node_modules/.package-lock.json already
// carries the whole resolved tree, so there is no extra cost to checking all
// of it.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, Status } from '../result.mjs';

export const meta = { id: 'deps', title: 'Dependency lockfile drift' };

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/**
 * Compare two npm lockfile "packages" maps.
 *
 * `declared` is package-lock.json's map (what SHOULD be installed); `installed`
 * is node_modules/.package-lock.json's map (what npm ACTUALLY installed).
 * Returns every path that disagrees between the two, split by how it
 * disagrees, so the report can say something more useful than "they differ".
 */
export function diffLockfiles(declared, installed) {
  const declaredPkgs = declared?.packages ?? {};
  const installedPkgs = installed?.packages ?? {};
  const allPaths = new Set([...Object.keys(declaredPkgs), ...Object.keys(installedPkgs)]);

  const missing = []; // declared in package-lock.json, not present in node_modules
  const extra = []; // present in node_modules, not declared in package-lock.json
  const versionMismatch = []; // present in both, resolved to different versions

  for (const p of allPaths) {
    const d = declaredPkgs[p];
    const i = installedPkgs[p];
    if (d && !i) missing.push(p);
    else if (!d && i) extra.push(p);
    else if (d && i && d.version !== i.version) {
      versionMismatch.push({ path: p, declared: d.version, installed: i.version });
    }
  }

  return { missing, extra, versionMismatch };
}

export async function run(ctx) {
  const { repoRoot } = ctx;
  const declaredPath = join(repoRoot, 'package-lock.json');
  const installedPath = join(repoRoot, 'node_modules', '.package-lock.json');

  if (!existsSync(declaredPath)) {
    return [check('deps.lockfile-drift', Status.FAIL, 'package-lock.json is missing', {
      expected: 'package-lock.json',
      actual: '(absent)',
    })];
  }

  if (!existsSync(installedPath)) {
    // Nothing has been installed into this node_modules yet (a fresh clone, or
    // a worktree deliberately left uninstalled per scripts/ensure-worktree-deps.mjs).
    // That is a precondition this check cannot evaluate, not a repo defect —
    // report UNKNOWN (external state unavailable) rather than manufacturing a
    // FAIL, matching db-observability's own LOCAL_ONLY/UNKNOWN convention for
    // "the thing this check needs isn't there to read".
    return [check('deps.lockfile-drift', Status.UNKNOWN,
      'node_modules/.package-lock.json is absent — dependencies have not been installed', {
        remediation: 'npm ci',
      })];
  }

  let declared;
  try {
    declared = readJson(declaredPath);
  } catch (err) {
    return [check('deps.lockfile-drift', Status.BLOCKED, 'package-lock.json is not valid JSON', { detail: String(err) })];
  }

  let installed;
  try {
    installed = readJson(installedPath);
  } catch (err) {
    return [check('deps.lockfile-drift', Status.BLOCKED, 'node_modules/.package-lock.json is not valid JSON', { detail: String(err) })];
  }

  const { missing, extra, versionMismatch } = diffLockfiles(declared, installed);
  const total = missing.length + extra.length + versionMismatch.length;

  if (total === 0) {
    return [check('deps.lockfile-drift', Status.PASS, 'node_modules matches package-lock.json')];
  }

  // DRIFT, not FAIL: this is precisely "desired (package-lock.json) !=
  // observed (what's actually installed)" — the status this repo's result
  // model defines for exactly that shape — and DRIFT is in the same HARD set
  // as FAIL (result.mjs), so it carries the identical exit-1 consequence.
  return [
    check('deps.lockfile-drift', Status.DRIFT,
      `node_modules does not match package-lock.json (${missing.length} missing, ${extra.length} extra, ${versionMismatch.length} version mismatch) — run npm ci`, {
        remediation: 'npm ci',
        missingCount: missing.length,
        extraCount: extra.length,
        versionMismatchCount: versionMismatch.length,
        evidence: {
          missing: missing.slice(0, 10),
          extra: extra.slice(0, 10),
          versionMismatch: versionMismatch.slice(0, 10),
        },
      }),
  ];
}
