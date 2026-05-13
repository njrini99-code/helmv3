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

  it('rejects anonymous requests before parsing the body', async () => {
    createClientMock.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    } as never);

    const res = await POST(request('not-json'));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ success: false });
    expect(createAdminMock).not.toHaveBeenCalled();
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
