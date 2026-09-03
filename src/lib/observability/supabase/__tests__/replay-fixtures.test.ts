import { describe, it, expect } from 'vitest';
import { REPLAY_FIXTURES } from '../__fixtures__/replay-fixtures';
import {
  compareFixture,
  fingerprintGroups,
  persistedStringsOf,
  replayFixture,
  replayRecorderBehaviour,
} from '../__fixtures__/replay-runner';
import { ALL_SENTINELS, SENTINEL_FRAGMENTS } from '../__fixtures__/privacy-sentinels';

/**
 * Brief 57 - the replay fixtures, run through the REAL pipeline with an
 * injected fake client. No database of any kind is reachable from here: the
 * fake client is passed in explicitly, so `createAdminClient()` is never
 * called and no service-role secret is read.
 */

describe('replay fixtures - classification contract', () => {
  it.each(REPLAY_FIXTURES.map((f) => [f.id, f] as const))(
    '%s classifies exactly as the fixture declares',
    (_id, fixture) => {
      const result = compareFixture(fixture);
      expect(result.mismatches).toEqual([]);
    },
  );

  it('covers every mechanism the brief names', () => {
    const ids = REPLAY_FIXTURES.map((f) => f.id);
    for (const required of [
      'authorization_denial_42501',
      'unique_violation_race_23505',
      'deadlock_40P01',
      'statement_timeout_57014',
      'round_missing_race_PGRST116',
      'stale_optimistic_lock',
      'schema_mismatch_42703',
      'zero_row_update',
    ]) {
      expect(ids).toContain(required);
    }
  });
});

describe('replay fixtures - the discriminating pairs', () => {
  it('separates an expected 42501 from an unexpected one', () => {
    const unexpected = replayFixture(REPLAY_FIXTURES.find((f) => f.id === 'authorization_denial_42501')!);
    const expectedDenial = replayFixture(REPLAY_FIXTURES.find((f) => f.id === 'authorization_denial_42501_expected')!);

    expect(unexpected.bucket).toBe('actionable_error');
    expect(expectedDenial.bucket).toBe('expected_control_flow');
    // The distinction has to reach the RECORDER, not just the return value:
    // an expected denial must produce no durable write at all.
    expect(unexpected.recorderCalls).toHaveLength(1);
    expect(expectedDenial.recorderCalls).toEqual([]);
  });

  it('separates an idempotent 23505 from a genuine race', () => {
    const race = replayFixture(REPLAY_FIXTURES.find((f) => f.id === 'unique_violation_race_23505')!);
    const idempotent = replayFixture(REPLAY_FIXTURES.find((f) => f.id === 'unique_violation_expected_23505')!);
    expect(race.bucket).toBe('actionable_warning');
    expect(idempotent.bucket).toBe('routine_recovery');
    expect(idempotent.recorderCalls).toEqual([]);
  });
});

describe('replay fixtures - privacy sentinels', () => {
  it.each(REPLAY_FIXTURES.filter((f) => f.expected.recorded).map((f) => [f.id, f] as const))(
    '%s persists no sentinel secret or PII anywhere',
    (_id, fixture) => {
      const { envelope } = replayFixture(fixture);
      expect(envelope).not.toBeNull();
      const persisted = persistedStringsOf(envelope!).join(' ');
      for (const sentinel of ALL_SENTINELS) {
        expect(persisted).not.toContain(sentinel);
      }
      // Fragments too: a redactor that replaced the full string but left its
      // distinctive tail would pass the check above and still be leaking.
      for (const fragment of SENTINEL_FRAGMENTS) {
        expect(persisted).not.toContain(fragment);
      }
    },
  );

  it('proves the sweep fixture really did carry every sentinel in', () => {
    // Guards the guard: if a future edit dropped the sentinels from the
    // fixture input, every assertion above would pass vacuously.
    const fixture = REPLAY_FIXTURES.find((f) => f.id === 'privacy_sentinel_sweep')!;
    const raw = JSON.stringify(fixture.input);
    for (const sentinel of ALL_SENTINELS) {
      expect(raw).toContain(sentinel);
    }
  });

  it('keeps a UUID out of the persisted record even in a constraint message', () => {
    const { envelope } = replayFixture(REPLAY_FIXTURES.find((f) => f.id === 'unique_violation_race_23505')!);
    expect(envelope!.safeDetails).toContain('[id]');
    expect(envelope!.safeDetails).not.toContain('11111111');
  });
});

describe('replay fixtures - dedupe', () => {
  it('gives one mechanism one fingerprint across repeated occurrences', () => {
    const fixture = REPLAY_FIXTURES.find((f) => f.id === 'deadlock_40P01')!;
    const first = replayFixture(fixture);
    const second = replayFixture(fixture);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.fingerprint).not.toBe('');
  });

  it('never collapses two DIFFERENT mechanisms into one fingerprint', () => {
    const groups = fingerprintGroups(REPLAY_FIXTURES);
    const collisions = [...groups.entries()].filter(([, ids]) => ids.length > 1);
    expect(collisions).toEqual([]);
  });

  it('documents that the fingerprint ignores `action`', () => {
    // Not a bug being asserted as correct - a MEASURED dedupe boundary.
    // buildSupabaseFingerprint reads service|feature|operation|rpc-or-relation|code
    // and deliberately not `action`, so two different actions on the same
    // relation with the same code share one dedupe key. Recorded here so the
    // boundary is visible rather than discovered during an incident.
    const a = replayFixture({
      id: 'x', title: 'x', path: 'observe_result',
      input: { error: { code: '57014', message: 'timeout' }, operation: 'update', feature: 'round_tracking', action: 'action_one', relation: 'golf_rounds' },
      expected: REPLAY_FIXTURES[0]!.expected,
    });
    const b = replayFixture({
      id: 'y', title: 'y', path: 'observe_result',
      input: { error: { code: '57014', message: 'timeout' }, operation: 'update', feature: 'round_tracking', action: 'action_two', relation: 'golf_rounds' },
      expected: REPLAY_FIXTURES[0]!.expected,
    });
    expect(a.fingerprint).toBe(b.fingerprint);
  });
});

describe('replay fixtures - the recorder path itself', () => {
  it('sends the envelope to record_db_error_event with the fingerprint as the dedupe key', async () => {
    const { envelope } = replayFixture(REPLAY_FIXTURES.find((f) => f.id === 'deadlock_40P01')!);
    const { outcome, calls } = await replayRecorderBehaviour(envelope!, 'ok');
    expect(outcome.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe('record_db_error_event');
    expect(calls[0]!.args.p_fingerprint).toBe(envelope!.fingerprint);
    expect(calls[0]!.args.p_sqlstate).toBe('40P01');
  });

  it('treats the HELD migration as a clean no-op, not a failure', async () => {
    // record_db_error_event does not exist in production today
    // (supabase/migrations/HELD.md). The recorder must not log a confusing
    // "RPC not found" on every actionable failure until it is applied.
    const { envelope } = replayFixture(REPLAY_FIXTURES.find((f) => f.id === 'deadlock_40P01')!);
    const { outcome } = await replayRecorderBehaviour(envelope!, 'migration-not-applied');
    expect(outcome.ok).toBe(true);
    expect(outcome.skipped).toBe('migration-not-applied');
  });

  it('fails open when the client itself throws', async () => {
    const { envelope } = replayFixture(REPLAY_FIXTURES.find((f) => f.id === 'deadlock_40P01')!);
    const { outcome } = await replayRecorderBehaviour(envelope!, 'throws');
    expect(outcome.ok).toBe(false);
    expect(outcome.failure).toBeDefined();
  });
});
