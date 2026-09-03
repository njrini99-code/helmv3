import { describe, it, expect } from 'vitest';
import {
  RELIABILITY_JOB_TYPE,
  RELIABILITY_SNAPSHOT_JOB_TYPE,
  RELIABILITY_SELF_EVENT_TITLE,
  correlateSignals,
  hasBlindSource,
  proposeRisk,
  summarizeSources,
  worstStatus,
} from '../normalize';
import { CRON_REGISTRY } from '@/lib/admin/cron-registry';
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
  countBasis: 'window' as const,
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
    bounded: false,
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

  it('degrades to degraded when a rate-limited arm survived retry but still has no data', () => {
    expect(worstStatus(['ok', 'partial', 'degraded'])).toBe('degraded');
  });

  it('blind still outranks degraded — a dead source is worse than a rate-limited one', () => {
    expect(worstStatus(['degraded', 'blind'])).toBe('blind');
    expect(worstStatus(['blind', 'degraded'])).toBe('blind');
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
    expect(signals[0]!.evidence).toEqual([
      { source: 'sentry', ref: 'ref-1' },
      { source: 'supabase', ref: 'ref-2' },
    ]);
  });

  it('keeps every evidence ref attributed to the source that produced it', () => {
    // The regression this replaces: `sources` and `evidenceRefs` were parallel
    // arrays deduped on DIFFERENT keys, and the view paired them by index. One
    // source contributing two refs — two Sentry issues folding to one signature,
    // the common case — shifted every later index by one, so a Supabase
    // fingerprint got attributed to Sentry and silently stopped rendering as a
    // drill-through to /admin/errors/<fingerprint>.
    //
    // Asserting pairs at the fold is the only place this is catchable: a test
    // that hands `evidenceTarget` a matched (ref, source) pair can never see it.
    const { signals } = correlateSignals([
      sourceResult({
        source: 'sentry',
        signals: [
          rawSignal({ source: 'sentry', evidenceRef: 'https://sentry.io/issues/1/' }),
          rawSignal({ source: 'sentry', evidenceRef: 'https://sentry.io/issues/2/' }),
        ],
      }),
      sourceResult({
        source: 'supabase',
        signals: [rawSignal({ source: 'supabase', evidenceRef: 'a1b2c3d4' })],
      }),
    ]);

    expect(signals).toHaveLength(1);
    const fingerprint = signals[0]!.evidence.find((e) => e.ref === 'a1b2c3d4');
    expect(fingerprint?.source).toBe('supabase');
    expect(signals[0]!.evidence.filter((e) => e.source === 'sentry')).toHaveLength(2);
  });

  it('dedupes evidence on the PAIR, so two sources may report the same ref', () => {
    const shared = 'same-ref';
    const { signals } = correlateSignals([
      sourceResult({ source: 'sentry', signals: [rawSignal({ source: 'sentry', evidenceRef: shared })] }),
      sourceResult({ source: 'supabase', signals: [rawSignal({ source: 'supabase', evidenceRef: shared })] }),
    ]);
    expect(signals[0]!.evidence).toEqual([
      { source: 'sentry', ref: shared },
      { source: 'supabase', ref: shared },
    ]);
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

  it('correlates one root cause even when sources RATE IT DIFFERENTLY', () => {
    // The common real case, and the one a severity-bearing key silently breaks:
    // Sentry says `error` for plenty of conditions this app logs as `warning`.
    // If severity were part of the correlation key these would be two entries
    // and the "confirmed by 2 sources" badge — the reason this tab exists apart
    // from the Errors tab — would never fire.
    const { signals } = correlateSignals([
      sourceResult({ source: 'sentry', signals: [rawSignal({ source: 'sentry', severity: 'error' })] }),
      sourceResult({
        source: 'supabase',
        signals: [rawSignal({ source: 'supabase', severity: 'warning' })],
      }),
    ]);

    expect(signals).toHaveLength(1);
    expect(signals[0]!.sources.sort()).toEqual(['sentry', 'supabase']);
    // And the fold keeps the WORSE of the two, never the last one written.
    expect(signals[0]!.severity).toBe('error');
  });

  it('ratchets to the worst severity regardless of arrival order', () => {
    const lowThenHigh = correlateSignals([
      sourceResult({ source: 'sentry', signals: [rawSignal({ source: 'sentry', severity: 'info' })] }),
      sourceResult({ source: 'supabase', signals: [rawSignal({ source: 'supabase', severity: 'critical' })] }),
    ]);
    const highThenLow = correlateSignals([
      sourceResult({ source: 'sentry', signals: [rawSignal({ source: 'sentry', severity: 'critical' })] }),
      sourceResult({ source: 'supabase', signals: [rawSignal({ source: 'supabase', severity: 'info' })] }),
    ]);
    // The length assertions are not decoration. Without them these two pass
    // under a BROKEN implementation: a severity-bearing key splits each pair
    // into two entries, and the sort puts `critical` first, so reading only
    // signals[0].severity finds 'critical' either way. Asserting the fold
    // happened at all is what makes this test able to fail.
    expect(lowThenHigh.signals).toHaveLength(1);
    expect(highThenLow.signals).toHaveLength(1);
    expect(lowThenHigh.signals[0]!.severity).toBe('critical');
    expect(highThenLow.signals[0]!.severity).toBe('critical');
  });

  it('re-derives the risk tier after a severity ratchet', () => {
    // proposeRisk reads severity, so a bucket whose severity worsened during
    // the fold must not keep the tier computed from the first row seen.
    const { signals } = correlateSignals([
      sourceResult({ source: 'sentry', signals: [rawSignal({ source: 'sentry', severity: 'info' })] }),
      sourceResult({ source: 'supabase', signals: [rawSignal({ source: 'supabase', severity: 'critical' })] }),
    ]);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.severity).toBe('critical');
    expect(signals[0]!.proposedRisk).toBe('R2');
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
      sourceResult({ status: 'blind', reason: 'no token', signals: [rawSignal()], bounded: true }),
    ]);
    expect(summary[0]).not.toHaveProperty('signals');
    expect(summary[0]!.status).toBe('blind');
    expect(summary[0]!.reason).toBe('no token');
    expect(summary[0]!.bounded).toBe(true);
  });
});

describe('job types — the two rows a run writes must stay distinct', () => {
  it('is exported so the Supabase arm can exclude the collector’s own rows', () => {
    // Guards the self-feeding loop: this constant is the thing the read filters
    // on. If it were inlined at the query instead, a rename here would silently
    // reopen the loop.
    expect(RELIABILITY_JOB_TYPE).toBe('reliability-triage');
  });

  it('the cron-board job type and the snapshot job type are NOT the same', () => {
    // If these collided, the Bridge would read back `recordJobRun`'s row — which
    // carries only top-level scalars, arrays having been stripped by design —
    // and render every run as "recorded but unreadable". The two rows exist
    // precisely because one format cannot serve both consumers.
    expect(RELIABILITY_SNAPSHOT_JOB_TYPE).not.toBe(RELIABILITY_JOB_TYPE);
  });

  it('the cron-board job type is the one registered in CRON_REGISTRY', () => {
    // The registry drives the Jobs board, the cadence contract test, and the
    // job-log coverage test. The SNAPSHOT type is deliberately absent from it:
    // it is a payload store, not a scheduled job, and registering it would make
    // the board expect a cron that does not exist.
    const registered = CRON_REGISTRY.map((e) => e.jobType);
    expect(registered).toContain(RELIABILITY_JOB_TYPE);
    expect(registered).not.toContain(RELIABILITY_SNAPSHOT_JOB_TYPE);
  });

  it('the self-emission title matches what recordJobRun actually writes', () => {
    // job-log.ts builds `Cron failed: ${jobType}`. Deriving it here rather than
    // hard-coding keeps the exclusion filter correct through a rename.
    expect(RELIABILITY_SELF_EVENT_TITLE).toBe(`Cron failed: ${RELIABILITY_JOB_TYPE}`);
  });
});
