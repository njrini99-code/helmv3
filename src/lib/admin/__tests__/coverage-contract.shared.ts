/**
 * Helm Bridge coverage contract (W15 Task 4).
 *
 * `assertAreaFullyWrapped(files)` statically scans the given golf action
 * files and throws, listing every gap, when:
 *   1. an exported `'use server'` action is not wrapped with
 *      `withAdminObserved` under its own name (Impl+delegator pattern), or
 *   2. a wrap's `feature` is missing / not a valid `FeatureKey`, or
 *   3. a wrap's `feature` does not match the registry's manifest for that
 *      file+export (drift between the code and feature-registry.ts), or
 *   4. (audit N4) a `withAdminObserved` registration exists for the export's
 *      name but the export's own body never calls the resulting observed
 *      const — a dead wrapper that would otherwise read as "covered".
 *
 * Used as a self-test today (proves the harness detects gaps — round-drafts.ts
 * is intentionally unwrapped in Foundation). Batches 1-9 (W15 Tasks 5-14, not
 * this PR) wrap the actions and add a per-batch GREEN contract test; Task 16
 * flips on the repo-wide tripwire.
 */

import { join } from 'node:path';
import { scanActionFile } from './coverage-scanner';
import { FEATURE_REGISTRY, type FeatureKey } from '@/lib/admin/feature-registry';

const VALID_FEATURE_KEYS = new Set<string>(FEATURE_REGISTRY.map((f) => f.key));

/** Registry-declared feature for a given repo-relative file + export name. */
function manifestFeatureFor(relFile: string, exportName: string): FeatureKey | undefined {
  for (const def of FEATURE_REGISTRY) {
    if (def.excluded) continue;
    const manifest = def.actions[relFile];
    if (!manifest) continue;
    if (manifest === 'ALL') return def.key;
    if (manifest.includes(exportName)) return def.key;
  }
  return undefined;
}

export function assertAreaFullyWrapped(
  files: string[],
  opts: { exclude?: Record<string, string[]> } = {},
): void {
  const problems: string[] = [];

  for (const relFile of files) {
    const absPath = join(process.cwd(), relFile);
    const scanned = scanActionFile(absPath);
    const excluded = new Set(opts.exclude?.[relFile] ?? []);

    for (const name of scanned.exports) {
      if (excluded.has(name)) continue;

      const wrap = scanned.wrapped.get(name);
      if (!wrap) {
        problems.push(`${relFile}: '${name}' is exported but NOT wrapped with withAdminObserved`);
        continue;
      }

      if (!wrap.feature || !VALID_FEATURE_KEYS.has(wrap.feature)) {
        problems.push(
          `${relFile}: '${name}' is wrapped but its feature ('${wrap.feature ?? 'MISSING'}') is not a valid FeatureKey`,
        );
        continue;
      }

      const expected = manifestFeatureFor(relFile, name);
      if (expected && expected !== wrap.feature) {
        problems.push(
          `${relFile}: '${name}' is wrapped with feature '${wrap.feature}' but the registry manifest says '${expected}'`,
        );
      }

      if (scanned.undelegatedWraps.has(name)) {
        problems.push(
          `${relFile}: '${name}' has a withAdminObserved registration but its export body never calls the observed const (dead wrapper)`,
        );
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `assertAreaFullyWrapped found ${problems.length} coverage gap(s):\n${problems.join('\n')}`,
    );
  }
}
