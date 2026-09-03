#!/usr/bin/env node
/**
 * Security posture check for the Supabase observability surface - brief 60
 * and 61.
 *
 * Static and read-only: reads migrations and source, makes no network call
 * and opens no database connection. Plain Node - no TypeScript loader needed,
 * because everything it inspects is text.
 *
 * Usage:
 *   node scripts/db-observability-security.mjs          # human report
 *   node scripts/db-observability-security.mjs --json   # machine report
 *
 * Exit 0: no FAIL. Exit 1: at least one FAIL.
 * FINDING and NOT_CONFIGURED never affect the exit code and are never
 * presented as a pass.
 */
import { runSecurityPosture, summarizeSecurityPosture } from './lib/db-observability-security.mjs';

const JSON_MODE = process.argv.includes('--json');

const checks = runSecurityPosture();
const summary = summarizeSecurityPosture(checks);

if (JSON_MODE) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 1);
}

console.log('\nSupabase observability security posture - brief 60 / 61\n');

for (const c of checks) {
  console.log(`${c.verdict.padEnd(15)} ${c.title}`);
  console.log(`                ${c.detail}`);
  if (c.id === 'pre_existing_ingest_controls' && c.evidence) {
    for (const row of c.evidence.rows) {
      const present = Object.entries(row.controls)
        .map(([name, ok]) => `${name}=${ok ? 'yes' : 'NO'}`)
        .join(' ');
      console.log(`                ${row.file}`);
      console.log(`                  ${present}`);
    }
  }
  console.log('');
}

console.log('Summary');
console.log(`  PASS            ${summary.pass}`);
console.log(`  FAIL            ${summary.fail}`);
console.log(`  FINDING         ${summary.findings}   (reported, does not gate)`);
console.log(`  NOT CONFIGURED  ${summary.notConfigured}   (never a pass)`);
console.log(`\n${summary.ok ? 'PASS' : 'FAIL'} - static only; no database was contacted.\n`);

process.exit(summary.ok ? 0 : 1);
