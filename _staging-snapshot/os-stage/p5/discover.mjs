import { loadRegistry } from '/Users/ricknini/Downloads/helmv3/scripts/knowledge/lib/registry.mjs';
import { loadFeatureRegistryTs } from './scripts/knowledge/lib/feature-registry-ts.mjs';
import { computeDivergences } from './scripts/knowledge/check-registry-consistency.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = '/Users/ricknini/Downloads/helmv3';
const registry = await loadRegistry(repoRoot);
const { fileOwners: tsFileOwners } = await loadFeatureRegistryTs(repoRoot);

const equivalences = { id_relationships: {}, file_divergences: [] };

const result = computeDivergences({
  registry, tsFileOwners, equivalences,
  fileExists: (p) => existsSync(join(repoRoot, p)),
});

console.log('clean:', result.clean.length);
console.log('failures (raw, no seeding):', result.failures.length);
for (const f of result.failures) {
  console.log(JSON.stringify(f));
}
console.log('registryOnly ids:', result.registryOnly.length, JSON.stringify(result.registryOnly));
console.log('tsOnly ids:', result.tsOnly.length);
