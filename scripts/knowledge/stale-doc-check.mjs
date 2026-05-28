#!/usr/bin/env node
import { loadRegistry, mapFilesToFeatures } from './lib/registry.mjs';

const args = parseArgs(process.argv.slice(2));
const registry = await loadRegistry(process.cwd());
const impacted = mapFilesToFeatures(registry, args.files);
const hasDocChange = args.files.some(
  (file) =>
    file.startsWith('memory/') ||
    file.startsWith('docs/') ||
    file === 'AGENTS.md' ||
    file === 'CLAUDE.md',
);

if (impacted.length === 0) {
  console.log('No mapped feature code changes found.');
  process.exit(0);
}

if (!hasDocChange) {
  const featureNames = impacted.map((feature) => feature.name).join(', ');
  const message =
    `Mapped feature code changed without a docs/memory change: ${featureNames}. ` +
    'Review whether current-state docs or registry mappings need an update.';
  if (args.strict) {
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
  process.exit(0);
}

console.log('Feature code changes include a docs or memory update.');

function parseArgs(argv) {
  const parsed = { files: [], strict: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--strict') {
      parsed.strict = true;
    } else if (arg === '--files') {
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
