import { describe, expect, it } from 'vitest';
import {
  ALERT_POLICY_RULES,
  classifyWorkload,
  computeWorkloadBudget,
  detectRetryStorm,
  evaluateAlertPolicy,
  type AlertSignals,
  type RetryStormEvent,
} from '../alert-policy';

describe('evaluateAlertPolicy', () => {
  it('returns one row per declared rule, in table order', () => {
    const result = evaluateAlertPolicy({}, { baselineStatus: 'collecting' });
    expect(result.alerts).toHaveLength(ALERT_POLICY_RULES.length);
    expect(result.alerts.map((a) => a.rule.id)).toEqual(ALERT_POLICY_RULES.map((r) => r.id));
  });

  it('treats an absent signal as unknown, never as clear', () => {
    const result = evaluateAlertPolicy({}, { baselineStatus: 'collecting' });
    for (const alert of result.alerts) {
      expect(alert.state).toBe('unknown');
      expect(alert.reason).toBeTruthy();
    }
    expect(result.unknownCount).toBe(ALERT_POLICY_RULES.length);
    expect(result.firingCount).toBe(0);
  });

  it('treats an explicit known:false signal as unknown with the given reason', () => {
    const signals: AlertSignals = {
      db_unavailable: { known: false, reason: 'overview reader returned status: error' },
    };
    const result = evaluateAlertPolicy(signals, { baselineStatus: 'collecting' });
    const row = result.alerts.find((a) => a.rule.id === 'db_unavailable')!;
    expect(row.state).toBe('unknown');
    expect(row.reason).toBe('overview reader returned status: error');
  });

  it('reports clear when a signal is known and not firing', () => {
    const signals: AlertSignals = { db_unavailable: { known: true, firing: false } };
    const result = evaluateAlertPolicy(signals, { baselineStatus: 'ready' });
    const row = result.alerts.find((a) => a.rule.id === 'db_unavailable')!;
    expect(row.state).toBe('clear');
    expect(row.evidence).toBeNull();
  });

  it('reports firing with evidence and suppressedBy when a signal fires', () => {
    const signals: AlertSignals = {
      repeated_storage_database_timeout: {
        known: true,
        firing: true,
        evidence: '3 DatabaseTimeout events in 15m',
        suppressedBy: ['db_unavailable'],
      },
    };
    const result = evaluateAlertPolicy(signals, { baselineStatus: 'ready' });
    const row = result.alerts.find((a) => a.rule.id === 'repeated_storage_database_timeout')!;
    expect(row.state).toBe('firing');
    expect(row.evidence).toBe('3 DatabaseTimeout events in 15m');
    expect(row.suppressedBy).toEqual(['db_unavailable']);
  });

  it('never drops a firing alert because it is suppressedBy another', () => {
    const signals: AlertSignals = {
      db_unavailable: { known: true, firing: true, evidence: 'pg_up=0' },
      pool_exhaustion: { known: true, firing: true, evidence: 'connections at max', suppressedBy: ['db_unavailable'] },
    };
    const result = evaluateAlertPolicy(signals, { baselineStatus: 'ready' });
    expect(result.alerts.find((a) => a.rule.id === 'db_unavailable')?.state).toBe('firing');
    expect(result.alerts.find((a) => a.rule.id === 'pool_exhaustion')?.state).toBe('firing');
    expect(result.firingCount).toBe(2);
  });

  it('propagates baselineStatus unchanged', () => {
    expect(evaluateAlertPolicy({}, { baselineStatus: 'ready' }).baselineStatus).toBe('ready');
    expect(evaluateAlertPolicy({}, { baselineStatus: 'collecting' }).baselineStatus).toBe('collecting');
  });

  it('every rule id is unique and every severity is one of the four literals', () => {
    const ids = ALERT_POLICY_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of ALERT_POLICY_RULES) {
      expect(['P0', 'P1', 'P2', 'TELEMETRY_DEFECT']).toContain(rule.severity);
    }
  });
});

describe('detectRetryStorm', () => {
  function event(overrides: Partial<RetryStormEvent> = {}): RetryStormEvent {
    return {
      fingerprint: 'supabase|postgrest|round_tracking|rpc|save_partial_round_atomic|PGRST003',
      mechanism: 'postgrest_client_retry',
      attempt: null,
      occurrenceCount: 1,
      timeBucket: '2026-09-03T12:00:00.000Z',
      ...overrides,
    };
  }

  it('does not flag a mechanism below its threshold', () => {
    expect(detectRetryStorm([event({ occurrenceCount: 9 })])).toEqual([]);
  });

  it('flags PGRST003 client retries at the x10 threshold from the brief', () => {
    const findings = detectRetryStorm([event({ occurrenceCount: 10 })]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'postgrest_client_retry', attemptsObserved: 10, threshold: 10 });
  });

  it('uses the larger of attempt and occurrenceCount', () => {
    const findings = detectRetryStorm([event({ attempt: 15, occurrenceCount: 3 })]);
    expect(findings[0]?.attemptsObserved).toBe(15);
  });

  it('never evaluates mechanism "other"', () => {
    expect(detectRetryStorm([event({ mechanism: 'other', occurrenceCount: 999 })])).toEqual([]);
  });

  it('applies a distinct, higher threshold for auth getUser storms', () => {
    expect(detectRetryStorm([event({ mechanism: 'auth_getuser_storm', occurrenceCount: 10 })])).toEqual([]);
    const findings = detectRetryStorm([event({ mechanism: 'auth_getuser_storm', occurrenceCount: 20 })]);
    expect(findings).toHaveLength(1);
  });

  it('flags realtime reconnect loops and unbounded pg_net retries independently', () => {
    const findings = detectRetryStorm([
      event({ mechanism: 'realtime_reconnect_loop', occurrenceCount: 5, fingerprint: 'a' }),
      event({ mechanism: 'pg_net_unbounded_retry', occurrenceCount: 10, fingerprint: 'b' }),
    ]);
    expect(findings.map((f) => f.kind).sort()).toEqual(['pg_net_unbounded_retry', 'realtime_reconnect_loop']);
  });

  it('scopes findings per fingerprint/timeBucket — does not sum across buckets', () => {
    const findings = detectRetryStorm([
      event({ occurrenceCount: 5, timeBucket: '2026-09-03T12:00:00.000Z' }),
      event({ occurrenceCount: 5, timeBucket: '2026-09-03T13:00:00.000Z' }),
    ]);
    expect(findings).toEqual([]);
  });
});

describe('classifyWorkload', () => {
  it('passes through every known source class unchanged', () => {
    for (const cls of ['helm_product', 'supabase_realtime', 'pg_net_job', 'pg_cron_job', 'observability', 'unknown']) {
      expect(classifyWorkload(cls)).toBe(cls);
    }
  });

  it('defaults an unrecognized string to unknown rather than inventing a category', () => {
    expect(classifyWorkload('maintenance')).toBe('unknown');
    expect(classifyWorkload('realtime_logical_replication')).toBe('unknown');
  });

  it('defaults null/undefined to unknown', () => {
    expect(classifyWorkload(null)).toBe('unknown');
    expect(classifyWorkload(undefined)).toBe('unknown');
  });
});

describe('computeWorkloadBudget', () => {
  it('sums ms by classified workload and zero-fills every class', () => {
    const budget = computeWorkloadBudget([
      { sourceClass: 'helm_product', ms: 100 },
      { sourceClass: 'helm_product', ms: 50 },
      { sourceClass: 'supabase_realtime', ms: 200 },
      { sourceClass: 'not_a_real_class', ms: 10 },
      { sourceClass: null, ms: 5 },
    ]);
    expect(budget).toEqual({
      helm_product: 150,
      supabase_realtime: 200,
      pg_net_job: 0,
      pg_cron_job: 0,
      observability: 0,
      unknown: 15,
    });
  });

  it('treats a null ms as zero, never as a skip that hides the row from its class', () => {
    const budget = computeWorkloadBudget([{ sourceClass: 'observability', ms: null }]);
    expect(budget.observability).toBe(0);
  });
});
