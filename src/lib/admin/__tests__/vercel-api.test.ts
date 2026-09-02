import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import {
  fetchVercelDeployments,
  fetchVercelWebInsights,
  __resetVercelInsightsCooldown,
} from '@/lib/admin/vercel-api';
import { __resetEmitThrottleForTests } from '@/lib/admin/emit-throttle';

// Well-formed by shape (>= 20 opaque chars) — a short fixture like the old
// 'vercel-api-token' is exactly what credential-shape.mjs now rejects.
const GOOD_TOKEN = 'A1b2C3d4E5f6G7h8I9j0K1l2';

describe('fetchVercelDeployments', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_API_TOKEN', GOOD_TOKEN);
    vi.stubEnv('VERCEL_PROJECT_ID', 'prj_1');
    vi.stubEnv('VERCEL_TEAM_ID', 'team_1');
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns unconfigured when the token trio is absent', async () => {
    vi.stubEnv('VERCEL_API_TOKEN', '');
    const res = await fetchVercelDeployments();
    expect(res.status).toBe('unconfigured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats placeholder or too-short tokens as unconfigured', async () => {
    vi.stubEnv('VERCEL_API_TOKEN', 'your-vercel-api-token-here');
    const res = await fetchVercelDeployments();
    expect(res.status).toBe('unconfigured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats an 11-character opaque token as unconfigured — shape, not length', async () => {
    vi.stubEnv('VERCEL_API_TOKEN', 'abcdefghijk');
    const res = await fetchVercelDeployments();
    expect(res.status).toBe('unconfigured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps deployments and always sends teamId (empty-results footgun)', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      deployments: [{
        uid: 'dpl_1', state: 'READY', createdAt: 1751328000000, ready: 1751328100000,
        target: 'production', url: 'helmv3-abc.vercel.app',
        meta: {
          githubCommitSha: 'abc123', githubCommitMessage: 'feat: x',
          githubCommitRef: 'main', githubCommitAuthorName: 'nick',
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const res = await fetchVercelDeployments(5);
    expect(res.status).toBe('ok');
    expect(res.data![0]).toMatchObject({
      uid: 'dpl_1', state: 'READY', commitSha: 'abc123', commitRef: 'main', target: 'production',
    });
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('teamId=team_1');
    expect(url).toContain('limit=5');
  });

  it('fails soft on non-200', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 403 }));
    const res = await fetchVercelDeployments();
    expect(res.status).toBe('error');
    expect(res.error).toContain('403');
  });
});

describe('fetchVercelWebInsights', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_API_TOKEN', GOOD_TOKEN);
    vi.stubEnv('VERCEL_PROJECT_ID', 'prj_1');
    vi.stubEnv('VERCEL_TEAM_ID', 'team_1');
    fetchMock.mockReset();
    __resetVercelInsightsCooldown();
    __resetEmitThrottleForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('returns unconfigured when the token trio is absent', async () => {
    vi.stubEnv('VERCEL_PROJECT_ID', '');
    const res = await fetchVercelWebInsights();
    expect(res.status).toBe('unconfigured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps the three visitor periods on success', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { visitors: 12 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { visitors: 84 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { visitors: 301 } }), { status: 200 }));
    const res = await fetchVercelWebInsights();
    expect(res.status).toBe('ok');
    expect(res.data).toEqual({ visitors24h: 12, visitors7d: 84, visitors30d: 301 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('surfaces a failed status (not fake zeros) when a period request 403s', async () => {
    // An auth failure or misconfigured token must never render identically
    // to "genuinely zero visitors" — that was the pre-fix bug. It now maps
    // to the same error/status contract fetchVercelDeployments already used.
    //
    // Title said "404s/403s" until 2026-09-01 while the mock only ever sent
    // 403. 404 now has its own meaning and its own test below, so the two
    // must not be described as one case.
    fetchMock.mockResolvedValue(new Response('nope', { status: 403 }));
    const res = await fetchVercelWebInsights();
    expect(res.status).toBe('error');
    expect(res.error).toContain('403');
    expect(res.data).toBeNull();
  });

  it('a 404 is "Web Analytics not enabled", NOT an outage', async () => {
    // Measured against the live project 2026-09-01: Vercel answers
    //   404 {"error":{"code":"not_found","message":"Web Analytics not found."}}
    // when the feature was never enabled. The provider is reachable and the
    // token is valid, so reporting it through reportIntegrationFault said
    // "vercel could not be reached" 99 times in one day about a service that
    // had answered immediately and precisely.
    //
    // `unconfigured` is the honest state, and it is also the quiet one: no
    // admin_events row, and the Bridge renders its not-configured panel.
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'not_found', message: 'Web Analytics not found.' } }), { status: 404 }),
    );
    const res = await fetchVercelWebInsights();
    expect(res.status).toBe('unconfigured');
    expect(res.status).not.toBe('error');
    expect(res.data).toBeNull();
  });

  it('fails soft on thrown network error', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const res = await fetchVercelWebInsights();
    expect(res.status).toBe('error');
    expect(res.error).toContain('network down');
  });

  // /admin/deploys refreshes every 60s. Without this, every refresh re-probed
  // a dead endpoint AND re-reported the fault from a fresh lambda: 99 rows in
  // 2h05m on production 2026-09-01.
  describe('negative cache', () => {
    it('does not re-probe a failed endpoint inside the cooldown', async () => {
      fetchMock.mockResolvedValue(new Response('nope', { status: 503 }));
      const first = await fetchVercelWebInsights();
      expect(first.status).toBe('error');
      const probes = fetchMock.mock.calls.length;
      expect(probes).toBeGreaterThan(0);

      const second = await fetchVercelWebInsights();
      expect(second.status).toBe('error');
      expect(second.error).toBe(first.error);
      expect(fetchMock.mock.calls.length).toBe(probes); // no new round-trip
    });

    it('probes again once the cooldown elapses, and clears on success', async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue(new Response('nope', { status: 503 }));
      await fetchVercelWebInsights();
      const probes = fetchMock.mock.calls.length;

      vi.advanceTimersByTime(5 * 60_000 + 1);
      // A fresh Response per call — a body can only be consumed once and the
      // reader fetches three periods.
      fetchMock.mockImplementation(async () => new Response(JSON.stringify({ data: { visitors: 1 } }), { status: 200 }));
      const recovered = await fetchVercelWebInsights();
      expect(recovered.status).toBe('ok');
      expect(fetchMock.mock.calls.length).toBeGreaterThan(probes);

      // Cleared: the next call probes live rather than serving the old failure.
      const again = await fetchVercelWebInsights();
      expect(again.status).toBe('ok');
    });
  });
});
