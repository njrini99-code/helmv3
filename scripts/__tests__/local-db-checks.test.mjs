// See vitest.config.ts for why a file under scripts/__tests__/ must be named explicitly to run.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { advisorKeys, lintKeys, newFindings, isLocalUrl } from '../db/local-db-checks.mjs';

test('advisorKeys uses cache_key, falling back to name + detail', () => {
  assert.deepEqual(
    advisorKeys([{ cache_key: 'auth_rls_init_plan_public_x' }, { name: 'duplicate_index', detail: 'd' }]),
    ['advisor:auth_rls_init_plan_public_x', 'advisor:duplicate_index:d'],
  );
  assert.deepEqual(advisorKeys(undefined), []);
});

test('lintKeys flattens function issues', () => {
  const report = {
    results: [{ function: 'public.f', issues: [{ level: 'error', message: 'boom' }] }],
  };
  assert.deepEqual(lintKeys(report), ['lint:public.f:error:boom']);
  assert.deepEqual(lintKeys({}), []);
});

test('newFindings returns only keys missing from the baseline, de-duplicated', () => {
  assert.deepEqual(newFindings(['a', 'b', 'b', 'c'], ['a']), ['b', 'c']);
  assert.deepEqual(newFindings(['a'], ['a', 'z']), []);
});

test('isLocalUrl accepts only loopback hosts', () => {
  assert.equal(isLocalUrl('postgresql://postgres:postgres@127.0.0.1:54322/postgres'), true);
  assert.equal(isLocalUrl('postgresql://u:p@localhost:5432/db'), true);
  assert.equal(isLocalUrl('postgresql://u:p@db.abcdefghijklmnopqrst.supabase.co:5432/postgres'), false);
  assert.equal(isLocalUrl('not a url'), false);
});
