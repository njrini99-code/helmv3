#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);

execFileSync(process.execPath, ['scripts/knowledge/check-doc-coverage.mjs', ...args], {
  stdio: 'inherit',
});
execFileSync(process.execPath, ['scripts/knowledge/stale-doc-check.mjs', ...args], {
  stdio: 'inherit',
});
// Does each canonical doc actually DESCRIBE its feature? check-doc-coverage
// only proves the pointer resolves; this proves what it resolves to is right.
execFileSync(process.execPath, ['scripts/knowledge/check-doc-relevance.mjs', ...args], {
  stdio: 'inherit',
});
