import { describe, it, expect } from 'vitest';
import {
  SENTRY_SUPABASE_TAG_KEYS,
  buildSentrySupabaseTags,
  sentryTagsFromEnvelope,
  buildTraceCorrelation,
  type SupabaseTraceIds,
} from '../sentry-contract';
import { buildSupabaseErrorEnvelope, type SupabaseErrorEnvelopeInput } from '../envelope';

const TRACE_IDS: SupabaseTraceIds = {
  sentryTraceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  w3cTraceId: '0af7651916cd43dd8448eb211c80319c',
  helmTraceId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
};

function envelopeInput(overrides: Partial<SupabaseErrorEnvelopeInput> = {}): SupabaseErrorEnvelopeInput {
  return {
    service: 'postgres',
    environment: 'production',
    releaseSha: 'abc1234',
    runtime: 'node',
    sport: 'golf',
    feature: 'round_tracking',
    action: 'save_partial_round',
    journey: null,
    operation: 'rpc',
    relation: 'golf_rounds',
    rpc: 'save_partial_round_atomic',
    functionName: null,
    bucketClass: null,
    code: '42501',
    sqlstate: '42501',
    postgrestCode: null,
    authCode: null,
    storageCode: null,
    httpStatus: 403,
    retryability: 'no',
    expectedness: 'unexpected',
    severity: 'error',
    normalizedMessage: 'permission denied for function save_partial_round_atomic',
    safeDetails: null,
    safeHint: null,
    sentryTraceId: TRACE_IDS.sentryTraceId,
    sentrySpanId: '00f067aa0ba902b7',
    helmTraceId: TRACE_IDS.helmTraceId,
    durationMs: 41,
    attempt: 1,
    terminal: true,
    safeMetadata: null,
    ...overrides,
  };
}

describe('the tag set is exactly the one the brief names', () => {
  it('lists the ten keys and nothing else', () => {
    expect([...SENTRY_SUPABASE_TAG_KEYS]).toEqual([
      'supabase.service',
      'supabase.operation',
      'supabase.rpc',
      'supabase.relation',
      'supabase.code',
      'postgres.sqlstate',
      'helm.feature',
      'helm.action',
      'helm.trace_id',
      'release',
    ]);
  });

  it('builds them from an envelope', () => {
    const result = sentryTagsFromEnvelope(buildSupabaseErrorEnvelope(envelopeInput()), TRACE_IDS);
    expect(result.tags['supabase.service']).toBe('postgres');
    expect(result.tags['supabase.operation']).toBe('rpc');
    expect(result.tags['supabase.rpc']).toBe('save_partial_round_atomic');
    expect(result.tags['supabase.relation']).toBe('golf_rounds');
    expect(result.tags['supabase.code']).toBe('42501');
    expect(result.tags['postgres.sqlstate']).toBe('42501');
    expect(result.tags['helm.feature']).toBe('round_tracking');
    expect(result.tags['helm.action']).toBe('save_partial_round');
    expect(result.tags.release).toBe('abc1234');
  });

  it('omits a tag whose value is absent rather than emitting an empty string', () => {
    const result = sentryTagsFromEnvelope(
      buildSupabaseErrorEnvelope(envelopeInput({ rpc: null, releaseSha: null })),
      TRACE_IDS,
    );
    expect(Object.keys(result.tags)).not.toContain('supabase.rpc');
    expect(Object.keys(result.tags)).not.toContain('release');
  });
});

describe('the payload is built by ALLOW-LIST, so unknown keys cannot ride along', () => {
  it('drops a raw SQL key entirely — not masked, absent', () => {
    const result = buildSentrySupabaseTags({
      'supabase.rpc': 'save_partial_round_atomic',
      sql: "select * from golf_rounds where coach_email = 'coach@example.com'",
    });

    expect(Object.keys(result.tags)).toEqual(['supabase.rpc']);
    expect(JSON.stringify(result)).not.toContain('coach@example.com');
    expect(result.droppedKeys).toContain('sql');
  });

  it('drops an Authorization header carrying a JWT — the token is absent from the whole payload', () => {
    const result = buildSentrySupabaseTags({
      'supabase.service': 'postgrest',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      cookie: 'sb-access-token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.QQQQQQQQQQ',
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(serialized).not.toContain('Bearer');
    expect([...result.droppedKeys].sort()).toEqual(['authorization', 'cookie']);
  });

  it('drops a request body, filter values and an email under any key name', () => {
    const result = buildSentrySupabaseTags({
      'helm.feature': 'round_tracking',
      body: '{"email":"player@example.com","notes":"knee soreness"}',
      'filter.eq': 'coach_id.eq.3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      user_email: 'player@example.com',
    });

    const serialized = JSON.stringify(result.tags);
    expect(serialized).not.toContain('player@example.com');
    expect(serialized).not.toContain('knee soreness');
    expect(Object.keys(result.tags)).toEqual(['helm.feature']);
  });

  it('never reports a dropped key VALUE back, only its name', () => {
    const result = buildSentrySupabaseTags({ apikey: 'sb-secret-value-12345678' });
    expect(JSON.stringify(result)).not.toContain('sb-secret-value-12345678');
    expect(result.droppedKeys).toEqual(['apikey']);
  });
});

describe('an allow-listed key with an unsafe VALUE is refused, not masked', () => {
  it('refuses a UUID in a dimension tag — a masked tag is still a tag whose presence leaks', () => {
    const result = buildSentrySupabaseTags({ 'supabase.relation': '3f2504e0-4f89-11d3-9a0c-0305e82c3301' });
    expect(Object.keys(result.tags)).not.toContain('supabase.relation');
    expect(result.refusedValues.map((r) => r.key)).toContain('supabase.relation');
    expect(JSON.stringify(result)).not.toContain('3f2504e0');
  });

  it('refuses an email or a JWT in an allow-listed key', () => {
    const result = buildSentrySupabaseTags({
      'helm.action': 'coach@example.com',
      'helm.feature': 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghij',
    });
    expect(Object.keys(result.tags)).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('coach@example.com');
  });

  it('refuses a value long enough to be a payload rather than a dimension', () => {
    const result = buildSentrySupabaseTags({ 'helm.action': 'x'.repeat(400) });
    expect(Object.keys(result.tags)).toEqual([]);
    expect(result.refusedValues[0]?.reason).toMatch(/length/i);
  });

  it('refuses a non-scalar value rather than serializing an object into a tag', () => {
    const result = buildSentrySupabaseTags({ 'helm.feature': { nested: 'value' } });
    expect(Object.keys(result.tags)).toEqual([]);
  });

  it('ALLOWS a uuid-shaped value for helm.trace_id — a trace id is a correlation id, not a dimension', () => {
    const result = buildSentrySupabaseTags({ 'helm.trace_id': '3f2504e0-4f89-11d3-9a0c-0305e82c3301' });
    expect(result.tags['helm.trace_id']).toBe('3f2504e0-4f89-11d3-9a0c-0305e82c3301');
  });
});

describe('three trace ids, kept explicitly distinct', () => {
  it('names each one separately — one traceId field is how the distinction collapses', () => {
    const correlation = buildTraceCorrelation(TRACE_IDS);
    expect(correlation).toEqual({
      sentryTraceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      w3cTraceId: '0af7651916cd43dd8448eb211c80319c',
      helmTraceId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      sentryMatchesW3c: false,
    });
  });

  it('reports when the Sentry and W3C ids happen to coincide, rather than assuming they always do', () => {
    const same = '4bf92f3577b34da6a3ce929d0e0e4736';
    const correlation = buildTraceCorrelation({ ...TRACE_IDS, w3cTraceId: same });
    expect(correlation.sentryMatchesW3c).toBe(true);
  });

  it('rejects a malformed Sentry or W3C id rather than propagating it', () => {
    const correlation = buildTraceCorrelation({
      sentryTraceId: 'not-a-trace-id',
      w3cTraceId: '00000000000000000000000000000000',
      helmTraceId: null,
    });
    expect(correlation.sentryTraceId).toBeNull();
    expect(correlation.w3cTraceId).toBeNull();
    expect(correlation.sentryMatchesW3c).toBe(false);
  });

  it('exposes no single collapsed traceId field', () => {
    const correlation = buildTraceCorrelation(TRACE_IDS) as unknown as Record<string, unknown>;
    expect(Object.keys(correlation)).not.toContain('traceId');
    expect(Object.keys(correlation)).not.toContain('trace_id');
  });

  it('carries the correlation alongside the tags on a full envelope build', () => {
    const result = sentryTagsFromEnvelope(buildSupabaseErrorEnvelope(envelopeInput()), TRACE_IDS);
    expect(result.correlation.sentryTraceId).toBe(TRACE_IDS.sentryTraceId);
    expect(result.correlation.w3cTraceId).toBe(TRACE_IDS.w3cTraceId);
    expect(result.correlation.helmTraceId).toBe(TRACE_IDS.helmTraceId);
  });
});

describe('purity', () => {
  it('does not mutate its input', () => {
    const source = { 'supabase.rpc': 'x', sql: 'select 1' };
    const snapshot = JSON.stringify(source);
    buildSentrySupabaseTags(source);
    expect(JSON.stringify(source)).toBe(snapshot);
  });
});
