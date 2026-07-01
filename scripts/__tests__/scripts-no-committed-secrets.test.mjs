import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPTS_DIR = join(REPO_ROOT, 'scripts');

const HARDCODED_JWT = /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/;
const HARDCODED_PROD_URL = /qmnssrrolpinvwjjnufo\.supabase\.co/;

/** Baseball seed / roster scripts in scope for #391 (incremental hardening). */
const BASEBALL_SEED_GLOB = /^seed-baseball-.*\.(mjs|ts)$/;

async function listSeedScripts(dir, acc = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      await listSeedScripts(full, acc);
    } else if (BASEBALL_SEED_GLOB.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

test('baseball seed scripts do not commit service-role JWTs or prod URLs (#391)', async () => {
  const files = await listSeedScripts(SCRIPTS_DIR);
  const offenders = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    if (HARDCODED_JWT.test(text) || HARDCODED_PROD_URL.test(text)) {
      offenders.push(file.replace(`${REPO_ROOT}/`, ''));
    }
  }
  assert.equal(
    offenders.length,
    0,
    `committed secrets found in:\n${offenders.join('\n')}`,
  );
});
