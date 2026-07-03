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

const SCRIPT_EXTENSIONS = new Set(['.ts', '.mjs', '.js', '.cjs', '.sh']);

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
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      await listScriptFiles(full, acc);
    } else if (SCRIPT_EXTENSIONS.has(extname(entry.name))) {
      acc.push(full);
    }
  }
  return acc;
}

describe('scripts secret hygiene', () => {
  it('no script commits a service-role JWT, prod Supabase URL, or known-leaked demo password (#516)', async () => {
    const files = await listScriptFiles(SCRIPTS_DIR);
    const offenders = [];
    for (const file of files) {
      let text;
      try {
        text = await readFile(file, 'utf8');
      } catch {
        continue;
      }
      if (
        HARDCODED_JWT.test(text) ||
        HARDCODED_PROD_URL.test(text) ||
        KNOWN_LEAKED_DEMO_PASSWORD.test(text)
      ) {
        offenders.push(file.replace(`${REPO_ROOT}/`, ''));
      }
    }
    expect(offenders, `committed secrets found in:\n${offenders.join('\n')}`).toEqual([]);
  });
});
