import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { POST } from '@/app/api/log-error/route';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const createClientMock = vi.mocked(createClient);
const createAdminMock = vi.mocked(createAdminClient);

function request(body: string) {
  return new Request('http://x/api/log-error', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  }) as never;
}

describe('POST /api/log-error', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    createAdminMock.mockReset();
  });

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
});
