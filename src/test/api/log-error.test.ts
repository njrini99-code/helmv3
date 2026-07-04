import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { POST } from '@/app/api/log-error/route';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildIncidentSignature } from '@/lib/admin/incident-grouping';

const createClientMock = vi.mocked(createClient);
const createAdminMock = vi.mocked(createAdminClient);

function request(body: string) {
  return new Request('http://x/api/log-error', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  }) as never;
}

function mockAnonymousUser() {
  createClientMock.mockResolvedValueOnce({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
  } as never);
}

describe('POST /api/log-error', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    createAdminMock.mockReset();
    // The route is prod-gated by shouldPersistAdminTables(); the force-capture
    // hatch keeps these tests exercising the real persistence path.
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '1');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('accepts anonymous requests, flags them, and caps severity below critical', async () => {
    // W7: unauthenticated client errors (login/signup flow failures) were
    // previously 401'd here — invisible to error_logs/admin_events even
    // though Sentry saw them. Anonymous writes are now accepted, flagged
    // `anonymous: true`, and severity-capped so a spoofed "critical" claim
    // from a logged-out client can never page the on-call team.
    createClientMock.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    } as never);

    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    createAdminMock.mockReturnValueOnce({
      from: vi.fn((table: string) => ({
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return { error: null };
        }),
      })),
    } as never);

    const res = await POST(request(JSON.stringify({
      message: 'anonymous client crash',
      severity: 'critical',
    })));

    expect(res.status).toBe(200);
    const errorLog = inserts.find((i) => i.table === 'error_logs');
    const adminEvent = inserts.find((i) => i.table === 'admin_events');
    expect(errorLog?.payload.user_id).toBeNull();
    expect(adminEvent?.payload.user_id).toBeNull();
    expect(adminEvent?.payload.user_email).toBeNull();
    expect(adminEvent?.payload.severity).toBe('error');
    expect((errorLog?.payload.context as Record<string, unknown> | null)?.anonymous).toBe(true);
  });

  it('computes an incident-grouping fingerprint on the admin_events row so repeats collapse', async () => {
    createClientMock.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    } as never);

    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    createAdminMock.mockReturnValueOnce({
      from: vi.fn((table: string) => ({
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return { error: null };
        }),
      })),
    } as never);

    const res = await POST(request(JSON.stringify({
      message: 'network error',
      severity: 'medium',
      url: '/golf/dashboard',
    })));

    expect(res.status).toBe(200);
    const adminEvent = inserts.find((i) => i.table === 'admin_events');
    const expectedFingerprint = buildIncidentSignature({
      severity: 'warning',
      errorCode: null,
      route: '/golf/dashboard',
      message: 'network error',
    });
    expect(adminEvent?.payload.fingerprint).toBe(expectedFingerprint);
    expect(adminEvent?.payload.source).toBe('client');
  });

  it('gives repeated client errors for the same route+message the same fingerprint', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    } as never);

    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    createAdminMock.mockReturnValue({
      from: vi.fn((table: string) => ({
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return { error: null };
        }),
      })),
    } as never);

    const body = JSON.stringify({
      message: 'network error',
      severity: 'medium',
      url: '/golf/dashboard',
    });
    await POST(request(body));
    await POST(request(body));

    const fingerprints = inserts
      .filter((i) => i.table === 'admin_events')
      .map((i) => i.payload.fingerprint);
    expect(fingerprints).toHaveLength(2);
    expect(fingerprints[0]).toBe(fingerprints[1]);
    expect(fingerprints[0]).toBeTruthy();
  });

  it('binds telemetry rows to the authenticated user rather than trusting the body', async () => {
    createClientMock.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: 'real-user', email: 'real@example.com' } },
          error: null,
        })),
      },
    } as never);

    const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    createAdminMock.mockReturnValueOnce({
      from: vi.fn((table: string) => ({
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return { error: null };
        }),
      })),
    } as never);

    const res = await POST(request(JSON.stringify({
      message: 'poison attempt',
      severity: 'critical',
      user_id: 'attacker-controlled',
    })));

    expect(res.status).toBe(200);
    expect(inserts).toHaveLength(2);
    expect(inserts.find((i) => i.table === 'error_logs')?.payload.user_id).toBe('real-user');
    expect(inserts.find((i) => i.table === 'admin_events')?.payload.user_id).toBe('real-user');
    expect(inserts.find((i) => i.table === 'admin_events')?.payload.user_email).toBe('real@example.com');
  });

  it('returns 204 for an empty/aborted-beacon body instead of a 500', async () => {
    // Aborted sendBeacon flushes (tab close, navigation) can arrive with an
    // empty body. request.json() throws "Unexpected end of JSON input" on
    // that, which used to fall through to the bare catch and return a
    // generic 500 for what is really a client-side no-op.
    mockAnonymousUser();
    createAdminMock.mockReset();

    const res = await POST(request(''));

    expect(res.status).toBe(204);
    expect(createAdminMock).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON without a 500', async () => {
    mockAnonymousUser();
    createAdminMock.mockReset();

    const res = await POST(request('{not valid json'));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid JSON');
    expect(createAdminMock).not.toHaveBeenCalled();
  });

  it('returns 400 for well-formed JSON that is not an object', async () => {
    mockAnonymousUser();
    createAdminMock.mockReset();

    const res = await POST(request(JSON.stringify(['not', 'an', 'object'])));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid payload');
    expect(createAdminMock).not.toHaveBeenCalled();
  });
});
