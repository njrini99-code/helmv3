import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  REQUIRED_SCENARIO_IDS,
  runCertification,
  stripCodeComments,
  summarizeCertification,
  type CertificationClaim,
} from '../__fixtures__/certification';

/**
 * Brief 58 - the certification matrix's own tests.
 *
 * Two jobs. First, that the matrix covers what the brief names and reports
 * no FAIL against today's code. Second - and this is the one that matters
 * more - that the matrix cannot LIE: a NOT_VERIFIED must never be counted as
 * a pass, a missing scenario must not quietly improve the report, and a
 * source check must read behaviour rather than the prose describing it.
 */

function allClaims(): CertificationClaim[] {
  return runCertification().flatMap((s) => s.claims);
}

describe('certification matrix - coverage', () => {
  it('includes every scenario the brief names', () => {
    const ids = runCertification().map((s) => s.id);
    for (const required of REQUIRED_SCENARIO_IDS) {
      expect(ids).toContain(required);
    }
  });

  it('gives every scenario at least one claim', () => {
    for (const scenario of runCertification()) {
      expect(scenario.claims.length).toBeGreaterThan(0);
    }
  });

  it('reports no FAIL against the current code', () => {
    const summary = summarizeCertification(runCertification());
    const failures = summary.scenarios.flatMap((s) =>
      s.claims.filter((c) => c.verdict === 'FAIL').map((c) => `${s.id}/${c.id}: ${c.evidence}`),
    );
    expect(failures).toEqual([]);
  });
});

describe('certification matrix - it cannot report a false pass', () => {
  it('never counts NOT_VERIFIED as a pass', () => {
    const summary = summarizeCertification(runCertification());
    const notVerified = allClaims().filter((c) => c.verdict === 'NOT_VERIFIED');
    expect(notVerified.length).toBe(summary.notVerified);
    expect(summary.pass).toBe(allClaims().filter((c) => c.verdict === 'PASS').length);
    // The two must not overlap: a claim is exactly one verdict.
    expect(summary.pass + summary.fail + summary.notVerified).toBe(allClaims().length);
  });

  it('keeps `ok` true only because nothing FAILED, not because things were unverifiable', () => {
    const summary = summarizeCertification(runCertification());
    expect(summary.ok).toBe(summary.fail === 0);
    // There ARE unverifiable claims today; if this ever hits zero the
    // assertion above stops testing anything.
    expect(summary.notVerified).toBeGreaterThan(0);
  });

  it('states a reason for every NOT_VERIFIED', () => {
    for (const c of allClaims().filter((x) => x.verdict === 'NOT_VERIFIED')) {
      expect(c.evidence.length).toBeGreaterThan(20);
      expect(['requires_live_db', 'requires_deployment']).toContain(c.evidenceKind);
    }
  });

  it('states what SHOULD happen even for claims it cannot settle', () => {
    for (const c of allClaims()) {
      expect(c.expected.length).toBeGreaterThan(0);
    }
  });

  it('marks every durable-row claim NOT_VERIFIED while the migration is held', () => {
    // record_db_error_event does not exist in production. A matrix that
    // reported a persisted row as PASS would be asserting something nobody
    // could have checked - shipping.md's trap G8 exactly.
    const rowClaims = allClaims().filter(
      (c) => c.id === 'durable_db_error_event_persisted' || c.id === 'bridge_event_persisted',
    );
    expect(rowClaims.length).toBeGreaterThan(0);
    for (const c of rowClaims) expect(c.verdict).toBe('NOT_VERIFIED');
  });
});

describe('certification matrix - source checks read behaviour, not prose', () => {
  it('strips comments before matching, so a denial cannot read as an admission', () => {
    // The bug this closes, found by this suite's own first run:
    // observe-result.ts's header says "It does not call
    // `Sentry.captureException`", and a raw /Sentry\.captureException/ over
    // the file matched that sentence and reported the opposite of the truth.
    const stripped = stripCodeComments(
      [
        '/**',
        ' * This module does NOT call Sentry.captureException.',
        ' */',
        'const x = 1; // nor Sentry.captureMessage here',
        'export default x;',
      ].join('\n'),
    );
    expect(stripped).toContain('const x = 1;');
    expect(stripped).not.toContain('Sentry.captureException');
    expect(stripped).not.toContain('Sentry.captureMessage');
  });

  it('keeps a URL in code intact rather than eating it as a line comment', () => {
    const stripped = stripCodeComments("const u = 'https://example.invalid/a'; // trailing\n");
    expect(stripped).toContain('https://example.invalid/a');
    expect(stripped).not.toContain('trailing');
  });

  it('still finds a real call when one is there', () => {
    // Guards the guard: a stripper that returned '' would pass both checks
    // above vacuously. That is not hypothetical - the first version of this
    // test did exactly that, because readRepoCode silently returned '' for
    // an absolute path and `not.toContain` is true of the empty string.
    const stripped = stripCodeComments('Sentry.captureException(err); // real call above\n');
    expect(stripped).toContain('Sentry.captureException');
  });
});

describe('certification matrix - the discriminating outcomes', () => {
  it('records that an expected 23505 dispatches nothing at all', () => {
    const scenario = runCertification().find((s) => s.id === 'sqlstate_23505_expected')!;
    const dispatch = scenario.claims.find((c) => c.id === 'durable_db_error_event_dispatched')!;
    expect(dispatch.verdict).toBe('PASS');
    expect(dispatch.evidence).toContain('0 time(s)');
  });

  it('records that an unexpected 42501 DOES dispatch one durable write', () => {
    const scenario = runCertification().find((s) => s.id === 'sqlstate_42501_unexpected')!;
    const dispatch = scenario.claims.find((c) => c.id === 'durable_db_error_event_dispatched')!;
    expect(dispatch.verdict).toBe('PASS');
    expect(dispatch.evidence).toContain('1 time(s)');
  });

  it('separates an expected Storage miss from an unexpected one', () => {
    const scenario = runCertification().find((s) => s.id === 'storage_missing_object_expected')!;
    const discriminator = scenario.claims.find((c) => c.id === 'discriminates_from_unexpected')!;
    expect(discriminator.verdict).toBe('PASS');
  });

  it('separates a wrong password from a broken auth provider', () => {
    const scenario = runCertification().find((s) => s.id === 'auth_synthetic_actionable_failure')!;
    const discriminator = scenario.claims.find((c) => c.id === 'discriminates_from_expected')!;
    expect(discriminator.verdict).toBe('PASS');
  });

  it('refuses to render an unreadable telemetry source as healthy', () => {
    const scenario = runCertification().find((s) => s.id === 'telemetry_source_unreadable')!;
    for (const id of ['classification', 'not_rendered_healthy', 'unknown_is_never_zero']) {
      expect(scenario.claims.find((c) => c.id === id)!.verdict).toBe('PASS');
    }
  });

  it('proves the business action survives every observability failure it models', () => {
    const unaffected = allClaims().filter((c) => c.id === 'business_action_unaffected');
    expect(unaffected.length).toBeGreaterThan(5);
    for (const c of unaffected) expect(c.verdict).toBe('PASS');
  });
});

describe('certification matrix - Realtime capture, exercised rather than read', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('actually captures to Sentry on CHANNEL_ERROR, once per channel class', async () => {
    // The matrix settles this statically. This proves the static claim is
    // true by running the real wrapper against a fake channel - belt and
    // braces, so a wiring claim is backed by behaviour somewhere.
    const captureMessage = vi.fn();
    vi.doMock('@sentry/nextjs', () => ({
      captureMessage,
      captureException: vi.fn(),
      addBreadcrumb: vi.fn(),
      withScope: vi.fn(),
    }));
    const { observeRealtimeChannel, __resetRealtimeCaptureDedupeForTests } = await import('../realtime');
    __resetRealtimeCaptureDedupeForTests();

    let emit: ((status: string) => void) | null = null;
    const channel = {
      subscribe(cb?: (status: string, err?: Error) => void) {
        emit = (status: string) => cb?.(status);
        return this;
      },
    };

    const returned = observeRealtimeChannel(channel, {
      feature: 'calendar',
      channelClass: 'calendar_events',
      subscriptionType: 'postgres_changes',
    });
    // The caller's own channel comes back, so existing cleanup still works.
    expect(returned).toBe(channel);

    emit!('CHANNEL_ERROR');
    emit!('CHANNEL_ERROR');

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0]![0]).toContain('CHANNEL_ERROR');
  });
});
