import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * #418 — seed scripts must never create college players with recruiting activated.
 *
 * Run via: node --test scripts/__tests__/seed-recruiting-invariant.test.mjs
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const SEED_DIR = join(REPO_ROOT, 'scripts');

const SEED_FILES = [
  'seed-baseball-roster.mjs',
  'seed-baseball-demo.ts',
  'seed-rini-baseball-demo.ts',
];

const COLLEGE_RECRUITING_TRUE =
  /player_type:\s*['"]college['"][\s\S]{0,200}?recruiting_activated:\s*true/;

const COLLEGE_RECRUITING_TRUE_REVERSE =
  /recruiting_activated:\s*true[\s\S]{0,200}?player_type:\s*['"]college['"]/;

test('seed scripts do not pair college player_type with recruiting_activated: true', async () => {
  for (const file of SEED_FILES) {
    const text = await readFile(join(SEED_DIR, file), 'utf8');
    assert.equal(
      COLLEGE_RECRUITING_TRUE.test(text),
      false,
      `${file} must not set recruiting_activated: true on college players`,
    );
    assert.equal(
      COLLEGE_RECRUITING_TRUE_REVERSE.test(text),
      false,
      `${file} must not set recruiting_activated: true on college players`,
    );
  }
});

test('college recruiting invariant migration exists', async () => {
  const migrationsDir = join(REPO_ROOT, 'supabase', 'migrations');
  const files = await readdir(migrationsDir);
  const match = files.find(
    (f) => f.includes('college_recruiting_invariant') || f.includes('college_recruiting_check'),
  );
  assert.ok(match, 'expected a migration enforcing the college recruiting invariant');
  const sql = await readFile(join(migrationsDir, match), 'utf8');
  assert.match(sql, /player_type = 'college'/);
  assert.match(sql, /recruiting_activated/);
  assert.match(sql, /CHECK/);
});
