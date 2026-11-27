import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock('@/lib/admin/clubhouse/report-stamp', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin/clubhouse/report-stamp')>('@/lib/admin/clubhouse/report-stamp');
  return { ...actual, stampFromStoredSignal: vi.fn(async () => 1) };
});

import * as Sentry from '@sentry/nextjs';
import { POST } from '@/app/api/log-error/route';
import { stampFromStoredSignal } from '@/lib/admin/clubhouse/report-stamp';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const USER = { id: '11111111-2222-4333-8444-555555555555', email: 'coach@example.test' };
const CRASH = { message: 'Cannot read properties of undefined', severity: 'high', context: { ui: 'clubhouse', surface: 'stats.team', chSignal: { sessionId: 'sess_12345678', seq: 4, page: 'P004', code: 'CH-1206' } } };

function signIn(user: typeof USER | null) {
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) } } as never);
}

function fakeAdmin() {
  const inserts: { table: string; payload: Record<string, unknown> }[] = [];
  const db = {
    from: vi.fn((table: string) => ({
      insert: vi.fn(async (payload: Record<string, unknown>) => {
        inserts.push({ table, payload });
        return { error: null };
      }),
    })),
  };
  vi.mocked(createAdminClient).mockReturnValue(db as never);
  return { db, inserts };
}

function post(body: unknown) {
  return POST(new Request('http://x/api/log-error', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as never);
}

describe('POST /api/log-error: a Clubhouse report whose signal landed first', () => {
  beforeEach(() => {
    vi.mocked(stampFromStoredSignal).mockClear();
    vi.mocked(stampFromStoredSignal).mockResolvedValue(1);
    vi.mocked(Sentry.captureException).mockClear();
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '1');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('stamps its own row from the stored signal, after the row is written', async () => {
    signIn(USER);
    const { db, inserts } = fakeAdmin();
    const res = await post(CRASH);
    expect(res.status).toBe(200);
    expect(inserts.map((i) => i.table).sort()).toEqual(['admin_events', 'error_logs']);
    expect((inserts.find((i) => i.table === 'admin_events')!.payload.metadata as { context: { chSignal: unknown } }).context.chSignal).toMatchObject({ sessionId: 'sess_12345678', seq: 4 });
    expect(stampFromStoredSignal).toHaveBeenCalledTimes(1);
    expect(stampFromStoredSignal).toHaveBeenCalledWith(db, USER.id, { sessionId: 'sess_12345678', seq: 4 });
  });

  it('leaves a report without a signal, or a signed-out one, alone', async () => {
    signIn(USER);
    fakeAdmin();
    expect((await post({ message: 'x', context: { ui: 'clubhouse', surface: 'home' } })).status).toBe(200);
    signIn(null);
    fakeAdmin();
    expect((await post(CRASH)).status).toBe(200);
    expect(stampFromStoredSignal).not.toHaveBeenCalled();
  });

  it('still answers success when the stamp fails, and logs it', async () => {
    signIn(USER);
    fakeAdmin();
    vi.mocked(stampFromStoredSignal).mockRejectedValueOnce({ code: '57014' });
    const res = await post(CRASH);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(Sentry.captureException).toHaveBeenCalledWith({ code: '57014' }, { tags: { component: 'log-error-route', step: 'bridge-stamp' } });
  });
});
