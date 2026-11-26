#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const generatedDir = join(root, 'docs', 'operations', 'generated');
const findingFiles = [
  'route-duplicate-findings.json',
  'route-stale-link-findings.json',
  'route-boundary-findings.json',
  'route-coverage-findings.json',
  'route-dead-candidate-findings.json',
];

function readJson(file) {
  const path = join(generatedDir, file);
  if (!existsSync(path)) {
    throw new Error(`Missing route hygiene artifact: ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

const blockers = [];

for (const file of findingFiles) {
  const payload = readJson(file);
  if (!payload || !Array.isArray(payload.findings)) {
    throw new Error(`Invalid route hygiene artifact shape: ${file} must contain a findings array`);
  }
  const findings = payload.findings;
  for (const finding of findings) {
    const severity = String(finding.severity ?? '').toUpperCase();
    if (severity === 'P0' || severity === 'P1') {
      blockers.push({ file, finding });
    }
  }
}

if (blockers.length > 0) {
  console.error(`Route Hygiene P0/P1 found ${blockers.length} blocker(s):`);
  for (const { file, finding } of blockers) {
    console.error(
      `- ${finding.severity} ${finding.id ?? 'ROUTE-HYGIENE-BLOCKER'} in ${file}: ${
        finding.evidence ?? finding.canonicalPath ?? 'No evidence provided'
      }`,
    );
  }
  process.exit(1);
}

console.log('Route Hygiene P0/P1 clean: no P0/P1 route blockers in generated findings.');
