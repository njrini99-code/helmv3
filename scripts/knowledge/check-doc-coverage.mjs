#!/usr/bin/env node
import { loadRegistry, flattenDocs, fileExists, mapFilesToFeatures } from './lib/registry.mjs';

const args = parseArgs(process.argv.slice(2));
const repoRoot = process.cwd();
const registry = await loadRegistry(repoRoot);
const errors = [];

for (const [id, feature] of Object.entries(registry.features ?? {})) {
  if (feature.criticality !== 'high') continue;
  const docs = flattenDocs(feature);
  if (docs.length === 0) errors.push(`${id}: high-criticality feature has no mapped docs`);
  for (const doc of docs) {
    if (!fileExists(repoRoot, doc)) errors.push(`${id}: missing mapped doc ${doc}`);
  }
}

if (args.files.length > 0) {
  const impacted = mapFilesToFeatures(registry, args.files);
  const unmapped = args.files.filter(
    (file) =>
      !file.startsWith('docs/') &&
      !file.startsWith('memory/') &&
      !impacted.some((feature) => feature.matchedFiles.includes(file)),
  );
  for (const file of unmapped) {
    errors.push(`unmapped changed file: ${file}`);
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log('Knowledge coverage clean.');

function parseArgs(argv) {
  const parsed = { files: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--files') {
      i += 1;
      while (i < argv.length && !argv[i].startsWith('--')) {
        parsed.files.push(argv[i]);
        i += 1;
      }
      i -= 1;
    } else if (!arg.startsWith('--')) {
      parsed.files.push(arg);
    }
  }
  return parsed;
}
