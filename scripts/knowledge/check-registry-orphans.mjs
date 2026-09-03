#!/usr/bin/env node
/**
 * check-registry-orphans.mjs — the reverse direction from
 * check-registry-globs.mjs.
 *
 * check-registry-globs.mjs fails when a `memory/registry.yml` entry points
 * at a path that no longer exists (registry -> tree, dead pointer). This
 * fails the other direction: when a tracked file under a directory the
 * registry itself CLAIMS to fully cover maps to zero features (tree ->
 * registry, silent gap).
 *
 * WHY "CLAIMS TO FULLY COVER" IS A DELIBERATE, NARROW LIST, NOT EVERY GLOB
 *
 * Most feature `code:` globs are ordinary partial claims — `stats_analytics`
 * owning `dashboard/stats/**` says nothing about who owns
 * `dashboard/players/**` (a real, disclosed gap; see
 * `memory/journeys/golden-paths.yml`'s header). Enumerating every tracked
 * file under `src/` and demanding each map to something would be wrong —
 * most of this tree has no registry claim at all and isn't supposed to.
 *
 * `src/app/admin/**` and `src/lib/admin/**` are different: `memory/
 * registry.yml`'s own comments assert full coverage by name — "Every
 * src/app/admin/** subdirectory EXCEPT the three carved out below" and "The
 * remainder of src/lib/admin/** not carved into a sub-capability below".
 * That is the admin_platform split's whole design (2026-09-02): a shell
 * entry plus three sub-capabilities (`admin_incidents`,
 * `admin_reliability_collector`, `admin_selfheal`) partitioning these two
 * directories so every file has exactly one owner. The split shipped with
 * this precise defect unfixed: the 17 named `routes:` subdirectories
 * replaced the old blanket `src/app/admin/**`, and
 * `src/app/admin/__tests__/` — never one of the 17, never a carved-out
 * sub-capability — mapped to zero features
 * (`npm run knowledge:map -- --files
 * src/app/admin/__tests__/admin-gate-coverage.test.ts` returned
 * `impactedFeatures: []`). Fixed in the same change as this checker
 * (`memory/registry.yml`'s `admin_platform.code.tests`), and this script is
 * what keeps it fixed: any future admin subdirectory, or a loose file added
 * directly under `src/app/admin/` or `src/lib/admin/`, now fails CI instead
 * of silently routing nowhere.
 *
 * `FULLY_COVERED_ROOTS` below is that list — grep `memory/registry.yml` for
 * "carved" / "EXCEPT the ... carved out" / "not carved into" before adding
 * to it; that is the textual signature of a shell-plus-carve-out coverage
 * claim in this registry today, and nothing else in the file makes one.
 *
 * MECHANISM: for each root, every git-tracked file is mapped through the
 * SAME registry loader and glob matcher `knowledge:map` uses
 * (`lib/registry.mjs`'s `loadRegistry`/`mapFilesToFeatures`) — so this can
 * never disagree with what an agent session sees from that command. A file
 * matching zero features is an orphan. Ratchets against
 * `.registry-orphans-baseline.json` the same way check-registry-globs.mjs
 * ratchets dead entries: the count may only go DOWN, and any NEW orphan
 * fails regardless of the baseline.
 *
 * Usage:
 *   node scripts/knowledge/check-registry-orphans.mjs            # check
 *   node scripts/knowledge/check-registry-orphans.mjs --update   # rewrite the baseline
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRegistry, mapFilesToFeatures } from './lib/registry.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASELINE = resolve(ROOT, '.registry-orphans-baseline.json');

/**
 * Directories `memory/registry.yml` itself claims, in its own comments, to
 * fully partition across one or more features — see the module doc-comment
 * above for the exact textual signature that earns a directory a place here.
 */
export const FULLY_COVERED_ROOTS = ['src/app/admin', 'src/lib/admin'];

/**
 * Pure core: given the already-loaded registry, the roots to check, and an
 * injected way to list tracked files per root, return every file that maps
 * to zero features. No fs/git of its own — the CLI below and the node:test
 * fixtures both inject `listTrackedFiles`, so the fixtures never touch the
 * real filesystem or spawn a real git process.
 *
 * @param {{features: Record<string, any>}} registry
 * @param {string[]} roots
 * @param {(root: string) => string[]} listTrackedFiles
 * @returns {string[]} sorted, de-duplicated orphan file paths
 */
export function findRegistryOrphans(registry, roots, listTrackedFiles) {
  const orphans = new Set();
  for (const root of roots) {
    for (const file of listTrackedFiles(root)) {
      const matches = mapFilesToFeatures(registry, [file]);
      if (matches.length === 0) orphans.add(file);
    }
  }
  return [...orphans].sort();
}

function gitLsFiles(root) {
  const out = execFileSync('git', ['ls-files', root], { cwd: ROOT, encoding: 'utf8' });
  return out.trim().split('\n').filter(Boolean);
}

async function main() {
  const registry = await loadRegistry(ROOT);
  const orphans = findRegistryOrphans(registry, FULLY_COVERED_ROOTS, gitLsFiles);

  if (process.argv.includes('--update')) {
    writeFileSync(
      BASELINE,
      `${JSON.stringify(
        {
          $comment:
            'Tracked files under a FULLY_COVERED_ROOTS directory (see check-registry-orphans.mjs) ' +
            'that map to zero memory/registry.yml features. May only go DOWN. Fix by adding the ' +
            'file (or its directory glob) to the right feature\'s code: block — never by removing ' +
            'the root from FULLY_COVERED_ROOTS to silence this.',
          total: orphans.length,
          entries: orphans,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`Baseline written: ${orphans.length} orphaned file(s) under ${FULLY_COVERED_ROOTS.join(', ')}.`);
    return;
  }

  let known = new Set();
  let baseTotal = 0;
  try {
    const b = JSON.parse(readFileSync(BASELINE, 'utf8'));
    known = new Set(b.entries ?? []);
    baseTotal = b.total ?? known.size;
  } catch {
    /* no baseline yet — everything is new */
  }

  const fresh = orphans.filter((p) => !known.has(p));

  if (fresh.length) {
    console.error(
      `❌ ${fresh.length} NEW orphaned file(s) under a fully-covered registry root ` +
        `(${FULLY_COVERED_ROOTS.join(', ')}):\n`,
    );
    for (const p of fresh) console.error(`   ${p}`);
    console.error(
      '\n   memory/registry.yml claims full coverage of this root (see the split\'s own' +
        '\n   "EXCEPT the ... carved out" / "not carved into" comments). A file here mapping' +
        '\n   to zero features means the map disagrees with the territory. Add it to the' +
        '\n   right feature\'s code: block in memory/registry.yml.',
    );
    process.exitCode = 1;
    return;
  }

  if (orphans.length < baseTotal) {
    console.log(
      `registry-orphans: orphans dropped (${baseTotal} → ${orphans.length}) — run ` +
        'node scripts/knowledge/check-registry-orphans.mjs --update to lock in the gains',
    );
  }
  console.log(
    `✅ No new registry orphans. ${orphans.length} known remain under ${FULLY_COVERED_ROOTS.join(', ')} — ratchet them down.`,
  );
}

const isEntrypoint =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isEntrypoint) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
