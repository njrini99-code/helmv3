import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import {
  fetchSentryIssues,
  fetchSentryFeatureCounts,
  updateSentryIssueStatus,
  __resetSentryFeatureCountCooldown,
} from '@/lib/admin/sentry-api';

// Well-formed by shape (an org token). The old fixtures — 'sentry-read-token',
// 'ci-token-long' — are exactly the short opaque strings credential-shape.mjs
// now rejects, which is the point of the change.
const READ_TOKEN = 'sntrys_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CI_TOKEN = 'sntryu_cccccccccccccccccccccccccccccccccccccccccccccccc';

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
    vi.stubEnv('SENTRY_READ_TOKEN', READ_TOKEN);
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
    vi.stubEnv('SENTRY_AUTH_TOKEN', CI_TOKEN);
    fetchMock.mockResolvedValue(new Response(JSON.stringify([issuePayload('1')]), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const res = await fetchSentryIssues();
    expect(res.status).toBe('ok');
    const headers = fetchMock.mock.calls[0]![1] as { headers: Record<string, string> };
    expect(headers.headers.Authorization).toBe(`Bearer ${CI_TOKEN}`);
  });

  it('prefers SENTRY_READ_TOKEN over SENTRY_AUTH_TOKEN when both are set', async () => {
    vi.stubEnv('SENTRY_AUTH_TOKEN', CI_TOKEN);
    fetchMock.mockResolvedValue(new Response(JSON.stringify([issuePayload('1')]), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const res = await fetchSentryIssues();
    expect(res.status).toBe('ok');
    const headers = fetchMock.mock.calls[0]![1] as { headers: Record<string, string> };
    expect(headers.headers.Authorization).toBe(`Bearer ${READ_TOKEN}`);
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
    vi.stubEnv('SENTRY_READ_TOKEN', READ_TOKEN);
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

  // REMOVED: 'queries is:unresolved feature:<key> per key ...'
  //
  // It asserted the FANOUT — one `feature:<key>` query per feature — as the
  // correct behaviour. ET-4 replaced that with a single Discover aggregate, so
  // the assertion now describes a mechanism that no longer exists. Its real
  // subject (total/critical bucketing) is covered by
  // 'buckets total and critical from the grouped rows' below, against the
  // response shape the aggregate actually returns.

  // REMOVED: 'degrades to null for ALL keys if any single per-feature query
  // fails ...' — there is no longer a per-feature query to fail. The property
  // it protected (never a partial, misleading map) is now covered by
  // 'a failed aggregate degrades to null — never a partial map'.

  it('degrades to null on a thrown network error', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    const res = await fetchSentryFeatureCounts(['round_tracking']);
    expect(res).toBeNull();
  });

  // REMOVED: 'never exceeds the concurrency ceiling ...' and, below,
  // 'abandons the rest of the sweep once one query fails'.
  //
  // Both bounded a worker pool that no longer exists, and both would now pass
  // VACUOUSLY — a single request trivially satisfies "at most 6 in flight" and
  // "at most 6 calls before abandoning". A test that cannot fail is worse than
  // no test, because it reads like coverage. The stronger guarantee that
  // replaces them is 'makes exactly ONE request regardless of how many
  // features exist', which fails the moment a fanout returns.


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

describe('updateSentryIssueStatus', () => {
  beforeEach(() => {
    vi.stubEnv('SENTRY_READ_TOKEN', READ_TOKEN);
    vi.stubEnv('SENTRY_ORG', 'helm-xs');
    vi.stubEnv('SENTRY_PROJECT', 'javascript-nextjs');
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns unconfigured (NOT an error) when neither token env is set', async () => {
    vi.stubEnv('SENTRY_READ_TOKEN', '');
    vi.stubEnv('SENTRY_AUTH_TOKEN', '');
    const res = await updateSentryIssueStatus('123', 'resolved');
    expect(res.status).toBe('unconfigured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('PUTs the status to the issue endpoint and returns the updated id/status on success', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: '123', status: 'resolved' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const res = await updateSentryIssueStatus('123', 'resolved');

    expect(res.status).toBe('ok');
    expect(res.data).toEqual({ id: '123', status: 'resolved' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit & { headers: Record<string, string> }];
    expect(String(url)).toBe('https://sentry.io/api/0/organizations/helm-xs/issues/123/');
    expect(init.method).toBe('PUT');
    expect(init.headers.Authorization).toBe(`Bearer ${READ_TOKEN}`);
    expect(init.body).toBe(JSON.stringify({ status: 'resolved' }));
  });

  it('rejects an empty issue id without calling fetch', async () => {
    const res = await updateSentryIssueStatus('   ', 'resolved');
    expect(res.status).toBe('error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a 403 to a clear, actionable write-scope message and does not retry', async () => {
    fetchMock.mockResolvedValue(new Response('forbidden', { status: 403 }));
    const res = await updateSentryIssueStatus('123', 'resolved');

    expect(res.status).toBe('error');
    expect(res.error).toContain('403');
    expect(res.error).toContain('token lacks event:write / issue write scope');
    expect(res.error).toContain('add a token with write scope');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps a 401 to the same actionable write-scope message and does not retry', async () => {
    fetchMock.mockResolvedValue(new Response('unauthorized', { status: 401 }));
    const res = await updateSentryIssueStatus('123', 'resolved');

    expect(res.status).toBe('error');
    expect(res.error).toContain('401');
    expect(res.error).toContain('write scope');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry a 4xx other than 401/403', async () => {
    fetchMock.mockResolvedValue(new Response('not found', { status: 404 }));
    const res = await updateSentryIssueStatus('123', 'resolved');

    expect(res.status).toBe('error');
    expect(res.error).toContain('404');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries exactly once on a 5xx and succeeds if the retry is ok', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('upstream error', { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: '123', status: 'resolved' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }));
    const res = await updateSentryIssueStatus('123', 'resolved');

    expect(res.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails soft after a 5xx retry that also fails, without a second retry', async () => {
    fetchMock.mockResolvedValue(new Response('upstream error', { status: 503 }));
    const res = await updateSentryIssueStatus('123', 'resolved');

    expect(res.status).toBe('error');
    expect(res.error).toContain('503');
    // One retry max — not an unbounded loop.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails soft on a thrown network error without throwing', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    const res = await updateSentryIssueStatus('123', 'resolved');

    expect(res.status).toBe('error');
    expect(res.error).toContain('ECONNRESET');
  });

  it('supports the ignored status too', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: '123', status: 'ignored' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const res = await updateSentryIssueStatus('123', 'ignored');

    expect(res.status).toBe('ok');
    expect(res.data).toEqual({ id: '123', status: 'ignored' });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBe(JSON.stringify({ status: 'ignored' }));
  });

  // The id is interpolated into a URL PATH, and the request carries a token
  // far more privileged than the operator holding it. `../../` walks to
  // another endpoint and a leading `//` re-points the host outright, so a
  // malformed id must never reach fetch() at all.
  it.each([
    ['path traversal', '../../../organizations/other/issues/1'],
    ['protocol-relative host', '//evil.example.com/x'],
    ['encoded traversal', '..%2F..%2Fadmin'],
    ['absolute url', 'https://evil.example.com/'],
    ['backslash', 'a\\b'],
    ['newline', '123\n456'],
    ['whitespace-only', '   '],
  ])('refuses a malformed issue id (%s) before any request', async (_label, badId) => {
    const res = await updateSentryIssueStatus(badId, 'resolved');

    expect(res.status).not.toBe('ok');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a Sentry short-id and encodes it into the path', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'HELMV3-4C', status: 'resolved' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const res = await updateSentryIssueStatus('HELMV3-4C', 'resolved');

    expect(res.status).toBe('ok');
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('/issues/HELMV3-4C/');
  });
});

// ---------------------------------------------------------------------------
// ET-4 — per-feature counts come from ONE aggregate query, not one query per
// feature.
//
// MEASURED against production Sentry (org helm-xs, 2026-08-29, one authorised
// probe). The Discover events endpoint answers the whole question in a single
// request by grouping on the tag:
//
//   GET /organizations/<org>/events/
//       ?dataset=errors&query=is:unresolved&statsPeriod=24h
//       &field=feature&field=level&field=count_unique(issue)
//
//   [{"level":"error","feature":"","count_unique(issue)":4},
//    {"level":"info","feature":"calendar","count_unique(issue)":1},
//    {"level":"info","feature":"unknown","count_unique(issue)":1}]
//
// The old sweep issued one PAGINATING request per feature key — ~85 distinct
// URLs, each subject to Sentry's rate limit (observed
// `x-sentry-rate-limit-limit: 10`). That fanout is what earned the sustained
// 429s the Bridge reports as integration faults.
//
// `count_unique(issue)` is deliberate. `count()` returns EVENTS (7/1/2 in the
// same probe) where this function's contract is ISSUES (4/1/1). Shipping
// `count()` would have silently redefined the number — the exact
// lifetime-vs-window mistake #1666 closed, in a new place.
// ---------------------------------------------------------------------------
describe('fetchSentryFeatureCounts — one aggregate query, not one per feature', () => {
  beforeEach(() => {
    vi.stubEnv('SENTRY_READ_TOKEN', READ_TOKEN);
    vi.stubEnv('SENTRY_ORG', 'helm-xs');
    vi.stubEnv('SENTRY_PROJECT', 'javascript-nextjs');
    fetchMock.mockReset();
    __resetSentryFeatureCountCooldown();
  });
  afterEach(() => vi.unstubAllEnvs());

  const aggregate = (rows: unknown[]) =>
    new Response(JSON.stringify({ data: rows }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  it('makes exactly ONE request regardless of how many features exist', async () => {
    fetchMock.mockResolvedValue(aggregate([]));
    const keys = Array.from({ length: 85 }, (_, i) => `feature_${i}`);

    await fetchSentryFeatureCounts(keys);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks the Discover events endpoint, grouped by feature and level', async () => {
    fetchMock.mockResolvedValue(aggregate([]));
    await fetchSentryFeatureCounts(['round_tracking']);

    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('/events/');
    expect(url).toContain('field=feature');
    expect(url).toContain('field=level');
    expect(url).toContain('count_unique');
    // A per-feature filter would be the fanout returning.
    expect(url).not.toContain('feature%3A');
  });

  it('buckets total and critical from the grouped rows', async () => {
    fetchMock.mockResolvedValue(
      aggregate([
        { feature: 'round_tracking', level: 'error', 'count_unique(issue)': 3 },
        { feature: 'round_tracking', level: 'fatal', 'count_unique(issue)': 2 },
        { feature: 'calendar', level: 'info', 'count_unique(issue)': 1 },
      ]),
    );

    const res = await fetchSentryFeatureCounts(['round_tracking', 'calendar', 'stats_analytics']);
    expect(res).toEqual({
      round_tracking: { total: 5, critical: 2 },
      calendar: { total: 1, critical: 0 },
      // Absent from the response means the aggregate asked globally and this
      // feature had none — genuinely zero, not "we did not ask".
      stats_analytics: { total: 0, critical: 0 },
    });
  });

  it('ignores rows for features the caller did not ask about', async () => {
    // The aggregate returns every feature in the org, including "" and
    // "unknown". Only requested keys may appear in the result.
    fetchMock.mockResolvedValue(
      aggregate([
        { feature: '', level: 'error', 'count_unique(issue)': 4 },
        { feature: 'unknown', level: 'info', 'count_unique(issue)': 1 },
        { feature: 'calendar', level: 'error', 'count_unique(issue)': 2 },
      ]),
    );

    const res = await fetchSentryFeatureCounts(['calendar']);
    expect(res).toEqual({ calendar: { total: 2, critical: 0 } });
  });

  it('an UNRECOGNISED response envelope is unreadable, not zero rows', async () => {
    // The most dangerous shape in this file. The `{ data: [...] }` envelope was
    // confirmed through the Sentry MCP, not by parsing a raw REST body — so it
    // is INFERRED, and inference can be wrong. If Sentry returns something else
    // and we read it as "no rows", every feature reports zero unresolved issues
    // and the Bridge renders a fully healthy board off an unparsed response.
    //
    // Unreadable must degrade to null, exactly like a 429.
    for (const body of [{ notData: [] }, 'a string', 42, null]) {
      fetchMock.mockReset();
      __resetSentryFeatureCountCooldown();
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      expect(await fetchSentryFeatureCounts(['round_tracking'])).toBeNull();
    }
  });

  it('an empty but WELL-FORMED aggregate is zero, not unreadable', async () => {
    // The other half: `{ data: [] }` is a successful answer meaning nothing is
    // unresolved. Collapsing it into null would hide a genuinely healthy board.
    fetchMock.mockResolvedValue(aggregate([]));
    expect(await fetchSentryFeatureCounts(['round_tracking'])).toEqual({
      round_tracking: { total: 0, critical: 0 },
    });
  });

  it('a failed aggregate degrades to null — never a partial map', async () => {
    fetchMock.mockResolvedValue(new Response('slow down', { status: 429 }));
    const res = await fetchSentryFeatureCounts(['round_tracking', 'calendar']);
    expect(res).toBeNull();
  });

  it('a thrown network error degrades to null', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    expect(await fetchSentryFeatureCounts(['round_tracking'])).toBeNull();
  });
});
