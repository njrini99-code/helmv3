#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const docs = [
  'README.md',
  'docs/README.md',
  'docs/current/README.md',
  'docs/current/operating-system.md',
  'docs/current/product-map.md',
  'docs/current/architecture-map.md',
  'docs/operations/GATE_MATRIX.md',
  'docs/operations/CI_RUNBOOK.md',
  'docs/operations/BRANCH_PROTECTION.md',
  'docs/operations/HOT_FILES.md',
  'AGENTS.md',
  'CLAUDE.md',
  'memory/registry.yml',
];

const allowedRootMarkdown = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'DEPLOY.md',
  'README.md',
  'RESEND_SETUP.md',
]);

const generatedTrackedPaths = [
  '.playwright-mcp',
  '.full-review',
  '.full-stack-feature',
  'playwright-report',
  'test-results',
];

const allowedTrackedIgnored = [];

function status(command, args) {
  try {
    execFileSync(command, args, { stdio: 'ignore' });
    return 'ok';
  } catch {
    return 'check';
  }
}

function countLintBaseline() {
  if (!existsSync('.lint-baseline.json')) return 'missing';
  const baseline = JSON.parse(readFileSync('.lint-baseline.json', 'utf8'));
  const total = Object.values(baseline).reduce((sum, value) => sum + Number(value), 0);
  return `${total} warnings / ${Object.keys(baseline).length} rules`;
}

function list(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

let failed = false;

console.log('Helm repo health');
console.log('');
console.log('Current docs');
for (const doc of docs) {
  const ok = existsSync(doc);
  if (!ok) failed = true;
  console.log(`- ${ok ? 'ok' : 'missing'} ${doc}`);
}
console.log('');
console.log('Fast checks');
const packageStatus = status('node', ['-e', "JSON.parse(require('fs').readFileSync('package.json','utf8'))"]);
const workflowStatus = status('actionlint', ['.github/workflows/ci.yml', '.github/workflows/playwright-smoke.yml', '.github/workflows/review-gate.yml']);
if (packageStatus !== 'ok' || workflowStatus !== 'ok') failed = true;
console.log(`- package.json: ${packageStatus}`);
console.log(`- workflow lint: ${workflowStatus}`);
console.log(`- lint baseline: ${countLintBaseline()}`);
console.log('');
console.log('Repo organization');
const rootMarkdown = list('git', ['ls-files', '*.md']).filter((file) => !file.includes('/'));
const unexpectedRootMarkdown = rootMarkdown.filter((file) => !allowedRootMarkdown.has(file));
if (unexpectedRootMarkdown.length > 0) failed = true;
console.log(`- root markdown allowlist: ${unexpectedRootMarkdown.length === 0 ? 'ok' : `check (${unexpectedRootMarkdown.join(', ')})`}`);

const trackedGenerated = list('git', ['ls-files', ...generatedTrackedPaths]);
if (trackedGenerated.length > 0) failed = true;
console.log(`- tracked generated artifacts: ${trackedGenerated.length === 0 ? 'ok' : `check (${trackedGenerated.length} files)`}`);

const trackedIgnored = list('git', ['ls-files', '-ci', '--exclude-standard']);
const unexpectedTrackedIgnored = trackedIgnored.filter(
  (file) => !allowedTrackedIgnored.some((pattern) => pattern.test(file)),
);
if (unexpectedTrackedIgnored.length > 0) failed = true;
console.log(
  `- tracked ignored files: ${
    unexpectedTrackedIgnored.length === 0
      ? 'ok'
      : `check (${unexpectedTrackedIgnored.join(', ')})`
  }`,
);
console.log('');
console.log('Truth commands');
console.log('- normal: npm run verify');
console.log('- database: npm run verify:db');
console.log('- full: npm run verify:full');

if (failed) {
  process.exitCode = 1;
}
