import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { POST } from '@/app/api/log-error/route';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

function signedOut() {
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) } } as never);
}

function fakeAdmin() {
  const inserts: { table: string; payload: Record<string, unknown> }[] = [];
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn((table: string) => ({
      insert: vi.fn(async (payload: Record<string, unknown>) => {
        inserts.push({ table, payload });
        return { error: null };
      }),
    })),
  } as never);
  return inserts;
}

function post(body: unknown) {
  return POST(new Request('http://x/api/log-error', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as never);
}

function adminRow(inserts: ReturnType<typeof fakeAdmin>) {
  return inserts.find((i) => i.table === 'admin_events')!.payload;
}

describe('POST /api/log-error: the release the browser runs', () => {
  beforeEach(() => {
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '1');
    signedOut();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is stored on the Bridge row', async () => {
    const inserts = fakeAdmin();
    const res = await post({ message: 'Could not load the rounds', severity: 'medium', release: 'a0480dbc8b970b9000bc3e31745798cf2b74729d' });
    expect(res.status).toBe(200);
    expect(adminRow(inserts).release).toBe('a0480dbc8b970b9000bc3e31745798cf2b74729d');
  });

  it('is left empty when the report has none, or one that is not a release', async () => {
    for (const release of [undefined, '', 'x'.repeat(65), 'a b', '<script>', 42]) {
      const inserts = fakeAdmin();
      expect((await post({ message: 'boom', release })).status).toBe(200);
      expect(adminRow(inserts).release).toBeNull();
    }
  });
});
