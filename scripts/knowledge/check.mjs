#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);

execFileSync(process.execPath, ['scripts/knowledge/check-doc-coverage.mjs', ...args], {
  stdio: 'inherit',
});
execFileSync(process.execPath, ['scripts/knowledge/stale-doc-check.mjs', ...args], {
  stdio: 'inherit',
});
