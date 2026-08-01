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
// Requires: ast-grep (sg) on PATH. Skipped (not failed) when absent.
//
// This previously ran as a bare script via `node
// scripts/__tests__/review-gate-rules.test.mjs` (it never registered a
// `node:test` case, so it was never picked up by `node --test` either —
// nothing invoked it). Promoted to vitest (issue #1194): the ast-grep
// scan logic is unchanged. Two things did change in the port:
//   - The missing-`sg` "SKIP" path used `process.exit(0)`, which under
//     vitest would tear down the whole worker process instead of just this
//     test — replaced with `test.skipIf(...)`, vitest's proper skip.
//   - The failure path used `process.exit(1)` — replaced with a vitest
//     assertion.
// Both `sgScan`'s relative rule/path args and the plain `existsSync('supabase/functions')`
// / fixture path relied on a `process.chdir(repoRoot)` call at module scope.
// That's process-global state, and vitest runs multiple test files in a
// shared process, so a chdir here would race with other files. Replaced
// with an explicit `cwd: repoRoot` option on the `sg` spawnSync call and
// repoRoot-resolved absolute paths for the `existsSync` checks — same
// target files, no reliance on the ambient cwd.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

function which(bin) {
  const r = spawnSync('which', [bin], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

const sgAvailable = !!which('sg');

test.skipIf(!sgAvailable)('Review Gate rule smoke test', () => {
  const repoRoot = resolve(import.meta.dirname, '../..');

  function sgScan(rule, ...paths) {
    const result = spawnSync('sg', ['scan', '--rule', rule, '--json', ...paths], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      cwd: repoRoot,
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

  const failures = [];
  function assertCount(label, findings, expected) {
    const actual = findings.length;
    if (actual !== expected) {
      failures.push(
        `${label}: ${actual} finding(s), expected ${expected}\n` +
          findings
            .slice(0, 5)
            .map((f) => `     ${f.file}:${f.range?.start?.line ?? '?'}`)
            .join('\n'),
      );
    }
  }

  // 1. no-bare-table-names — should be ZERO on src/.
  const bare = sgScan('.coderabbit/ast-grep/no-bare-table-names.yml', 'src');
  assertCount('no-bare-table-names: src/ → 0 findings', bare, 0);

  // 2. no-process-env-in-edge — should be ZERO on supabase/functions/.
  if (existsSync(resolve(repoRoot, 'supabase/functions'))) {
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
  if (existsSync(resolve(repoRoot, posFixture))) {
    const pos = sgScan('.coderabbit/ast-grep/no-bare-table-names.yml', posFixture);
    if (pos.length === 0) {
      failures.push(`no-bare-table-names: positive fixture ${posFixture} expected ≥ 1 finding, got 0`);
    }
  }

  assert.equal(
    failures.length,
    0,
    `${failures.length} Review Gate rule assertion(s) failed:\n${failures.join('\n')}`,
  );
});
