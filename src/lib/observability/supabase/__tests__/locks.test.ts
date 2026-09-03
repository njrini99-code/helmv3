import { describe, it, expect } from 'vitest';
import { evaluateLockSnapshot, DEFAULT_LOCK_THRESHOLDS, type LockSnapshotRow } from '../locks';

function row(overrides: Partial<LockSnapshotRow> = {}): LockSnapshotRow {
  return {
    pid: 100,
    roleClass: 'app',
    state: 'active',
    durationMs: 0,
    isWaitingOnLock: false,
    safeQueryClass: 'select golf_rounds',
    blockingQueryClass: null,
    blockedPidCount: 0,
    relationName: null,
    ...overrides,
  };
}

describe('evaluateLockSnapshot — app role thresholds', () => {
  it('produces nothing at or below the warning threshold for a long-active app query', () => {
    const result = evaluateLockSnapshot({ rows: [row({ durationMs: 5_000 })], deadlocksDelta: null });
    expect(result).toEqual([]);
  });

  it('flags warning just above the active threshold (5000ms)', () => {
    const result = evaluateLockSnapshot({ rows: [row({ durationMs: 5_001 })], deadlocksDelta: null });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'long_active', severity: 'warning', roleClass: 'app' });
  });

  it('flags critical at exactly the active critical threshold (8000ms)', () => {
    const result = evaluateLockSnapshot({ rows: [row({ durationMs: 8_000 })], deadlocksDelta: null });
    expect(result[0]).toMatchObject({ kind: 'long_active', severity: 'critical' });
  });

  it('flags idle-in-tx using the idle-in-tx pair, not the active pair', () => {
    const result = evaluateLockSnapshot({
      rows: [row({ state: 'idle in transaction', durationMs: 6_000 })],
      deadlocksDelta: null,
    });
    expect(result[0]).toMatchObject({ kind: 'idle_in_tx', severity: 'warning' });
  });

  it('flags lock_wait using the lock-wait pair even when state is active', () => {
    const result = evaluateLockSnapshot({
      rows: [
        row({
          state: 'active',
          isWaitingOnLock: true,
          durationMs: 2_500,
          blockingQueryClass: 'update golf_rounds',
          blockedPidCount: 1,
          relationName: 'golf_rounds',
        }),
      ],
      deadlocksDelta: null,
    });
    expect(result[0]).toMatchObject({
      kind: 'lock_wait',
      severity: 'warning',
      blockingQueryClass: 'update golf_rounds',
      blockedPidCount: 1,
      relationName: 'golf_rounds',
    });
  });

  it('lock-wait takes priority over long_active for the same waiting row', () => {
    const result = evaluateLockSnapshot({
      rows: [row({ state: 'active', isWaitingOnLock: true, durationMs: 9_000 })],
      deadlocksDelta: null,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('lock_wait');
  });
});

describe('evaluateLockSnapshot — service role thresholds', () => {
  it('does not flag a service-role query at a duration that would be critical for an app role', () => {
    const result = evaluateLockSnapshot({
      rows: [row({ roleClass: 'service', durationMs: 9_000 })],
      deadlocksDelta: null,
    });
    expect(result).toEqual([]);
  });

  it('flags a service-role long-active query at its own 20s/30s posture', () => {
    const warning = evaluateLockSnapshot({
      rows: [row({ roleClass: 'service', durationMs: 20_001 })],
      deadlocksDelta: null,
    });
    expect(warning[0]).toMatchObject({ severity: 'warning', roleClass: 'service' });

    const critical = evaluateLockSnapshot({
      rows: [row({ roleClass: 'service', durationMs: 30_000 })],
      deadlocksDelta: null,
    });
    expect(critical[0]).toMatchObject({ severity: 'critical', roleClass: 'service' });
  });

  it('other roles reuse the service posture, not the app posture', () => {
    const result = evaluateLockSnapshot({
      rows: [row({ roleClass: 'other', durationMs: 9_000 })],
      deadlocksDelta: null,
    });
    expect(result).toEqual([]);
  });
});

describe('evaluateLockSnapshot — deadlocks', () => {
  it('does not synthesize a deadlock candidate when deadlocksDelta is null (no signal, not zero)', () => {
    const result = evaluateLockSnapshot({ rows: [], deadlocksDelta: null });
    expect(result).toEqual([]);
  });

  it('does not synthesize a deadlock candidate when deadlocksDelta is 0', () => {
    const result = evaluateLockSnapshot({ rows: [], deadlocksDelta: 0 });
    expect(result).toEqual([]);
  });

  it('synthesizes exactly one critical deadlock candidate with a null blockedQueryClass, feeding a NULL-safe dedupe', () => {
    const result = evaluateLockSnapshot({ rows: [], deadlocksDelta: 1 });
    expect(result).toEqual([
      {
        kind: 'deadlock',
        severity: 'critical',
        roleClass: 'other',
        waitMs: null,
        blockedQueryClass: null,
        blockingQueryClass: null,
        blockedPidCount: null,
        relationName: null,
      },
    ]);
  });

  it('combines a deadlock candidate alongside row-derived candidates in the same evaluation', () => {
    const result = evaluateLockSnapshot({
      rows: [row({ durationMs: 9_000 })],
      deadlocksDelta: 2,
    });
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.kind).sort()).toEqual(['deadlock', 'long_active']);
  });
});

describe('evaluateLockSnapshot — custom thresholds', () => {
  it('honors an explicit thresholds override instead of the defaults', () => {
    const custom = {
      ...DEFAULT_LOCK_THRESHOLDS,
      app: { ...DEFAULT_LOCK_THRESHOLDS.app, active: { warningMs: 100, criticalMs: 200 } },
    };
    const result = evaluateLockSnapshot({ rows: [row({ durationMs: 150 })], deadlocksDelta: null, thresholds: custom });
    expect(result[0]).toMatchObject({ severity: 'warning' });
  });
});
