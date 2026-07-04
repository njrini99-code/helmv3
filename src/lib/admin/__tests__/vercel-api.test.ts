import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { fetchVercelDeployments, fetchVercelWebInsights } from '@/lib/admin/vercel-api';

describe('fetchVercelDeployments', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_API_TOKEN', 'vercel-api-token');
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
    vi.stubEnv('VERCEL_API_TOKEN', 'vercel-api-token');
    vi.stubEnv('VERCEL_PROJECT_ID', 'prj_1');
    vi.stubEnv('VERCEL_TEAM_ID', 'team_1');
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

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

  it('surfaces a failed status (not fake zeros) when a period request 404s/403s', async () => {
    // An auth failure or misconfigured token must never render identically
    // to "genuinely zero visitors" — that was the pre-fix bug. It now maps
    // to the same error/status contract fetchVercelDeployments already used.
    fetchMock.mockResolvedValue(new Response('nope', { status: 403 }));
    const res = await fetchVercelWebInsights();
    expect(res.status).toBe('error');
    expect(res.error).toContain('403');
    expect(res.data).toBeNull();
  });

  it('fails soft on thrown network error', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const res = await fetchVercelWebInsights();
    expect(res.status).toBe('error');
    expect(res.error).toContain('network down');
  });
});
