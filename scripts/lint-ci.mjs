#!/usr/bin/env node
/** One CI scan, followed by the same hard zero-warning source lint gate. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadResults, produceReport, standardDiagnostics } from './lib/lint-results.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  if (process.argv.includes('--scan')) {
    produceReport(root);
  } else {
    if (!process.env.HELM_ESLINT_REPORT) throw new Error('Run the shared ESLint scan first.');
    const diagnostics = standardDiagnostics(root, loadResults(root));
    for (const message of diagnostics) {
      console.error(`${message.filePath}:${message.line ?? 0}:${message.column ?? 0} ${message.message} (${message.ruleId ?? 'parse error'})`);
    }
    console.log(`ESLint: ${diagnostics.length} source warning(s)/error(s).`);
    process.exitCode = diagnostics.length ? 1 : 0;
  }
} catch (error) {
  console.error(`lint-ci: ${error.message}`);
  process.exitCode = 1;
}
