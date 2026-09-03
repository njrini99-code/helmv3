import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseFlagsYaml, validateFlag, validateFlags, renderRegistryModule, NEVER_GATE_KEYWORDS } from '../lib.mjs';

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

describe('parseFlagsYaml', () => {
  test('parses a flags: array', () => {
    const parsed = parseFlagsYaml('flags:\n  - feature_id: a\n    owner: x\n');
    assert.deepEqual(parsed, [{ feature_id: 'a', owner: 'x' }]);
  });

  test('empty document parses to an empty array', () => {
    assert.deepEqual(parseFlagsYaml(''), []);
  });

  test('throws when there is no top-level flags: array', () => {
    assert.throws(() => parseFlagsYaml('not_flags: []\n'));
  });
});

describe('validateFlag — clean cases', () => {
  test('a fully valid release flag has no issues', () => {
    assert.deepEqual(validateFlag(baseFlag(), { now: NOW }), []);
  });

  test('operations_kill_switch with kill_switch_behavior and no expiry is clean', () => {
    const flag = baseFlag({ type: 'operations_kill_switch', kill_switch_behavior: 'Pauses X.', expires_at: null });
    assert.deepEqual(validateFlag(flag, { now: NOW }), []);
  });

  test('temporary_migration with a future expires_at is clean', () => {
    const flag = baseFlag({ type: 'temporary_migration', expires_at: '2099-01-01' });
    assert.deepEqual(validateFlag(flag, { now: NOW }), []);
  });
});

describe('validateFlag — governance violations', () => {
  test('expired_active: status active, expires_at in the past', () => {
    const issues = validateFlag(baseFlag({ expires_at: '2020-01-01' }), { now: NOW });
    assert.ok(issues.some((i) => i.rule === 'expired_active'));
  });

  test('an archived flag with a past expires_at is NOT an expired_active violation', () => {
    const issues = validateFlag(baseFlag({ status: 'archived', expires_at: '2020-01-01' }), { now: NOW });
    assert.ok(!issues.some((i) => i.rule === 'expired_active'));
  });

  test('missing_owner', () => {
    const issues = validateFlag(baseFlag({ owner: '' }), { now: NOW });
    assert.ok(issues.some((i) => i.rule === 'missing_owner'));
  });

  test('missing_cleanup_plan', () => {
    const issues = validateFlag(baseFlag({ cleanup_plan: undefined }), { now: NOW });
    assert.ok(issues.some((i) => i.rule === 'missing_cleanup_plan'));
  });

  test('temporary_migration_missing_expiry', () => {
    const issues = validateFlag(baseFlag({ type: 'temporary_migration', expires_at: null }), { now: NOW });
    assert.ok(issues.some((i) => i.rule === 'temporary_migration_missing_expiry'));
  });

  test('temporary_migration_expired', () => {
    const issues = validateFlag(baseFlag({ type: 'temporary_migration', expires_at: '2020-01-01' }), { now: NOW });
    assert.ok(issues.some((i) => i.rule === 'temporary_migration_expired'));
    // Also trips the generic expired_active rule, since status is active.
    assert.ok(issues.some((i) => i.rule === 'expired_active'));
  });

  test('missing_kill_switch_behavior only applies to operations_kill_switch', () => {
    const opsSwitch = validateFlag(baseFlag({ type: 'operations_kill_switch', kill_switch_behavior: null }), { now: NOW });
    assert.ok(opsSwitch.some((i) => i.rule === 'missing_kill_switch_behavior'));

    const release = validateFlag(baseFlag({ type: 'release', kill_switch_behavior: null }), { now: NOW });
    assert.ok(!release.some((i) => i.rule === 'missing_kill_switch_behavior'));
  });

  test('non_boolean_environment rejects a percentage — canary is explicitly deferred', () => {
    const issues = validateFlag(baseFlag({ environment: { production: 0.05, preview: false, development: false } }), { now: NOW });
    assert.ok(issues.some((i) => i.rule === 'non_boolean_environment' && i.detail.includes('production')));
  });

  test('non_boolean_environment on a missing key', () => {
    const issues = validateFlag(baseFlag({ environment: { production: false, preview: false } }), { now: NOW });
    assert.ok(issues.some((i) => i.rule === 'non_boolean_environment' && i.detail.includes('development')));
  });

  test('invalid_type and invalid_status', () => {
    const issues = validateFlag(baseFlag({ type: 'bogus', status: 'bogus' }), { now: NOW });
    assert.ok(issues.some((i) => i.rule === 'invalid_type'));
    assert.ok(issues.some((i) => i.rule === 'invalid_status'));
  });
});

describe('validateFlag — never-gate', () => {
  for (const keyword of NEVER_GATE_KEYWORDS) {
    test(`rejects a purpose containing "${keyword}"`, () => {
      const issues = validateFlag(baseFlag({ purpose: `This flag is about ${keyword} things.` }), { now: NOW });
      assert.ok(issues.some((i) => i.rule === 'never_gate'));
    });
  }

  test('rejects a feature_id containing a never-gate keyword even with an innocuous purpose', () => {
    const issues = validateFlag(baseFlag({ feature_id: 'auth_experiment', purpose: 'Totally fine.' }), { now: NOW });
    assert.ok(issues.some((i) => i.rule === 'never_gate' && i.detail.includes('feature_id')));
  });
});

describe('validateFlags — duplicates', () => {
  test('flags a repeated feature_id', () => {
    const issues = validateFlags([baseFlag({ feature_id: 'dup' }), baseFlag({ feature_id: 'dup' })], { now: NOW });
    assert.ok(issues.some((i) => i.rule === 'duplicate_feature_id'));
  });

  test('does not flag two distinct feature_ids', () => {
    const issues = validateFlags([baseFlag({ feature_id: 'a' }), baseFlag({ feature_id: 'b' })], { now: NOW });
    assert.ok(!issues.some((i) => i.rule === 'duplicate_feature_id'));
  });
});

describe('renderRegistryModule', () => {
  test('is deterministic — same input renders byte-identical output', () => {
    const flags = [baseFlag({ feature_id: 'b' }), baseFlag({ feature_id: 'a' })];
    assert.equal(renderRegistryModule(flags), renderRegistryModule(flags));
  });

  test('sorts by feature_id regardless of input order', () => {
    const rendered = renderRegistryModule([baseFlag({ feature_id: 'zeta' }), baseFlag({ feature_id: 'alpha' })]);
    assert.ok(rendered.indexOf('"alpha"') < rendered.indexOf('"zeta"'));
  });

  test('emits a typed FLAG_REGISTRY constant importing FlagDefinition', () => {
    const rendered = renderRegistryModule([baseFlag()]);
    assert.match(rendered, /import type \{ FlagDefinition \} from '\.\/types';/);
    assert.match(rendered, /export const FLAG_REGISTRY: readonly FlagDefinition\[\] = \[/);
    assert.match(rendered, /\] as const;/);
  });

  test('renders expires_at: null literally, not the string "null"', () => {
    const rendered = renderRegistryModule([baseFlag({ expires_at: null })]);
    assert.match(rendered, /expires_at: null,/);
  });
});
