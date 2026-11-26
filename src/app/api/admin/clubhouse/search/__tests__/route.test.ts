import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { fixtureGraph } from '@/lib/admin/clubhouse/__tests__/fixtures';

const probe = vi.fn();
const load = vi.fn();

vi.mock('@/lib/admin/require-super-admin', () => ({
  checkSuperAdminAccess: () => probe(),
}));
vi.mock('@/lib/admin/clubhouse/graph-server', () => ({
  loadBridgeGraph: () => load(),
}));

import { GET } from '../route';

const request = (q: string) => new NextRequest(`http://localhost/api/admin/clubhouse/search?q=${encodeURIComponent(q)}`);

describe('GET /api/admin/clubhouse/search (B14)', () => {
  beforeEach(() => {
    probe.mockReset();
    load.mockReset();
  });

  it('refuses anyone who is not a super-admin with 403, before reading the graph', async () => {
    probe.mockResolvedValue({ allowed: false, reason: 'unauthenticated' });
    const res = await GET(request('CH-7004'));
    expect(res.status).toBe(403);
    expect(load).not.toHaveBeenCalled();
  });

  it('returns the dossier links that match', async () => {
    probe.mockResolvedValue({ allowed: true, context: { email: 'a@example.com' } });
    load.mockReturnValue(fixtureGraph());
    const res = await GET(request('CH-7004'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as { items: Array<{ href: string }>; graph: string };
    expect(body.graph).toBe('fixture');
    expect(body.items[0]?.href).toBe('/admin/clubhouse/codes/70603');
  });

  it('says the graph is unavailable rather than answering "no matches"', async () => {
    probe.mockResolvedValue({ allowed: true, context: { email: 'a@example.com' } });
    load.mockReturnValue(null);
    const body = (await (await GET(request('CH-7004'))).json()) as { items: unknown[]; graph: string };
    expect(body).toEqual({ items: [], graph: 'unavailable' });
  });
});
