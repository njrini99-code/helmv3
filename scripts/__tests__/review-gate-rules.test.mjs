// Smoke test for the Review Gate custom rule pack.
//
// Mirrors the per-rule path scoping in .github/workflows/review-gate.yml
// so a future workflow regression (or a rule regression) can be caught
// locally without pushing to CI. Runs the 4 ast-grep rules across src/
// and supabase/functions/, then asserts:
//   - helmv3-no-bare-table-names produces ZERO findings on src/ (after
//     the .storage.from() carve-out from 2026-05-28).
//   - helmv3-no-process-env-in-edge produces ZERO findings on
//     supabase/functions/ (no leaked Node process.env in Deno code).
//   - helmv3-no-service-role-key produces ZERO findings outside the
//     admin/scripts/edge allowlist.
//   - helmv3-no-bare-table-names DOES fire on the synthetic positive
//     fixture in .coderabbit/semgrep/__test__/positive-bare-table.ts.
//
// Run via: node scripts/__tests__/review-gate-rules.test.mjs
// Requires: ast-grep (sg) on PATH.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
process.chdir(repoRoot);

function which(bin) {
  const r = spawnSync('which', [bin], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

if (!which('sg')) {
  console.error('SKIP: ast-grep (sg) not on PATH — install via `brew install ast-grep` or download from https://github.com/ast-grep/ast-grep/releases');
  process.exit(0);
}

function sgScan(rule, ...paths) {
  const result = spawnSync('sg', ['scan', '--rule', rule, '--json', ...paths], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`sg scan crashed for ${rule}: ${result.stderr}`);
  }
  try {
    return JSON.parse(result.stdout || '[]');
  } catch {
    return [];
  }
}

let failed = 0;
function assertCount(label, findings, expected) {
  const actual = findings.length;
  const ok = actual === expected;
  console.log(`  ${ok ? 'ok' : 'FAIL'} ${label}: ${actual} finding(s), expected ${expected}`);
  if (!ok) {
    failed += 1;
    findings.slice(0, 5).forEach((f) => console.log(`     ${f.file}:${f.range?.start?.line ?? '?'}`));
  }
}

console.log('Review Gate rule smoke test:');

// 1. no-bare-table-names — should be ZERO on src/.
const bare = sgScan('.coderabbit/ast-grep/no-bare-table-names.yml', 'src');
assertCount('no-bare-table-names: src/ → 0 findings', bare, 0);

// 2. no-process-env-in-edge — should be ZERO on supabase/functions/.
if (existsSync('supabase/functions')) {
  const edgeEnv = sgScan('.coderabbit/ast-grep/no-process-env-in-edge.yml', 'supabase/functions');
  assertCount('no-process-env-in-edge: supabase/functions/ → 0 findings', edgeEnv, 0);
}

// 3. no-service-role-in-client — should be ZERO outside the admin/scripts/edge allowlist.
//    Replicate the workflow's exclude regex on a synthetic file list.
const serviceRoleAll = sgScan('.coderabbit/ast-grep/no-service-role-in-client.yml', 'src');
const allowlist = /^(src\/lib\/supabase\/admin|src\/lib\/supabase\/service|src\/lib\/auth\/supabase-rate-limit|src\/lib\/notifications\/push|src\/app\/api\/admin\/|src\/app\/api\/.+\/admin\/)/;
const serviceRoleLeaks = serviceRoleAll.filter((f) => !allowlist.test(f.file ?? ''));
assertCount('no-service-role-key: leaks outside admin allowlist → 0', serviceRoleLeaks, 0);

// 4. Positive fixture — synthetic bare table call MUST fire.
const posFixture = '.coderabbit/semgrep/__test__/positive-bare-table.ts';
if (existsSync(posFixture)) {
  const pos = sgScan('.coderabbit/ast-grep/no-bare-table-names.yml', posFixture);
  if (pos.length === 0) {
    console.log(`  FAIL no-bare-table-names: positive fixture ${posFixture} expected ≥ 1 finding, got 0`);
    failed += 1;
  } else {
    console.log(`  ok no-bare-table-names: positive fixture fired (${pos.length} finding[s])`);
  }
} else {
  console.log(`  SKIP positive fixture missing: ${posFixture}`);
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll review-gate rule assertions passed.');
