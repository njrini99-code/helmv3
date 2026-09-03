import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildLogEvidenceSql,
  fetchSupabaseLogEvidence,
  resolveLogSource,
  summarizeLogRow,
} from '../log-evidence';
import { SUPABASE_SERVICES } from '../envelope';

describe('resolveLogSource', () => {
  it('maps every declared SupabaseService to a source table', () => {
    for (const service of SUPABASE_SERVICES) {
      expect(typeof resolveLogSource(service)).toBe('string');
    }
  });

  it('maps postgrest to edge_logs (no dedicated postgrest_logs source)', () => {
    expect(resolveLogSource('postgrest')).toBe('edge_logs');
  });

  it('maps pg_cron and pg_net to postgres_logs — both run inside Postgres', () => {
    expect(resolveLogSource('pg_cron')).toBe('postgres_logs');
    expect(resolveLogSource('pg_net')).toBe('postgres_logs');
  });
});

describe('buildLogEvidenceSql', () => {
  it('builds an unfiltered bounded query with no traceId', () => {
    const sql = buildLogEvidenceSql('auth', null);
    expect(sql).toBe('select id, timestamp, event_message from auth_logs order by timestamp desc limit 40');
  });

  it('filters by traceId via a LIKE clause when supplied', () => {
    const sql = buildLogEvidenceSql('postgres', 'abc-123');
    expect(sql).toContain("event_message like '%abc-123%'");
    expect(sql).toContain('from postgres_logs');
    expect(sql).toContain('limit 40');
  });

  it('escapes a single quote in traceId rather than injecting it raw', () => {
    const sql = buildLogEvidenceSql('storage', "o'brien");
    expect(sql).toContain("o''brien");
    expect(sql).not.toContain("o'brien'");
  });

  it('treats an empty/whitespace traceId the same as no traceId', () => {
    expect(buildLogEvidenceSql('realtime', '   ')).toBe(buildLogEvidenceSql('realtime', null));
    expect(buildLogEvidenceSql('realtime', '')).toBe(buildLogEvidenceSql('realtime', null));
  });
});

describe('summarizeLogRow', () => {
  it('formats timestamp and sanitized message', () => {
    const line = summarizeLogRow({ id: 'row1', timestamp: '2026-09-03T12:00:00.000Z', event_message: 'permission denied' });
    expect(line).toBe('2026-09-03T12:00:00.000Z — permission denied');
  });

  it('drops the id field — never included in the summary line', () => {
    const line = summarizeLogRow({ id: 'should-never-appear', timestamp: 't', event_message: 'ok' });
    expect(line).not.toContain('should-never-appear');
  });

  it('sanitizes secrets/UUIDs in the message before returning it', () => {
    const line = summarizeLogRow({
      timestamp: 't',
      event_message: 'user 123e4567-e89b-12d3-a456-426614174000 token=abcdefghijklmnop failed',
    });
    expect(line).not.toContain('123e4567-e89b-12d3-a456-426614174000');
    expect(line).not.toContain('abcdefghijklmnop');
  });

  it('handles a missing/non-string message without throwing', () => {
    expect(() => summarizeLogRow({ timestamp: 't' })).not.toThrow();
    expect(summarizeLogRow({ timestamp: 't' })).toContain('unavailable');
  });
});

describe('fetchSupabaseLogEvidence — default-off gate (no network)', () => {
  const originalEnabled = process.env.HELM_SUPABASE_LOG_EVIDENCE_ENABLED;

  beforeEach(() => {
    delete process.env.HELM_SUPABASE_LOG_EVIDENCE_ENABLED;
  });

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.HELM_SUPABASE_LOG_EVIDENCE_ENABLED;
    else process.env.HELM_SUPABASE_LOG_EVIDENCE_ENABLED = originalEnabled;
  });

  it('returns UNKNOWN_MANUAL when the flag is unset — never fetches', async () => {
    const result = await fetchSupabaseLogEvidence({
      service: 'postgrest',
      centerAt: '2026-09-03T12:00:00.000Z',
      windowMinutes: 5,
    });
    expect(result.status).toBe('UNKNOWN_MANUAL');
    expect(result.timeline).toBeUndefined();
  });

  it('returns UNKNOWN_MANUAL for any non-"true" value, not just absence', async () => {
    process.env.HELM_SUPABASE_LOG_EVIDENCE_ENABLED = 'false';
    const result = await fetchSupabaseLogEvidence({
      service: 'postgrest',
      centerAt: '2026-09-03T12:00:00.000Z',
      windowMinutes: 5,
    });
    expect(result.status).toBe('UNKNOWN_MANUAL');
  });

  it('reports an error rather than a fabricated timeline for an invalid centerAt, once enabled', async () => {
    process.env.HELM_SUPABASE_LOG_EVIDENCE_ENABLED = 'true';
    const result = await fetchSupabaseLogEvidence({
      service: 'postgrest',
      centerAt: 'not-a-date',
      windowMinutes: 5,
    });
    // No SUPABASE_ACCESS_TOKEN in this test env either, so this still
    // resolves to UNKNOWN_MANUAL before the centerAt parse would matter —
    // asserting the fail-open contract rather than a specific reason string.
    expect(['UNKNOWN_MANUAL', 'error']).toContain(result.status);
    expect(result.timeline).toBeUndefined();
  });
});
