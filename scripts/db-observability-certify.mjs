#!/usr/bin/env node
/**
 * Certification matrix runner - brief 58.
 *
 * For each scenario the brief names, prints what the system SHOULD produce
 * and what was actually established. Three verdicts, and only one of them
 * affects the exit code:
 *
 *   PASS          established in this process
 *   FAIL          established and false  -> exit 1
 *   NOT_VERIFIED  needs a live database or a deployed environment -> exit 0,
 *                 reported with the reason
 *
 * A NOT_VERIFIED is never a pass and never a failure. Treating it as either
 * is how a certification report ends up asserting things nobody checked.
 *
 * Usage:
 *   node scripts/db-observability-certify.mjs            # human report
 *   node scripts/db-observability-certify.mjs --json     # machine report
 *   node scripts/db-observability-certify.mjs --failures # only FAIL rows
 *
 * NEVER TOUCHES A DATABASE. Every exercised claim runs the real production
 * function with an injected fake client; every claim that would need real
 * infrastructure is reported NOT_VERIFIED rather than attempted.
 *
 * Re-execs itself under the tsx ESM loader and aliases `server-only` for the
 * same reasons db-observability-replay.mjs does - see that file's header.
 */
import { spawnSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOOTSTRAP_FLAG = 'HELM_CERTIFY_TSX_LOADER';

if (!process.env[BOOTSTRAP_FLAG]) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx/esm', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit', env: { ...process.env, [BOOTSTRAP_FLAG]: '1' } },
  );
  process.exit(result.status ?? 1);
}

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only' || specifier === 'client-only') {
      return {
        url: pathToFileURL(join(REPO_ROOT, 'src/test/stubs/server-only.ts')).href,
        shortCircuit: true,
      };
    }
    return next(specifier, context);
  },
});

const JSON_MODE = process.argv.includes('--json');
const FAILURES_ONLY = process.argv.includes('--failures');

const { runCertification, summarizeCertification, REQUIRED_SCENARIO_IDS } = await import(
  '../src/lib/observability/supabase/__fixtures__/certification.ts'
);

const scenarios = runCertification();
const summary = summarizeCertification(scenarios);

// A scenario the brief names but nobody built is a FAILURE, not an absence.
// Without this, deleting a scenario would quietly improve the report.
const missing = REQUIRED_SCENARIO_IDS.filter((id) => !scenarios.some((s) => s.id === id));

if (JSON_MODE) {
  console.log(
    JSON.stringify(
      {
        ok: summary.ok && missing.length === 0,
        pass: summary.pass,
        fail: summary.fail,
        notVerified: summary.notVerified,
        missingScenarios: missing,
        scenarios,
      },
      null,
      2,
    ),
  );
  process.exit(summary.ok && missing.length === 0 ? 0 : 1);
}

console.log('\nSupabase observability certification - brief 58\n');

for (const scenario of scenarios) {
  const rows = FAILURES_ONLY ? scenario.claims.filter((c) => c.verdict === 'FAIL') : scenario.claims;
  if (rows.length === 0) continue;
  console.log(`${scenario.id}`);
  console.log(`  ${scenario.title}`);
  for (const c of rows) {
    const tag =
      c.verdict === 'PASS'
        ? `PASS (${c.evidenceKind})`
        : c.verdict === 'FAIL'
          ? 'FAIL'
          : `NOT VERIFIED (${c.evidenceKind})`;
    console.log(`    ${c.label.padEnd(46)} ${tag}`);
    console.log(`      should: ${c.expected}`);
    console.log(`      why:    ${c.evidence}`);
  }
  console.log('');
}

if (missing.length > 0) {
  console.log(`MISSING SCENARIOS (named by the brief, not built): ${missing.join(', ')}\n`);
}

console.log('Summary');
console.log(`  PASS          ${summary.pass}`);
console.log(`  FAIL          ${summary.fail}`);
console.log(`  NOT VERIFIED  ${summary.notVerified}   (never a pass; exit code ignores these)`);
console.log(
  `\n${summary.ok && missing.length === 0 ? 'PASS' : 'FAIL'} - no database was contacted; every unverifiable claim is named above with its reason.\n`,
);

process.exit(summary.ok && missing.length === 0 ? 0 : 1);
