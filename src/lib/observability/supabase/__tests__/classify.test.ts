import { describe, it, expect } from 'vitest';
import { classifyPostgrestError, type ClassifyContext } from '../classify';

const baseCtx: ClassifyContext = {
  operation: 'rpc',
  feature: 'round_tracking',
  action: 'save_partial_round',
  rpc: 'save_partial_round_atomic',
};

describe('classifyPostgrestError — context-sensitive codes', () => {
  it('42501 defaults to unexpected/error when the caller states nothing', () => {
    const result = classifyPostgrestError({ code: '42501', message: 'permission denied for table golf_rounds' }, baseCtx);
    expect(result.expectedness).toBe('unexpected');
    expect(result.severity).toBe('error');
    expect(result.sqlstate).toBe('42501');
  });

  it('42501 becomes expected/info when the caller declares it an authorization probe', () => {
    const result = classifyPostgrestError(
      { code: '42501', message: 'permission denied for table golf_rounds' },
      { ...baseCtx, expectedAuthorizationDenial: true },
    );
    expect(result.expectedness).toBe('expected');
    expect(result.severity).toBe('info');
  });

  it('the SAME code with different messages yields DIFFERENT expectedness across contexts', () => {
    const unexpected = classifyPostgrestError({ code: '42501', message: 'permission denied' }, baseCtx);
    const expected = classifyPostgrestError(
      { code: '42501', message: 'permission denied' },
      { ...baseCtx, expectedAuthorizationDenial: true },
    );
    expect(unexpected.expectedness).not.toBe(expected.expectedness);
  });

  it('23505 defaults to unexpected/warning (possible race) when the caller states nothing', () => {
    const result = classifyPostgrestError({ code: '23505', message: 'duplicate key value violates unique constraint' }, baseCtx);
    expect(result.expectedness).toBe('unexpected');
    expect(result.family).toBe('unique_violation');
  });

  it('23505 becomes routine_recovery when the caller declares an idempotent create', () => {
    const result = classifyPostgrestError(
      { code: '23505', message: 'duplicate key value violates unique constraint' },
      { ...baseCtx, expectedUniqueConflict: true },
    );
    expect(result.expectedness).toBe('routine_recovery');
  });

  it('23503 defaults to unexpected/warning; expectedForeignKeyViolation flips to routine_recovery', () => {
    const unexpected = classifyPostgrestError({ code: '23503', message: 'violates foreign key constraint' }, baseCtx);
    expect(unexpected.expectedness).toBe('unexpected');

    const expected = classifyPostgrestError(
      { code: '23503', message: 'violates foreign key constraint' },
      { ...baseCtx, expectedForeignKeyViolation: true },
    );
    expect(expected.expectedness).toBe('routine_recovery');
  });
});

describe('classifyPostgrestError — always-investigate SQLSTATE families (brief §9)', () => {
  it('08* connection failures classify as critical/unexpected', () => {
    const result = classifyPostgrestError({ code: '08006', message: 'connection failure' }, baseCtx);
    expect(result.family).toBe('connection');
    expect(result.severity).toBe('critical');
  });

  it.each(['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003'])('%s classifies as postgrest_transport/critical', (code) => {
    const result = classifyPostgrestError({ code, message: 'db connection error' }, baseCtx);
    expect(result.family).toBe('postgrest_transport');
    expect(result.severity).toBe('critical');
    expect(result.postgrestCode).toBe(code);
    expect(result.sqlstate).toBeNull();
  });

  it('53400 (config_limit_exceeded) classifies as insufficient_resources/critical', () => {
    const result = classifyPostgrestError({ code: '53400' }, baseCtx);
    expect(result.family).toBe('insufficient_resources');
    expect(result.severity).toBe('critical');
  });

  it('53* class prefix (e.g. 53200 out_of_memory) classifies as insufficient_resources', () => {
    const result = classifyPostgrestError({ code: '53200' }, baseCtx);
    expect(result.family).toBe('insufficient_resources');
  });

  it('40P01 (deadlock_detected) classifies as retryable/error, not critical', () => {
    const result = classifyPostgrestError({ code: '40P01', message: 'deadlock detected' }, baseCtx);
    expect(result.family).toBe('deadlock');
    expect(result.retryability).toBe('yes');
    expect(result.severity).toBe('error');
  });

  it('40001 (serialization_failure) classifies as routine_recovery, retryable', () => {
    const result = classifyPostgrestError({ code: '40001' }, baseCtx);
    expect(result.expectedness).toBe('routine_recovery');
    expect(result.retryability).toBe('yes');
  });

  it('57014 (query_canceled / statement_timeout) classifies as unexpected/error', () => {
    const result = classifyPostgrestError({ code: '57014', message: 'canceling statement due to statement timeout' }, baseCtx);
    expect(result.family).toBe('statement_timeout');
    expect(result.severity).toBe('error');
  });

  it('42P01/42703/42883/42P17 all classify as schema_missing_object/critical (release-drift signal)', () => {
    for (const code of ['42P01', '42703', '42883', '42P17']) {
      const result = classifyPostgrestError({ code }, baseCtx);
      expect(result.family, code).toBe('schema_missing_object');
      expect(result.severity, code).toBe('critical');
    }
  });

  it('XX* internal errors classify as critical with unknown retryability', () => {
    const result = classifyPostgrestError({ code: 'XX000' }, baseCtx);
    expect(result.family).toBe('internal');
    expect(result.retryability).toBe('unknown');
  });

  it('F0* config errors classify as critical/not retryable', () => {
    const result = classifyPostgrestError({ code: 'F0001' }, baseCtx);
    expect(result.family).toBe('config');
    expect(result.retryability).toBe('no');
  });

  it('22* data exceptions classify as warning/unexpected', () => {
    const result = classifyPostgrestError({ code: '22001' }, baseCtx);
    expect(result.family).toBe('data_exception');
    expect(result.severity).toBe('warning');
  });

  it('P0001 (raised business-rule exception) classifies as raised_exception/warning', () => {
    const result = classifyPostgrestError({ code: 'P0001', message: 'business rule violated' }, baseCtx);
    expect(result.family).toBe('raised_exception');
  });
});

describe('classifyPostgrestError — code-first, message as fallback only', () => {
  it('a code is used even when the message text looks nothing like the SQLSTATE family', () => {
    // Deliberately misleading message text — the code must still win.
    const result = classifyPostgrestError({ code: '40P01', message: 'connection refused' }, baseCtx);
    expect(result.family).toBe('deadlock');
  });

  it('falls back to message matching only when code is absent', () => {
    const result = classifyPostgrestError({ code: null, message: 'permission denied for relation golf_rounds' }, baseCtx);
    expect(result.family).toBe('authorization');
    expect(result.sqlstate).toBeNull();
    expect(result.postgrestCode).toBeNull();
  });

  it('an unrecognized code classifies as unknown rather than throwing', () => {
    const result = classifyPostgrestError({ code: 'ZZ999', message: 'something odd' }, baseCtx);
    expect(result.family).toBe('unknown');
  });

  it('never throws on a malformed error object', () => {
    expect(() => classifyPostgrestError({} as never, baseCtx)).not.toThrow();
    expect(() => classifyPostgrestError({ code: undefined, message: undefined }, baseCtx)).not.toThrow();
  });
});
