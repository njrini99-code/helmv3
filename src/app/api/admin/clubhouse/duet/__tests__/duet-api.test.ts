/**
 * The read-only Duet door (plan §9.2, D9): off (404, nothing read) until BRIDGE_DUET_TOKEN is set; 401 without the
 * exact bearer token; 429 past the limit; the pack with the right token; names only when the request asks AND
 * BRIDGE_DUET_ALLOW_NAMES allows it; every read audited, best effort.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { fixtureGraph } from '@/lib/admin/clubhouse/__tests__/fixtures';

const load = vi.fn();
const auditInsert = vi.fn(async (_row: unknown) => ({ error: null }));
let eventsResult: { data: unknown; error: { code: string; message: string } | null } = { data: null, error: { code: '42703', message: 'no column' } };

vi.mock('@/lib/admin/clubhouse/graph-server', () => ({
  loadBridgeGraph: () => load(),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'audit_log') return { insert: auditInsert };
      if (table === 'admin_events') return { select: () => ({ eq: () => ({ order: () => ({ limit: async () => eventsResult }) }) }) };
      return { select: () => ({ order: () => ({ limit: async () => ({ data: null, error: { code: '42P01', message: 'missing' } }) }) }) };
    },
  }),
}));

import { GET as packs } from '../packs/route';
import { GET as drift } from '../drift/route';
import { DUET_TOKEN_ENV, DUET_NAMES_ENV } from '@/lib/admin/clubhouse/duet-access';

const TOKEN = 'duet-test-token-0123456789abcdefghij';
let ip = 0;

function req(path: string, auth?: string) {
  // A fresh caller address per request keeps the limiter out of every test but the one about it.
  ip += 1;
  const headers: Record<string, string> = { 'x-forwarded-for': `10.0.0.${ip}` };
  if (auth !== undefined) headers.authorization = auth;
  return new NextRequest(`http://localhost/api/admin/clubhouse/duet/${path}`, { headers });
}

beforeEach(() => {
  load.mockReset().mockReturnValue(fixtureGraph());
  auditInsert.mockClear();
  eventsResult = { data: null, error: { code: '42703', message: 'no column' } };
  vi.stubEnv(DUET_TOKEN_ENV, TOKEN);
  vi.stubEnv(DUET_NAMES_ENV, '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('off by default', () => {
  it('unset token: 404 on every route, and nothing is read or audited', async () => {
    vi.stubEnv(DUET_TOKEN_ENV, '');
    for (const res of [await packs(req('packs?t=70603', `Bearer ${TOKEN}`)), await drift(req('drift', `Bearer ${TOKEN}`))]) {
      expect(res.status).toBe(404);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
    expect(load).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it('a token shorter than 32 characters counts as unset', async () => {
    vi.stubEnv(DUET_TOKEN_ENV, 'short');
    expect((await packs(req('packs?t=70603', 'Bearer short'))).status).toBe(404);
  });
});

describe('the token', () => {
  it('missing or wrong: 401, before the graph is read', async () => {
    expect((await packs(req('packs?t=70603'))).status).toBe(401);
    expect((await packs(req('packs?t=70603', `Bearer ${TOKEN}x`))).status).toBe(401);
    expect((await packs(req('packs?t=70603', TOKEN))).status).toBe(401);
    expect((await drift(req('drift', 'Bearer nope'))).status).toBe(401);
    expect(load).not.toHaveBeenCalled();
  });

  it('right: the pack as JSON and Markdown, pseudonymous, audited', async () => {
    const res = await packs(req('packs?t=CH-7004', `Bearer ${TOKEN}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as { pack: { schema: string; people: string; target: { key: string } }; markdown: string };
    expect(body.pack.schema).toBe('bridge-pack/v1');
    expect(body.pack.target.key).toBe('70603');
    expect(body.pack.people).toBe('pseudonymous');
    expect(body.markdown).toContain('## 7. Done means');
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ action: 'bridge.duet.read', record_id: '70603', user_id: null }));
  });

  it('right: drift as bridge-drift/v1, runtime lists not counted while the table is missing', async () => {
    const res = await drift(req('drift', `Bearer ${TOKEN}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { schema: string; runtime: string; lists: Array<{ key: string; count: number | null }> };
    expect(body.schema).toBe('bridge-drift/v1');
    expect(body.runtime).toBe('no-signal');
    expect(body.lists.find((l) => l.key === 'unknown-fired')!.count).toBeNull();
  });

  it('bad requests: no target is 400, an unknown one 404', async () => {
    expect((await packs(req('packs', `Bearer ${TOKEN}`))).status).toBe(400);
    const res = await packs(req('packs?t=P999', `Bearer ${TOKEN}`));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('unknown target');
  });
});

describe('names (D7)', () => {
  const row = { created_at: '2026-11-20T10:00:00Z', severity: 'error', title: 'Send failed', ch_code: 'CH-7004', bridge_id: 70603, release: 'abc1234', platform: 'ios-app', session_id: 's1', fingerprint: 'fp1', user_id: 'user-uuid-1', user_email: 'coach@example.com', team_id: 'team-1' };

  it('never, by default, even when asked', async () => {
    eventsResult = { data: [row], error: null };
    const body = await (await packs(req('packs?t=70603&names=1', `Bearer ${TOKEN}`))).text();
    expect(body).not.toContain('coach@example.com');
    expect(body).not.toContain('user-uuid-1');
    expect(body).toContain('"people":"pseudonymous"');
  });

  it('only when the owner’s switch allows it and the request asks', async () => {
    eventsResult = { data: [row], error: null };
    vi.stubEnv(DUET_NAMES_ENV, '1');
    expect(await (await packs(req('packs?t=70603', `Bearer ${TOKEN}`))).text()).not.toContain('coach@example.com');
    expect(await (await packs(req('packs?t=70603&names=1', `Bearer ${TOKEN}`))).text()).toContain('coach@example.com');
  });
});

describe('rate limit', () => {
  it('one caller past 60 a minute gets 429 with Retry-After', async () => {
    const make = () => new NextRequest('http://localhost/api/admin/clubhouse/duet/drift', { headers: { 'x-forwarded-for': '10.9.9.9', authorization: 'Bearer wrong' } });
    for (let i = 0; i < 60; i += 1) expect((await drift(make())).status).toBe(401);
    const res = await drift(make());
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});
