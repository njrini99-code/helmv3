import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkFlags, run } from '../check-feature-flags.mjs';

function baseFlag(overrides = {}) {
  return {
    feature_id: 'sample_flag',
    owner: 'platform',
    purpose: 'A sample flag for tests.',
    type: 'release',
    status: 'active',
    created_at: '2026-01-01',
    expires_at: null,
    default: false,
    environment: { production: false, preview: false, development: false },
    kill_switch_behavior: null,
    cleanup_plan: 'Delete after the pilot.',
    ...overrides,
  };
}

const NOW = new Date('2026-09-03T00:00:00Z');

describe('checkFlags', () => {
  test('a clean registry produces no issues', () => {
    assert.deepEqual(checkFlags([baseFlag()], { now: NOW }), []);
  });

  test('an expired-but-active flag is reported', () => {
    const issues = checkFlags([baseFlag({ expires_at: '2020-01-01' })], { now: NOW });
    assert.equal(issues.length, 1);
    assert.equal(issues[0].rule, 'expired_active');
  });

  test('a flag missing owner AND cleanup_plan reports both', () => {
    const issues = checkFlags([baseFlag({ owner: '', cleanup_plan: '' })], { now: NOW });
    const rules = issues.map((i) => i.rule).sort();
    assert.deepEqual(rules, ['missing_cleanup_plan', 'missing_owner']);
  });

  test('a temporary_migration flag older than its expiry is reported', () => {
    const issues = checkFlags([baseFlag({ type: 'temporary_migration', expires_at: '2020-01-01' })], { now: NOW });
    assert.ok(issues.some((i) => i.rule === 'temporary_migration_expired'));
  });

  test('a temporary_migration flag with no expires_at at all is reported', () => {
    const issues = checkFlags([baseFlag({ type: 'temporary_migration', expires_at: null })], { now: NOW });
    assert.ok(issues.some((i) => i.rule === 'temporary_migration_missing_expiry'));
  });

  test('a never-gate violation is reported', () => {
    const issues = checkFlags([baseFlag({ feature_id: 'auth_switch' })], { now: NOW });
    assert.ok(issues.some((i) => i.rule === 'never_gate'));
  });

  test('schema-only problems (e.g. bad type) are NOT governance violations this gate reports', () => {
    // scripts/flags/generate-flags.mjs blocks these at generation time
    // instead — flags:check's job is governance (expiry/ownership/
    // never-gate), not full schema validation, which would duplicate the
    // generator's own refusal-to-write behavior.
    const issues = checkFlags([baseFlag({ type: 'not_a_real_type' })], { now: NOW });
    assert.ok(!issues.some((i) => i.rule === 'invalid_type'));
  });

  test('multiple flags each contribute their own issues', () => {
    const issues = checkFlags(
      [baseFlag({ feature_id: 'a', expires_at: '2020-01-01' }), baseFlag({ feature_id: 'b', owner: '' })],
      { now: NOW },
    );
    assert.ok(issues.some((i) => i.feature_id === 'a' && i.rule === 'expired_active'));
    assert.ok(issues.some((i) => i.feature_id === 'b' && i.rule === 'missing_owner'));
  });
});

describe('run (CLI entry point, injected I/O)', () => {
  function collect() {
    const logs = [];
    const errors = [];
    return { logs, errors, log: (m) => logs.push(m), error: (m) => errors.push(m) };
  }

  test('exit 0 and a summary log on a clean registry', () => {
    const io = collect();
    const code = run({ readFile: () => [baseFlag()], now: NOW, log: io.log, error: io.error });
    assert.equal(code, 0);
    assert.equal(io.errors.length, 0);
    assert.ok(io.logs[0].includes('clean'));
  });

  test('exit 1 and one printed line per violation on a dirty registry', () => {
    const io = collect();
    const code = run({ readFile: () => [baseFlag({ owner: '' })], now: NOW, log: io.log, error: io.error });
    assert.equal(code, 1);
    assert.ok(io.errors.some((line) => line.includes('missing_owner')));
  });

  test('exit 2 when the YAML cannot be read/parsed at all', () => {
    const io = collect();
    const code = run({
      readFile: () => {
        throw new Error('boom');
      },
      now: NOW,
      log: io.log,
      error: io.error,
    });
    assert.equal(code, 2);
    assert.ok(io.errors.some((line) => line.includes('boom')));
  });
});
