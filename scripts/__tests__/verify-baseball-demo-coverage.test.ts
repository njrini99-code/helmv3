import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SURFACE_COVERAGE,
  INTENTIONALLY_EMPTY,
  evaluateCoverage,
  formatReportLine,
} from '../verify-baseball-demo-coverage';

test('evaluateCoverage passes a required surface with rows', () => {
  const entry = SURFACE_COVERAGE[0];
  const result = evaluateCoverage(entry, 5, null);
  assert.equal(result.pass, true);
  assert.equal(result.count, 5);
  assert.equal(result.errorMessage, null);
});

test('evaluateCoverage fails a required surface with zero rows', () => {
  const entry = SURFACE_COVERAGE[0];
  assert.equal(entry.required, true);
  const result = evaluateCoverage(entry, 0, null);
  assert.equal(result.pass, false);
});

test('evaluateCoverage never fails an optional surface, even at zero rows', () => {
  const optionalEntry = { ...SURFACE_COVERAGE[0], required: false };
  const result = evaluateCoverage(optionalEntry, 0, null);
  assert.equal(result.pass, true);
});

test('evaluateCoverage treats a query error on a required surface as a failure', () => {
  const entry = SURFACE_COVERAGE[0];
  const result = evaluateCoverage(entry, null, 'relation does not exist');
  assert.equal(result.pass, false);
  assert.equal(result.errorMessage, 'relation does not exist');
});

test('evaluateCoverage does not fail the run on a query error for an optional surface', () => {
  const optionalEntry = { ...SURFACE_COVERAGE[0], required: false };
  const result = evaluateCoverage(optionalEntry, null, 'relation does not exist');
  assert.equal(result.pass, true);
});

test('formatReportLine renders PASS/FAIL/SKIP and the row count or error', () => {
  const entry = SURFACE_COVERAGE[0];
  const pass = formatReportLine(evaluateCoverage(entry, 3, null));
  assert.match(pass, /\[PASS\]/);
  assert.match(pass, /3 row\(s\)/);

  const fail = formatReportLine(evaluateCoverage(entry, 0, null));
  assert.match(fail, /\[FAIL\]/);

  const optionalEntry = { ...entry, required: false };
  const skip = formatReportLine(evaluateCoverage(optionalEntry, null, 'boom'));
  assert.match(skip, /\[SKIP\]/);
  assert.match(skip, /ERROR \(boom\)/);
});

test('every required surface in the contract has a non-empty table and route', () => {
  for (const entry of SURFACE_COVERAGE) {
    // helm_lifting_* is the cross-sport Helm Lift Lab table family (org_id +
    // sport-scoped, not name-prefixed per sport) — a sanctioned sibling to
    // baseball_*, same as src/lib/admin/__tests__/feature-registry.test.ts.
    assert.ok(
      entry.table.startsWith('baseball_') || entry.table.startsWith('helm_lifting_'),
      `${entry.table} must be sport-prefixed (baseball_) or a Helm Lift Lab table (helm_lifting_)`,
    );
    assert.ok(entry.route.length > 0, `${entry.table} must map to a route`);
  }
});

test('intentionally-empty surfaces do not overlap the required coverage list', () => {
  const requiredTables = new Set(SURFACE_COVERAGE.map((e) => e.table));
  for (const entry of INTENTIONALLY_EMPTY) {
    assert.equal(
      requiredTables.has(entry.table),
      false,
      `${entry.table} is listed as both required and intentionally-empty`,
    );
  }
});
