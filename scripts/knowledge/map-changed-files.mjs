#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { loadRegistry, mapFilesToFeatures } from './lib/registry.mjs';

const args = parseArgs(process.argv.slice(2));
const files = args.files.length > 0 ? args.files : getChangedFiles();
const registry = await loadRegistry(process.cwd());
const impactedFeatures = mapFilesToFeatures(registry, files);

console.log(JSON.stringify({ files, impactedFeatures }, null, 2));

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

function getChangedFiles() {
  const candidates = [
    ['diff', '--name-only', '--cached'],
    ['diff', '--name-only'],
    ['diff', '--name-only', 'origin/main...HEAD'],
  ];
  const files = new Set();
  for (const command of candidates) {
    try {
      const output = execFileSync('git', command, { encoding: 'utf8' });
      for (const file of output.split(/\r?\n/).filter(Boolean)) files.add(file);
    } catch {
      // Try the next changed-file source.
    }
  }
  return [...files].sort();
}
