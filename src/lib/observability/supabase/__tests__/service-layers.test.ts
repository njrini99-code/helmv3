import { describe, expect, it } from 'vitest';

import {
  attributeMultiLayerEvidence,
  attributeServiceLayer,
  observedServiceLayer,
  type ServiceLayerEnvelope,
} from '../service-layers';

function envelope(overrides: Partial<ServiceLayerEnvelope> = {}): ServiceLayerEnvelope {
  return {
    service: 'postgrest',
    sqlstate: null,
    postgrestCode: null,
    authCode: null,
    storageCode: null,
    code: null,
    httpStatus: null,
    ...overrides,
  };
}

describe('observedServiceLayer', () => {
  it('maps each service to its layer, folding pg_cron and pg_net into Postgres', () => {
    expect(observedServiceLayer('postgrest')).toBe('postgrest');
    expect(observedServiceLayer('postgres')).toBe('postgres');
    expect(observedServiceLayer('pg_cron')).toBe('postgres');
    expect(observedServiceLayer('pg_net')).toBe('postgres');
    expect(observedServiceLayer('auth')).toBe('auth');
    expect(observedServiceLayer('storage')).toBe('storage');
    expect(observedServiceLayer('realtime')).toBe('realtime');
    expect(observedServiceLayer('edge_function')).toBe('edge_function');
  });
});

describe('attributeServiceLayer — a Postgres verdict is Postgres wherever it surfaced', () => {
  it('moves a 42501 relayed by PostgREST onto Postgres', () => {
    const result = attributeServiceLayer(envelope({ service: 'postgrest', sqlstate: '42501', httpStatus: 403 }));
    expect(result.observedLayer).toBe('postgrest');
    expect(result.likelyOriginLayer).toBe('postgres');
    expect(result.originConfidence).toBe('certain');
    expect(result.ambiguous).toBe(false);
  });

  it('moves a Storage failure carrying a SQLSTATE onto Postgres', () => {
    const result = attributeServiceLayer(envelope({ service: 'storage', sqlstate: '57014', httpStatus: 500 }));
    expect(result.observedLayer).toBe('storage');
    expect(result.likelyOriginLayer).toBe('postgres');
    expect(result.reasons.join(' ')).toContain('only Postgres emits');
  });

  it('moves an Edge Function failure carrying a SQLSTATE onto Postgres', () => {
    const result = attributeServiceLayer(envelope({ service: 'edge_function', sqlstate: '40P01' }));
    expect(result.observedLayer).toBe('edge_function');
    expect(result.likelyOriginLayer).toBe('postgres');
  });

  it('recognises a SQLSTATE that only reached the generic code field', () => {
    const result = attributeServiceLayer(envelope({ service: 'postgrest', sqlstate: null, code: '23505' }));
    expect(result.likelyOriginLayer).toBe('postgres');
  });

  it('keeps a Postgres-observed SQLSTATE on Postgres without the relay wording', () => {
    const result = attributeServiceLayer(envelope({ service: 'postgres', sqlstate: '42501' }));
    expect(result.likelyOriginLayer).toBe('postgres');
    expect(result.reasons.join(' ')).toContain('Observed in Postgres');
  });
});

describe('attributeServiceLayer — PostgREST-native codes', () => {
  it('treats a connection/schema-load failure as likely Postgres, with both candidates named', () => {
    const result = attributeServiceLayer(envelope({ postgrestCode: 'PGRST002' }));
    expect(result.likelyOriginLayer).toBe('postgres');
    expect(result.originConfidence).toBe('likely');
    expect(result.ambiguous).toBe(true);
    expect(result.candidateLayers).toEqual(['postgres', 'postgrest']);
  });

  it('refuses to choose on PGRST003 — a pool timeout does not separate the layers', () => {
    const result = attributeServiceLayer(envelope({ postgrestCode: 'PGRST003' }));
    expect(result.likelyOriginLayer).toBe('unknown');
    expect(result.originConfidence).toBe('unknown');
    expect(result.ambiguous).toBe(true);
    expect(result.candidateLayers).toEqual(['postgres', 'postgrest']);
    expect(result.reasons.join(' ')).toContain('does not separate them');
  });

  it('keeps another PostgREST-native code at PostgREST', () => {
    const result = attributeServiceLayer(envelope({ postgrestCode: 'PGRST116' }));
    expect(result.likelyOriginLayer).toBe('postgrest');
    expect(result.ambiguous).toBe(false);
  });
});

describe('attributeServiceLayer — service-native codes and bare HTTP', () => {
  it('an Auth-native code stays at Auth', () => {
    const result = attributeServiceLayer(envelope({ service: 'auth', authCode: 'over_request_rate_limit', httpStatus: 429 }));
    expect(result.likelyOriginLayer).toBe('auth');
    expect(result.originConfidence).toBe('certain');
  });

  it('a Storage-native code stays at Storage', () => {
    const result = attributeServiceLayer(envelope({ service: 'storage', storageCode: 'AccessDenied', httpStatus: 403 }));
    expect(result.likelyOriginLayer).toBe('storage');
    expect(result.originConfidence).toBe('certain');
  });

  it('a 5xx with no service-specific code is ambiguous between the gateway and the service', () => {
    const result = attributeServiceLayer(envelope({ service: 'realtime', httpStatus: 502 }));
    expect(result.likelyOriginLayer).toBe('unknown');
    expect(result.ambiguous).toBe(true);
    expect(result.candidateLayers).toEqual(['gateway_api', 'realtime']);
  });

  it('a 4xx with no code stays at the observing service', () => {
    const result = attributeServiceLayer(envelope({ service: 'storage', httpStatus: 404 }));
    expect(result.likelyOriginLayer).toBe('storage');
    expect(result.originConfidence).toBe('likely');
  });

  it('nothing at all yields unknown rather than a guess', () => {
    const result = attributeServiceLayer({
      service: 'postgrest',
      sqlstate: null,
      postgrestCode: null,
      authCode: null,
      storageCode: null,
      code: null,
      httpStatus: null,
    });
    expect(result.likelyOriginLayer).toBe('postgrest');
    expect(result.originConfidence).toBe('likely');
    expect(result.reasons.join(' ')).toContain('No code or HTTP status');
  });
});

describe('attributeMultiLayerEvidence', () => {
  it('picks the deepest decided origin — a Postgres verdict explains the relays above it', () => {
    const result = attributeMultiLayerEvidence([
      envelope({ service: 'postgrest', httpStatus: 500 }),
      envelope({ service: 'postgrest', sqlstate: '42501', httpStatus: 403 }),
    ]);
    expect(result.likelyOriginLayer).toBe('postgres');
    expect(result.originConfidence).toBe('certain');
    expect(result.members).toHaveLength(2);
  });

  it('stays unknown when every member is individually ambiguous', () => {
    const result = attributeMultiLayerEvidence([
      envelope({ postgrestCode: 'PGRST003' }),
      envelope({ service: 'realtime', httpStatus: 503 }),
    ]);
    expect(result.likelyOriginLayer).toBe('unknown');
    expect(result.ambiguous).toBe(true);
  });

  it('refuses to choose between two decided origins at the same depth', () => {
    const result = attributeMultiLayerEvidence([
      envelope({ service: 'auth', authCode: 'invalid_credentials', httpStatus: 400 }),
      envelope({ service: 'storage', storageCode: 'AccessDenied', httpStatus: 403 }),
    ]);
    expect(result.likelyOriginLayer).toBe('unknown');
    expect(result.ambiguous).toBe(true);
    expect(result.candidateLayers).toEqual(expect.arrayContaining(['auth', 'storage']));
  });

  it('handles an empty evidence set without throwing', () => {
    const result = attributeMultiLayerEvidence([]);
    expect(result.likelyOriginLayer).toBe('unknown');
    expect(result.members).toEqual([]);
  });
});
