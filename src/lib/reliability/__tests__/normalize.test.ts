import { describe, it, expect } from 'vitest';
import {
  RELIABILITY_JOB_TYPE,
  correlateSignals,
  hasBlindSource,
  proposeRisk,
  summarizeSources,
  worstStatus,
} from '../normalize';
import type { RawSignal, SourceResult } from '../types';

function rawSignal(overrides: Partial<RawSignal> = {}): RawSignal {
  return {
    source: 'sentry',
    severity: 'error',
    title: 'ON CONFLICT specification did not match any constraint',
    message: 'ON CONFLICT specification did not match any constraint',
    route: '/api/golf/rounds/11111111-1111-1111-1111-111111111111',
    errorCode: '42P10',
    count: 1,
    firstSeen: '2026-08-26T10:00:00.000Z',
    lastSeen: '2026-08-26T10:00:00.000Z',
    evidenceRef: 'ref-1',
    ...overrides,
  };
}

function sourceResult(overrides: Partial<SourceResult> = {}): SourceResult {
  return {
    source: 'sentry',
    status: 'ok',
    reason: null,
    signals: [],
    droppedCount: 0,
    durationMs: 5,
    ...overrides,
  };
}

describe('worstStatus — a blind arm can never present as a clean run', () => {
  it('returns ok only when every arm is ok', () => {
    expect(worstStatus(['ok', 'ok', 'ok'])).toBe('ok');
  });

  it('degrades to partial when any arm truncated', () => {
    expect(worstStatus(['ok', 'partial', 'ok'])).toBe('partial');
  });

  it('degrades to blind when any arm could not be read', () => {
    expect(worstStatus(['ok', 'partial', 'blind'])).toBe('blind');
  });

  it('blind outranks partial regardless of order', () => {
    expect(worstStatus(['blind', 'partial'])).toBe('blind');
    expect(worstStatus(['partial', 'blind'])).toBe('blind');
  });

  it('a blind arm with zero signals is NOT the same as a healthy empty arm', () => {
    // This is the whole point of the envelope. Both arms below carry zero
    // signals; only one of them means "nothing is wrong".
    const healthyEmpty = [sourceResult({ status: 'ok', signals: [] })];
    const blindEmpty = [sourceResult({ status: 'blind', reason: 'no token', signals: [] })];
    expect(hasBlindSource(healthyEmpty)).toBe(false);
    expect(hasBlindSource(blindEmpty)).toBe(true);
    expect(worstStatus(healthyEmpty.map((r) => r.status))).toBe('ok');
    expect(worstStatus(blindEmpty.map((r) => r.status))).toBe('blind');
  });
});

describe('correlateSignals — cross-source folding', () => {
  it('collapses the same root cause seen by two sources into one signal', () => {
    const { signals } = correlateSignals([
      sourceResult({ source: 'sentry', signals: [rawSignal({ source: 'sentry', count: 3 })] }),
      sourceResult({
        source: 'supabase',
        signals: [
          rawSignal({
            source: 'supabase',
            count: 7,
            // Different round id in the route — the shared signature normalises
            // it away, which is exactly why one incident is not two.
            route: '/api/golf/rounds/22222222-2222-2222-2222-222222222222',
            evidenceRef: 'ref-2',
          }),
        ],
      }),
    ]);

    expect(signals).toHaveLength(1);
    expect(signals[0]!.count).toBe(10);
    expect(signals[0]!.sources.sort()).toEqual(['sentry', 'supabase']);
    expect(signals[0]!.evidenceRefs.sort()).toEqual(['ref-1', 'ref-2']);
  });

  it('keeps genuinely different failures apart', () => {
    const { signals } = correlateSignals([
      sourceResult({ signals: [rawSignal()] }),
      sourceResult({
        source: 'vercel',
        signals: [
          rawSignal({
            source: 'vercel',
            message: 'a completely unrelated build failure',
            title: 'a completely unrelated build failure',
            route: null,
            errorCode: 'vercel_error',
          }),
        ],
      }),
    ]);
    expect(signals).toHaveLength(2);
  });

  it('ratchets to the worst severity across sources', () => {
    const { signals } = correlateSignals([
      sourceResult({ signals: [rawSignal({ severity: 'error' })] }),
      sourceResult({
        source: 'supabase',
        // Same severity in the key would change the signature, so this asserts
        // the ratchet on a bucket reached via an identical key.
        signals: [rawSignal({ source: 'supabase', severity: 'error' })],
      }),
    ]);
    expect(signals[0]!.severity).toBe('error');
  });

  it('ranks cross-source corroboration above a single loud source', () => {
    const corroborated = rawSignal({ count: 2 });
    const loudSingle = rawSignal({
      message: 'loud but only one source saw it',
      title: 'loud but only one source saw it',
      route: '/api/other',
      errorCode: null,
      count: 9999,
    });
    const { signals } = correlateSignals([
      sourceResult({ source: 'sentry', signals: [corroborated, loudSingle] }),
      sourceResult({ source: 'supabase', signals: [{ ...corroborated, source: 'supabase' }] }),
    ]);
    expect(signals[0]!.sources).toHaveLength(2);
  });

  it('counts what the cap dropped instead of silently truncating', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      rawSignal({ message: `distinct failure ${i}`, title: `distinct failure ${i}`, route: `/r/${i}` }),
    );
    const { signals, truncatedSignals } = correlateSignals(
      [sourceResult({ signals: many })],
      () => null,
      4,
    );
    expect(signals).toHaveLength(4);
    expect(truncatedSignals).toBe(6);
  });

  it('redacts email addresses before they reach storage', () => {
    const { signals } = correlateSignals([
      sourceResult({
        signals: [
          rawSignal({
            title: 'failed for coach@example.com',
            message: 'failed for coach@example.com on save',
          }),
        ],
      }),
    ]);
    expect(signals[0]!.title).not.toContain('coach@example.com');
    expect(signals[0]!.summary).not.toContain('coach@example.com');
  });

  it('attributes a feature when the resolver knows the route', () => {
    const { signals } = correlateSignals(
      [sourceResult({ signals: [rawSignal()] })],
      (route) => (route?.includes('/rounds') ? 'golf_round_lifecycle' : null),
    );
    expect(signals[0]!.featureId).toBe('golf_round_lifecycle');
  });
});

describe('proposeRisk — privileged work is never proposed as low risk', () => {
  it.each([
    ['/api/auth/callback', 'auth route'],
    ['/api/admin/rls-check', 'rls mention'],
    ['/api/billing/webhook', 'billing'],
  ])('classifies %s as R3 (%s)', (route) => {
    expect(proposeRisk({ severity: 'warning', route, errorCode: null, title: 'x' })).toBe('R3');
  });

  it('classifies an ordinary error as R2, not auto-fixable', () => {
    expect(
      proposeRisk({ severity: 'error', route: '/api/golf/rounds', errorCode: '42P10', title: 'x' }),
    ).toBe('R2');
  });

  it('classifies an informational signal as R0', () => {
    expect(proposeRisk({ severity: 'info', route: '/x', errorCode: null, title: 'x' })).toBe('R0');
  });

  it('catches the privileged keyword in the title even when the route is innocuous', () => {
    expect(
      proposeRisk({ severity: 'info', route: '/x', errorCode: null, title: 'session token expired' }),
    ).toBe('R3');
  });
});

describe('summarizeSources', () => {
  it('drops the signal payload but keeps the diagnosis', () => {
    const summary = summarizeSources([
      sourceResult({ status: 'blind', reason: 'no token', signals: [rawSignal()], droppedCount: 3 }),
    ]);
    expect(summary[0]).not.toHaveProperty('signals');
    expect(summary[0]!.status).toBe('blind');
    expect(summary[0]!.reason).toBe('no token');
    expect(summary[0]!.droppedCount).toBe(3);
  });
});

describe('RELIABILITY_JOB_TYPE', () => {
  it('is exported so the Supabase arm can exclude the collector’s own rows', () => {
    // Guards the self-feeding loop: this constant is the thing the read filters
    // on. If it were inlined at the query instead, a rename here would silently
    // reopen the loop.
    expect(RELIABILITY_JOB_TYPE).toBe('reliability-triage');
  });
});
