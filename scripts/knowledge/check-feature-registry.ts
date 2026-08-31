#!/usr/bin/env tsx
/**
 * check-feature-registry.ts — reconcile the SEMANTIC feature router with the
 * RUNTIME observability vocabulary.
 *
 * TWO REGISTRIES, ON PURPOSE
 *
 *   memory/registry.yml              semantic identity: which files belong to a
 *                                    feature, which doc describes it
 *   src/lib/admin/feature-registry.ts  runtime vocabulary: the FeatureKey union
 *                                    written into admin_events.feature
 *
 * They are not duplicates and must not be merged — one is read by agent tooling
 * at authoring time, one is imported by shipped product code. Measured
 * 2026-08-30 the relationship is 87 runtime keys to 20 semantic features, so a
 * one-to-one identity was never available to begin with.
 *
 * The crosswalk therefore lives INSIDE memory/registry.yml, as an
 * `observability:` block per feature, rather than in a third file that would
 * drift from both. See ADR-2026-08-30-helm-knowledge-authority.
 *
 * WHY THE CROSSWALK IS DECLARED AND NOT DERIVED
 *
 * The obvious derivation — map each runtime key's action files through the
 * registry's code globs — was tried first and does not work. 28 of 39
 * golf/coachhelm keys came back claimed by three or more semantic features,
 * because shared modules like `src/app/golf/actions/golf.ts` legitimately
 * appear in many features' code blocks. Ownership is a judgement about which
 * feature's current-state doc DESCRIBES a surface, and judgements get written
 * down, not inferred.
 *
 * WHAT THIS REFUSES
 *
 *   a mapped FeatureKey that does not exist in the runtime registry
 *   a runtime FeatureKey with no owner and no explicit classification
 *   the same FeatureKey claimed by two semantic features
 *   a high-criticality feature with no observability decision recorded at all
 *   an `observability` block whose shape is not one of the two legal forms
 *
 * Silence is the thing being removed. A key that nobody owns must be SAID to be
 * unowned, with a reason, rather than simply missing from every list.
 *
 * Usage: npm run knowledge:registry-check
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

import { FEATURE_REGISTRY } from '../../src/lib/admin/feature-registry';
import { reconcile, type Registry } from './lib/feature-registry-reconcile';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Only run when invoked as a command. Tests import the pure function above, and
 * a module that does work on import would run the real check inside the test
 * process — quietly setting process.exitCode and making a suite fail for a
 * reason that has nothing to do with the suite.
 */
const isEntrypoint = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

function loadRegistry(): Registry {
  return yaml.load(readFileSync(resolve(ROOT, 'memory/registry.yml'), 'utf8')) as Registry;
}

function main(): void {
  const reg = loadRegistry();
  const runtimeKeys = new Set(FEATURE_REGISTRY.map((f) => f.key as string));
  const features = Object.keys(reg.features ?? {});

  const problems = reconcile(reg, runtimeKeys);

  console.log(
    `Feature registry reconciliation: ${features.length} semantic feature(s), ` +
      `${runtimeKeys.size} runtime FeatureKey(s).`,
  );

  if (problems.length === 0) {
    console.log('✅ Every runtime FeatureKey has exactly one owner or an explicit classification.');
    return;
  }

  const byKind = new Map<string, Problem[]>();
  for (const p of problems) byKind.set(p.kind, [...(byKind.get(p.kind) ?? []), p]);

  console.error(`\n❌ ${problems.length} reconciliation problem(s):\n`);
  for (const [kind, list] of byKind) {
    console.error(`   ${kind}`);
    for (const p of list) console.error(`     - ${p.detail}`);
    console.error('');
  }
  console.error(
    '   memory/registry.yml owns semantic identity; feature-registry.ts owns the\n' +
      '   runtime vocabulary. Neither is wrong on its own — the crosswalk between\n' +
      '   them is what has drifted. See ADR-2026-08-30-helm-knowledge-authority.\n',
  );
  process.exitCode = 1;
}

if (isEntrypoint) main();
