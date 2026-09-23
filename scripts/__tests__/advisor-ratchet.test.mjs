// D4 (db-tooling-drift). See vitest.config.ts for why a file under
// scripts/__tests__/ must be named explicitly to run.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { tallyByClass, findRegressions } from '../db/advisor-ratchet.mjs';

test('tallyByClass counts findings by name, falling back to cache_key', () => {
  const payload = {
    lints: [
      { name: 'unused_index' },
      { name: 'unused_index' },
      { cache_key: 'no_primary_key' },
    ],
  };
  assert.deepEqual(tallyByClass(payload), { unused_index: 2, no_primary_key: 1 });
});

test('tallyByClass returns {} for an empty or missing lints array', () => {
  assert.deepEqual(tallyByClass({}), {});
  assert.deepEqual(tallyByClass({ lints: [] }), {});
});

test('findRegressions flags a class that grew past its baseline', () => {
  const current = { unused_index: 5, rls_enabled_no_policy: 7 };
  const baseline = { unused_index: 3, rls_enabled_no_policy: 7 };
  assert.deepEqual(findRegressions(current, baseline), [
    { class: 'unused_index', current: 5, baseline: 3 },
  ]);
});

test('findRegressions treats a brand-new class as a regression against an absent baseline key', () => {
  const current = { new_finding: 1 };
  const baseline = {};
  assert.deepEqual(findRegressions(current, baseline), [
    { class: 'new_finding', current: 1, baseline: 0 },
  ]);
});

test('findRegressions returns [] when nothing grew (shrinking is fine)', () => {
  const current = { unused_index: 1 };
  const baseline = { unused_index: 3 };
  assert.deepEqual(findRegressions(current, baseline), []);
});
