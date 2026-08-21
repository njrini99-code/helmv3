import { loadRegistry } from '/Users/ricknini/Downloads/helmv3/scripts/knowledge/lib/registry.mjs';
import { loadFeatureRegistryTs } from './scripts/knowledge/lib/feature-registry-ts.mjs';
import { computeDivergences } from './scripts/knowledge/check-registry-consistency.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { readFileSync } from 'node:fs';

const repoRoot = '/Users/ricknini/Downloads/helmv3';
const registry = await loadRegistry(repoRoot);
const { fileOwners: tsFileOwners } = await loadFeatureRegistryTs(repoRoot);
const equivalences = YAML.parse(readFileSync('./memory/registry-equivalences.yml', 'utf8'));

const result = computeDivergences({
  registry, tsFileOwners, equivalences,
  fileExists: (p) => existsSync(join(repoRoot, p)),
});

console.log('clean:', result.clean.length);
console.log('warnings (declared):', result.warnings.length);
console.log('FAILURES (undeclared):', result.failures.length);
for (const f of result.failures) console.log('FAIL:', JSON.stringify(f));
console.log('registryOnly:', result.registryOnly.length);
console.log('tsOnly:', result.tsOnly.length);
