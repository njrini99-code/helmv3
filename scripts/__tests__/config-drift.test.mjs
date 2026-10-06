// See vitest.config.ts for why a file under scripts/__tests__/ must be named explicitly to run.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { driftedPaths, unexpectedDrift } from '../db/config-drift.mjs';

test('driftedPaths joins and sorts change paths', () => {
  const report = { changes: [{ path: ['db', 'pooler', 'max_client_conn'] }, { path: ['auth', 'site_url'] }] };
  assert.deepEqual(driftedPaths(report), ['auth.site_url', 'db.pooler.max_client_conn']);
  assert.deepEqual(driftedPaths({}), []);
});

test('unexpectedDrift honours accepted paths and their children only', () => {
  const paths = ['auth.email.smtp.host', 'auth.email.smtp_extra', 'auth.site_url'];
  assert.deepEqual(unexpectedDrift(paths, ['auth.email.smtp']), ['auth.email.smtp_extra', 'auth.site_url']);
  assert.deepEqual(unexpectedDrift([], ['x']), []);
});
