import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: () => null,
  })),
}));

import { POST } from '@/app/api/admin/log-event/route';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';

const createClientMock = vi.mocked(createClient);
const createAdminMock = vi.mocked(createAdminClient);
const logServerErrorMock = vi.mocked(logServerError);

function request(body: string) {
  return new Request('http://x/api/admin/log-event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  }) as never;
}

function mockAuthedUser() {
  createClientMock.mockResolvedValueOnce({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'user-1' } },
        error: null,
      })),
    },
  } as never);
}

describe('POST /api/admin/log-event', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    createAdminMock.mockReset();
    logServerErrorMock.mockClear();
    // The route is prod-gated by shouldPersistAdminTables(); the force-capture
    // hatch keeps these tests exercising the real persistence path.
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '1');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 204 for an empty/aborted-beacon body without logging an error', async () => {
    // Aborted sendBeacon flushes (tab close, navigation) land here with an
    // empty request body. request.json() used to throw "Unexpected end of
    // JSON input" on this, which escaped to the outer catch and minted a
    // logServerError incident per dropped beacon — a noise loop in the
    // error-logging endpoint itself.
    mockAuthedUser();

    const res = await POST(request(''));

    expect(res.status).toBe(204);
    expect(createAdminMock).not.toHaveBeenCalled();
    expect(logServerErrorMock).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON without logging an error', async () => {
    mockAuthedUser();

    const res = await POST(request('{not valid json'));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid JSON');
    expect(createAdminMock).not.toHaveBeenCalled();
    expect(logServerErrorMock).not.toHaveBeenCalled();
  });

  it('persists a valid client-allowed event and returns its id', async () => {
    mockAuthedUser();

    const insertedRows: Array<Record<string, unknown>> = [];
    createAdminMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        insert: vi.fn((payload: Record<string, unknown>) => {
          insertedRows.push(payload);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: 'event-123' }, error: null })),
            })),
          };
        }),
      })),
    } as never);

    const res = await POST(
      request(
        JSON.stringify({
          eventType: 'error',
          title: 'Client runtime crash',
          severity: 'error',
          message: 'TypeError: x is not a function',
        })
      )
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.id).toBe('event-123');
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]?.event_type).toBe('error');
    expect(insertedRows[0]?.user_id).toBe('user-1');
    expect(logServerErrorMock).not.toHaveBeenCalled();
  });
});
