// NOTE: this file previously imported `test`/`assert` from `node:test`, which
// only runs under the `node --test` CLI. Nothing in package.json or CI ever
// invoked that runner, and vitest's config only globs `src/**`, so this guard
// silently never executed — a second, independent reason #516's hardcoded
// service-role JWT survived undetected for months. It now uses vitest (wired
// into the `unit` project in vitest.config.ts) so `npm test` actually runs it.
import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPTS_DIR = join(REPO_ROOT, 'scripts');

const HARDCODED_JWT = /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/;
const HARDCODED_PROD_URL = /qmnssrrolpinvwjjnufo\.supabase\.co/;
// Known-leaked demo credential (#516 follow-up) — must never be reintroduced
// literally, even for the developer's own demo accounts. Real values belong
// in env vars only (see scripts/seed-rini-baseball-demo.ts).
const KNOWN_LEAKED_DEMO_PASSWORD = /Pirates#09/;
const PASSWORD_LITERAL_ASSIGNMENT =
  /\b(?:const|let|var)\s+[$\w]*(?:PASS|PASSWORD|PW)[$\w]*\s*=\s*(?:process\.env\.[A-Z0-9_]+\s*\|\|\s*)?(['"`])([^'"`\n]{8,})\1/g;
const PASSWORD_PROPERTY_LITERAL = /\bpassword\s*:\s*(['"`])([^'"`\n]{8,})\1/g;

const SCRIPT_EXTENSIONS = new Set(['.ts', '.mjs', '.js', '.cjs', '.sh']);
const GENERIC_PASSWORD_ALLOWLIST = new Set([
  'scripts/seed-baseball-e2e.ts::TestCoach123!',
  'scripts/seed-baseball-e2e.ts::TestPlayer123!',
  'scripts/seed-baseball-e2e.ts::BaseballE2eSeed2026!',
  'scripts/ui-smoke.mjs::Demo2026',
  'scripts/seed-baseball-lifting-demo.ts::BaseballDemo2026',
  'scripts/gen-appstore-screenshots.mjs::Demo2026',
  'scripts/seed-baseball-roster.mjs::HelmSeed2026!!',
  'scripts/verify-ios-itinerary-create.mjs::DenisonBigRed2026!',
  'scripts/seed-baseball-demo.ts::BaseballDemo2026',
  'scripts/seed-baseball-demo-program.ts::BaseballDemo2026',
  'scripts/setup-admin.ts::Helm2026!!',
]);
const SECRET_FIXTURE_ALLOWLIST = new Set([
  'scripts/__tests__/check-required-env.test.mjs::prod-url-fixture',
  'scripts/__tests__/seed-baseball-stats.safety.test.mjs::jwt-prefix-fixture',
]);

/**
 * Every script file, recursively, excluding tests/fixtures/node_modules.
 *
 * Historically (#516) this guard only covered `seed-baseball-*.{mjs,ts}`
 * (added for #391), which is why nine other scripts named directly in #516
 * (check-policies.ts, check-rls.ts, db-health-check.ts,
 * debug-player-insert.mjs, diagnose-rls.ts, fix-auth.mjs, import-via-api.mjs,
 * list-orphan-players.ts, run-sql.mjs) kept a live hardcoded production
 * service-role JWT for months after the issue was marked closed, undetected
 * by both this test and CI gitleaks (which only scans new commits, not the
 * full existing tree). This guard now scans every script so a narrow glob
 * can never again hide a repo-wide finding.
 */
async function listScriptFiles(dir, acc = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      await listScriptFiles(full, acc);
    } else if (SCRIPT_EXTENSIONS.has(extname(entry.name))) {
      acc.push(full);
    }
  }
  return acc;
}

function findNewPasswordLiteralOffenders(rel, text) {
  if (rel === 'scripts/__tests__/scripts-no-committed-secrets.test.mjs') return [];

  const offenders = [];
  for (const pattern of [PASSWORD_LITERAL_ASSIGNMENT, PASSWORD_PROPERTY_LITERAL]) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const literal = match[2];
      if (literal.startsWith('(') && literal.endsWith(')')) continue;
      if (!GENERIC_PASSWORD_ALLOWLIST.has(`${rel}::${literal}`)) {
        offenders.push(`${rel} (${literal})`);
      }
    }
  }
  return offenders;
}

function hasBlockedKnownSecret(rel, text) {
  if (rel === 'scripts/__tests__/scripts-no-committed-secrets.test.mjs') return false;
  if (
    HARDCODED_PROD_URL.test(text) &&
    !SECRET_FIXTURE_ALLOWLIST.has(`${rel}::prod-url-fixture`)
  ) {
    return true;
  }
  if (
    HARDCODED_JWT.test(text) &&
    !SECRET_FIXTURE_ALLOWLIST.has(`${rel}::jwt-prefix-fixture`)
  ) {
    return true;
  }
  return KNOWN_LEAKED_DEMO_PASSWORD.test(text);
}

describe('scripts secret hygiene', () => {
  it('no script commits service-role JWTs, prod Supabase URLs, or new hardcoded passwords (#516)', async () => {
    const files = await listScriptFiles(SCRIPTS_DIR);
    const offenders = [];
    for (const file of files) {
      let text;
      try {
        text = await readFile(file, 'utf8');
      } catch {
        continue;
      }
      const rel = file.replace(`${REPO_ROOT}/`, '');
      if (hasBlockedKnownSecret(rel, text)) {
        offenders.push(file.replace(`${REPO_ROOT}/`, ''));
      }
      offenders.push(...findNewPasswordLiteralOffenders(rel, text));
    }
    expect(offenders, `committed secrets found in:\n${offenders.join('\n')}`).toEqual([]);
  });
});
