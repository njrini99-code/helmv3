import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'seed-baseball-stats.mjs');

const HARDCODED_JWT = /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/;
const HARDCODED_URL = /qmnssrrolpinvwjjnufo\.supabase\.co/;

test('seed-baseball-stats.mjs has no committed secrets (#417)', async () => {
  const text = await readFile(SCRIPT, 'utf8');
  assert.equal(HARDCODED_JWT.test(text), false, 'must not contain a service-role JWT');
  assert.equal(HARDCODED_URL.test(text), false, 'must not hardcode production Supabase URL');
});

test('seed-baseball-stats.mjs is dry-run by default and guards production', async () => {
  const text = await readFile(SCRIPT, 'utf8');
  assert.match(text, /dryRun = !confirm/);
  assert.match(text, /--confirm/);
  assert.match(text, /--allow-prod/);
  assert.match(text, /KNOWN_PROD_PROJECT_REF/);
});

test('seed-baseball-stats.mjs uses deterministic upserts instead of delete-then-insert', async () => {
  const text = await readFile(SCRIPT, 'utf8');
  assert.doesNotMatch(text, /\.delete\(\)/);
  assert.match(text, /upsert/);
  assert.match(text, /detId/);
});
