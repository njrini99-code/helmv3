import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { fetchSentryIssues } from '@/lib/admin/sentry-api';

function issuePayload(id: string) {
  return {
    id, shortId: `HELM-${id}`, title: `Issue ${id}`, culprit: 'route',
    level: 'error', status: 'unresolved', substatus: 'ongoing',
    count: '12', userCount: 3,
    firstSeen: '2026-07-01T00:00:00Z', lastSeen: '2026-07-01T01:00:00Z',
    permalink: `https://helm-xs.sentry.io/issues/${id}/`,
    stats: { '24h': [[1751328000, 2], [1751331600, 4]] },
  };
}

describe('fetchSentryIssues', () => {
  beforeEach(() => {
    vi.stubEnv('SENTRY_READ_TOKEN', 'tok');
    vi.stubEnv('SENTRY_ORG', 'helm-xs');
    vi.stubEnv('SENTRY_PROJECT', 'javascript-nextjs');
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns unconfigured (NOT an error) when SENTRY_READ_TOKEN is absent', async () => {
    vi.stubEnv('SENTRY_READ_TOKEN', '');
    const res = await fetchSentryIssues();
    expect(res.status).toBe('unconfigured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps issues and coerces string counts to numbers', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([issuePayload('1')]), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const res = await fetchSentryIssues();
    expect(res.status).toBe('ok');
    expect(res.data![0]).toMatchObject({ id: '1', count: 12, userCount: 3 });
    expect(res.data![0]!.stats24h).toEqual([[1751328000, 2], [1751331600, 4]]);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('/organizations/helm-xs/issues/');
    expect(url).toContain('query=is%3Aunresolved');
  });

  it('follows the Link cursor at most 3 pages', async () => {
    const linked = (results: string) => new Response(JSON.stringify([issuePayload(results)]), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        link: '<https://sentry.io/api/0/next>; rel="next"; results="true"; cursor="0:100:0"',
      },
    });
    // Each mocked call must return a FRESH Response — the Fetch API allows a
    // body to be read exactly once, so reusing one instance across pages
    // would throw "Body is unusable" on page 2 regardless of implementation.
    fetchMock.mockImplementation(() => Promise.resolve(linked('n')));
    const res = await fetchSentryIssues();
    expect(res.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('fails soft on 429 without throwing', async () => {
    fetchMock.mockResolvedValue(new Response('slow down', { status: 429, headers: { 'retry-after': '60' } }));
    const res = await fetchSentryIssues();
    expect(res.status).toBe('error');
    expect(res.error).toContain('429');
  });

  it('fails soft on network errors', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    const res = await fetchSentryIssues();
    expect(res.status).toBe('error');
  });
});
