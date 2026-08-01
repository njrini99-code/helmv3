import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import {
  fetchSentryIssues,
  fetchSentryFeatureCounts,
  __resetSentryFeatureCountCooldown,
} from '@/lib/admin/sentry-api';

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
    vi.stubEnv('SENTRY_READ_TOKEN', 'sentry-read-token');
    vi.stubEnv('SENTRY_ORG', 'helm-xs');
    vi.stubEnv('SENTRY_PROJECT', 'javascript-nextjs');
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns unconfigured (NOT an error) when neither token env is set', async () => {
    vi.stubEnv('SENTRY_READ_TOKEN', '');
    vi.stubEnv('SENTRY_AUTH_TOKEN', '');
    const res = await fetchSentryIssues();
    expect(res.status).toBe('unconfigured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to SENTRY_AUTH_TOKEN when SENTRY_READ_TOKEN is absent', async () => {
    vi.stubEnv('SENTRY_READ_TOKEN', '');
    vi.stubEnv('SENTRY_AUTH_TOKEN', 'ci-token-long');
    fetchMock.mockResolvedValue(new Response(JSON.stringify([issuePayload('1')]), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const res = await fetchSentryIssues();
    expect(res.status).toBe('ok');
    const headers = fetchMock.mock.calls[0]![1] as { headers: Record<string, string> };
    expect(headers.headers.Authorization).toBe('Bearer ci-token-long');
  });

  it('prefers SENTRY_READ_TOKEN over SENTRY_AUTH_TOKEN when both are set', async () => {
    vi.stubEnv('SENTRY_AUTH_TOKEN', 'ci-token-long');
    fetchMock.mockResolvedValue(new Response(JSON.stringify([issuePayload('1')]), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const res = await fetchSentryIssues();
    expect(res.status).toBe('ok');
    const headers = fetchMock.mock.calls[0]![1] as { headers: Record<string, string> };
    expect(headers.headers.Authorization).toBe('Bearer sentry-read-token');
  });

  it('treats placeholder or too-short tokens as unconfigured', async () => {
    vi.stubEnv('SENTRY_READ_TOKEN', 'your-auth-token-here');
    vi.stubEnv('SENTRY_AUTH_TOKEN', 'tok');
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

  it('follows the Link cursor up to the bounded 20-page ceiling and flags truncation', async () => {
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
    expect(fetchMock).toHaveBeenCalledTimes(20);
    // A next-page cursor still existed when the ceiling was hit — the
    // result is a real but partial slice, not "the complete unresolved list".
    expect(res.truncated).toBe(true);
  });

  it('does NOT flag truncation when the Link cursor runs out before the ceiling', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([issuePayload('1')]), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const res = await fetchSentryIssues();
    expect(res.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.truncated).toBe(false);
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

describe('fetchSentryFeatureCounts', () => {
  beforeEach(() => {
    vi.stubEnv('SENTRY_READ_TOKEN', 'sentry-read-token');
    vi.stubEnv('SENTRY_ORG', 'helm-xs');
    vi.stubEnv('SENTRY_PROJECT', 'javascript-nextjs');
    fetchMock.mockReset();
    // A failing test above would otherwise leave the sweep in cooldown and
    // make every later test pass for the wrong reason.
    __resetSentryFeatureCountCooldown();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns null (not an error) when neither token env is set', async () => {
    vi.stubEnv('SENTRY_READ_TOKEN', '');
    vi.stubEnv('SENTRY_AUTH_TOKEN', '');
    const res = await fetchSentryFeatureCounts(['round_tracking']);
    expect(res).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns an empty object for an empty key list without calling fetch', async () => {
    const res = await fetchSentryFeatureCounts([]);
    expect(res).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('queries is:unresolved feature:<key> per key and buckets total/critical counts', async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('feature%3Around_tracking')) {
        return Promise.resolve(
          new Response(
            JSON.stringify([issuePayload('1'), { ...issuePayload('2'), level: 'fatal' }]),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } }));
    });
    const res = await fetchSentryFeatureCounts(['round_tracking', 'stats_analytics']);
    expect(res).toEqual({
      round_tracking: { total: 2, critical: 1 },
      stats_analytics: { total: 0, critical: 0 },
    });
  });

  it('degrades to null for ALL keys if any single per-feature query fails (never a partial, misleading map)', async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('feature%3Around_tracking')) {
        return Promise.resolve(new Response('slow down', { status: 429 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } }));
    });
    const res = await fetchSentryFeatureCounts(['round_tracking', 'stats_analytics']);
    expect(res).toBeNull();
  });

  it('degrades to null on a thrown network error', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    const res = await fetchSentryFeatureCounts(['round_tracking']);
    expect(res).toBeNull();
  });

  it('never exceeds the concurrency ceiling, however many features exist', async () => {
    let inFlight = 0;
    let peakInFlight = 0;
    fetchMock.mockImplementation(async () => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const keys = Array.from({ length: 40 }, (_, i) => `feature_${i}`);
    const res = await fetchSentryFeatureCounts(keys);

    // Every key still gets counted — bounding concurrency must not drop work.
    expect(Object.keys(res ?? {})).toHaveLength(40);
    expect(peakInFlight).toBeLessThanOrEqual(6);
  });

  it('abandons the rest of the sweep once one query fails', async () => {
    fetchMock.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return new Response('slow down', { status: 429 });
    });

    const keys = Array.from({ length: 40 }, (_, i) => `feature_${i}`);
    expect(await fetchSentryFeatureCounts(keys)).toBeNull();

    // The result is already null, so issuing the other 34 queries would be
    // pure rate-limit pressure for output nobody reads.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it('skips the sweep entirely during the cooldown that follows a failure', async () => {
    fetchMock.mockResolvedValue(new Response('slow down', { status: 429 }));

    expect(await fetchSentryFeatureCounts(['round_tracking'])).toBeNull();
    const callsAfterFailedSweep = fetchMock.mock.calls.length;
    expect(callsAfterFailedSweep).toBeGreaterThan(0);

    // The next admin page load must not re-issue the fan-out — that feedback
    // loop is what kept Sentry rate-limiting the Bridge.
    expect(await fetchSentryFeatureCounts(['round_tracking'])).toBeNull();
    expect(fetchMock.mock.calls.length).toBe(callsAfterFailedSweep);
  });
});
