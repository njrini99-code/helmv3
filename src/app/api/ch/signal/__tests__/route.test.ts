import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureGraph, signal } from '@/lib/admin/clubhouse/__tests__/fixtures';
import { chSignalSchema } from '@/lib/admin/clubhouse/signal';

vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: vi.fn() }));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/admin/clubhouse/graph-server', () => ({ loadBridgeGraph: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => undefined) }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { POST } from '@/app/api/ch/signal/route';
import { loadBridgeGraph } from '@/lib/admin/clubhouse/graph-server';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { logServerError } from '@/lib/server-error-logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const USER = { id: '11111111-2222-4333-8444-555555555555', email: 'coach@example.test' };

type Call = { op: string; table?: string; payload?: unknown; filters?: [string, string, unknown][] };

function fakeDb(opts: { rpcError?: { code: string } | null; insertErrors?: ({ code: string } | null)[]; updateCount?: number } = {}) {
  const calls: Call[] = [];
  const insertErrors = [...(opts.insertErrors ?? [])];
  const db = {
    rpc: vi.fn(async (name: string, args: unknown) => {
      calls.push({ op: 'rpc', table: name, payload: args });
      return { data: {}, error: opts.rpcError ?? null };
    }),
    from: vi.fn((table: string) => ({
      insert: vi.fn(async (payload: unknown) => {
        calls.push({ op: 'insert', table, payload });
        return { error: insertErrors.shift() ?? null };
      }),
      update: vi.fn((payload: unknown) => {
        const call: Call = { op: 'update', table, payload, filters: [] };
        calls.push(call);
        const chain = {
          eq: (col: string, v: unknown) => (call.filters!.push(['eq', col, v]), chain),
          is: (col: string, v: unknown) => (call.filters!.push(['is', col, v]), chain),
          gte: (col: string, v: unknown) => (call.filters!.push(['gte', col, v]), chain),
          then: (resolve: (r: { error: null; count: number }) => unknown) => resolve({ error: null, count: opts.updateCount ?? 1 }),
        };
        return chain;
      }),
    })),
  };
  vi.mocked(createAdminClient).mockReturnValue(db as never);
  return calls;
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request('http://x/api/ch/signal', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'x-forwarded-for': '203.0.113.9, 10.0.0.1', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never,
  );
}

describe('POST /api/ch/signal', () => {
  beforeEach(() => {
    vi.mocked(isFlagEnabled).mockReturnValue(true);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000, durable: true });
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser: vi.fn(async () => ({ data: { user: USER }, error: null })) } } as never);
    vi.mocked(loadBridgeGraph).mockReturnValue(fixtureGraph());
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '1');
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('does nothing while the kill switch is off', async () => {
    vi.mocked(isFlagEnabled).mockReturnValue(false);
    const calls = fakeDb();
    const res = await post({ signals: [signal()] });
    expect(res.status).toBe(204);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('limits batches per IP on the leftmost hop, with Retry-After', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000 });
    const res = await post({ signals: [signal()] });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(checkRateLimit).toHaveBeenCalledWith('ch-signal:ip:203.0.113.9', { maxAttempts: 30, windowMs: 60_000 });
  });

  it('limits batches per signed-in user, not per the session id the client chose', async () => {
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000, durable: true })
      .mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000, durable: true });
    const res = await post({ signals: [signal()] });
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenLastCalledWith(`ch-signal:user:${USER.id}`, { maxAttempts: 12, windowMs: 60_000 });
  });

  it('holds a global budget across every caller', async () => {
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000, durable: true })
      .mockResolvedValueOnce({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000, durable: true })
      .mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000, durable: true });
    const res = await post({ signals: [signal()] });
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenLastCalledWith('ch-signal:global', expect.objectContaining({ windowMs: 60_000 }));
  });

  it('stores nothing in production when the limiter has fallen back to per-instance memory', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000, durable: false });
    const calls = fakeDb();
    const res = await post({ signals: [signal()] });
    expect(res.status).toBe(204);
    expect(calls).toEqual([]);
  });

  it('stores nothing from another site (sendBeacon is a CORS-simple request)', async () => {
    const calls = fakeDb();
    expect((await post({ signals: [signal()] }, { 'sec-fetch-site': 'cross-site' })).status).toBe(204);
    expect((await post({ signals: [signal()] }, { origin: 'https://evil.example' })).status).toBe(204);
    expect(calls).toEqual([]);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('caps stamps per batch and stamps only the caller\'s own rows', async () => {
    const calls = fakeDb();
    await post({ signals: Array.from({ length: 12 }, (_, i) => signal({ seq: i + 1, kind: 'action', outcome: 'failure', code: 'CH-7004', reported: true })) });
    const updates = calls.filter((c) => c.op === 'update');
    expect(updates).toHaveLength(5);
    for (const u of updates) expect(u.filters).toContainEqual(['eq', 'user_id', USER.id]);
  });

  it('answers an empty beacon with 204, a bad body with 400 and an oversized one with 413', async () => {
    expect((await post('')).status).toBe(204);
    expect((await post('{nope')).status).toBe(400);
    expect((await post({ signals: [] })).status).toBe(400);
    expect((await post({ signals: [signal()], pad: 'x'.repeat(300 * 1024) })).status).toBe(413);
  });

  it('counts envelopes that do not fit and stores nothing when none do', async () => {
    const calls = fakeDb();
    const res = await post({ signals: [{ v: 2 }, { code: 'nope' }] });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: 0, dropped: 2, persisted: false });
    expect(calls).toEqual([]);
  });

  it('stores nothing from an off-production runtime', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '');
    vi.stubEnv('VERCEL_ENV', 'preview');
    const calls = fakeDb();
    const res = await post({ signals: [signal()] });
    expect(await res.json()).toMatchObject({ accepted: 1, persisted: false });
    expect(calls).toEqual([]);
  });

  it('says so, and stores nothing, when the graph is missing from the deploy', async () => {
    vi.mocked(loadBridgeGraph).mockReturnValue(null);
    const calls = fakeDb();
    const res = await post({ signals: [signal()] });
    expect(await res.json()).toMatchObject({ persisted: false, reason: 'graph-missing' });
    expect(logServerError).toHaveBeenCalledOnce();
    expect(calls).toEqual([]);
  });

  it('ingests per session, writes an unreported failure with the Bridge columns, and redacts its message', async () => {
    const calls = fakeDb();
    const res = await post({
      signals: [
        signal({ seq: 1, kind: 'view', outcome: undefined, code: undefined }),
        signal({ seq: 2, kind: 'toast', outcome: 'failure', code: 'CH-7004', message: 'failed for coach@example.test', serverCode: '42501' }),
      ],
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ accepted: 2, persisted: true, failures: 1 });

    const rpc = calls.find((c) => c.op === 'rpc')!;
    expect(rpc.table).toBe('clubhouse_ingest_signals');
    const batch = (rpc.payload as { p_batch: { session: { user_id: string; failures: number }; events: { message: string | null }[] } }).p_batch;
    expect(batch.session).toMatchObject({ user_id: USER.id, failures: 1 });
    expect(batch.events[1]!.message).not.toContain('coach@example.test');

    const insert = calls.find((c) => c.op === 'insert')!;
    const row = (insert.payload as Record<string, unknown>[])[0]!;
    expect(insert.table).toBe('admin_events');
    expect(row).toMatchObject({
      event_type: 'error',
      source: 'client',
      sport: 'golf',
      severity: 'warning',
      title: 'Sending a message throws (CH-7004)',
      user_id: USER.id,
      ch_code: 'CH-7004',
      bridge_id: 70603,
      page_id: 'P007',
      server_code: '42501',
      session_id: 'sess_12345678',
    });
    expect(String(row.message)).not.toContain('coach@example.test');
    expect(row.fingerprint).toEqual(expect.any(String));
  });

  it('stamps the row chReport already wrote instead of writing a second one', async () => {
    const calls = fakeDb();
    const res = await post({ signals: [signal({ seq: 9, kind: 'action', outcome: 'failure', code: 'CH-7004', act: 'messages.send', reported: true })] });
    expect(await res.json()).toMatchObject({ failures: 0, stamped: 1 });
    expect(calls.some((c) => c.op === 'insert')).toBe(false);
    const update = calls.find((c) => c.op === 'update')!;
    expect(update.payload).toMatchObject({ ch_code: 'CH-7004', bridge_id: 70603, action_id: 'ACT-P007-SEND-MESSAGE' });
    expect(update.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'source', 'client'],
        ['eq', 'metadata->context->chSignal->>sessionId', 'sess_12345678'],
        ['eq', 'metadata->context->chSignal->>seq', '9'],
        ['is', 'ch_code', null],
      ]),
    );
  });

  it('while the migration is held: reports not persisted, writes failures without the new columns, stamps nothing', async () => {
    const calls = fakeDb({ rpcError: { code: 'PGRST202' }, insertErrors: [{ code: 'PGRST204' }] });
    const res = await post({
      signals: [
        signal({ seq: 1, kind: 'toast', outcome: 'failure', code: 'CH-7004' }),
        signal({ seq: 2, kind: 'action', outcome: 'failure', code: 'CH-7004', reported: true }),
      ],
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ persisted: false, failures: 1, stamped: 0 });
    const inserts = calls.filter((c) => c.op === 'insert');
    expect(inserts).toHaveLength(2);
    const fallback = (inserts[1]!.payload as Record<string, unknown>[])[0]!;
    expect(fallback).not.toHaveProperty('ch_code');
    expect(fallback.metadata).toMatchObject({ bridge: { code: 'CH-7004', bridgeId: 70603, sessionId: 'sess_12345678', seq: 1 } });
    expect(calls.some((c) => c.op === 'update')).toBe(false);
  });

  it('keeps the failure row and reports it when the counts call fails', async () => {
    const calls = fakeDb({ rpcError: { code: '57014' } });
    const res = await post({ signals: [signal({ seq: 1, kind: 'toast', outcome: 'failure', code: 'CH-7004' })] });
    expect(res.status).toBe(202);
    expect(calls.filter((c) => c.op === 'insert')).toHaveLength(1);
  });

  it('answers 500 and reports it when the failure row cannot be written', async () => {
    fakeDb({ insertErrors: [{ code: '57014' }] });
    const res = await post({ signals: [signal({ seq: 1, kind: 'toast', outcome: 'failure', code: 'CH-7004' })] });
    expect(res.status).toBe(500);
  });

  it('stores nothing from a signed-out sender', async () => {
    vi.mocked(createClient).mockRejectedValueOnce(new Error('no cookies'));
    const calls = fakeDb();
    const res = await post({ signals: [signal({ kind: 'view', outcome: undefined, code: undefined, role: 'signed-out' })] });
    expect(res.status).toBe(204);
    expect(calls).toEqual([]);
  });

  it('the fixture envelope is one the schema accepts', () => {
    expect(chSignalSchema.safeParse(signal()).success).toBe(true);
  });
});
