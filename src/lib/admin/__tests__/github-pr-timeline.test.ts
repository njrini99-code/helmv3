import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { fetchWorkLog } from '@/lib/admin/github-pr-timeline';

// Realistic /search/issues fixture: merge state is nested under
// `pull_request.merged_at`, never exposed as a top-level `merged_at` key —
// this is the exact shape that made every merged PR render as "Closed".
const SEARCH_ISSUES_RESPONSE = {
  items: [
    {
      number: 797,
      html_url: 'https://github.com/njrini99-code/helmv3/pull/797',
      title: 'feat(golf): premium wave',
      state: 'closed',
      body: '## Summary\n\nShip it.',
      created_at: '2026-07-08T10:00:00Z',
      updated_at: '2026-07-10T11:28:49Z',
      closed_at: '2026-07-10T11:28:49Z',
      user: { login: 'njrini99' },
      pull_request: { merged_at: '2026-07-10T11:28:49Z' },
    },
    {
      number: 798,
      html_url: 'https://github.com/njrini99-code/helmv3/pull/798',
      title: 'fix(baseball): roster edge case',
      state: 'open',
      body: '## Summary\n\nWIP.',
      created_at: '2026-07-09T09:00:00Z',
      updated_at: '2026-07-09T09:00:00Z',
      closed_at: null,
      user: { login: 'njrini99' },
      pull_request: { merged_at: null },
    },
    {
      number: 799,
      html_url: 'https://github.com/njrini99-code/helmv3/pull/799',
      title: 'chore: abandoned experiment',
      state: 'closed',
      body: '## Summary\n\nNot shipping this.',
      created_at: '2026-07-01T09:00:00Z',
      updated_at: '2026-07-02T09:00:00Z',
      closed_at: '2026-07-02T09:00:00Z',
      user: { login: 'njrini99' },
      pull_request: { merged_at: null },
    },
  ],
};

describe('fetchWorkLog', () => {
  beforeEach(() => {
    vi.stubEnv('GITHUB_ISSUES_TOKEN', 'github-issues-token');
    vi.stubEnv('GITHUB_ISSUES_REPO', 'njrini99-code/helmv3');
    vi.stubEnv('GITHUB_PR_AUTHOR_LOGINS', '');
    vi.stubEnv('GITHUB_PR_AUTHOR_LOGIN', '');
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('classifies a search-API PR with nested pull_request.merged_at as merged', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(SEARCH_ISSUES_RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const res = await fetchWorkLog();
    expect(res.status).toBe('ok');

    const merged = res.data!.entries.find((entry) => entry.number === 797);
    expect(merged?.state).toBe('merged');
    expect(merged?.merged_at).toBe('2026-07-10T11:28:49Z');

    const open = res.data!.entries.find((entry) => entry.number === 798);
    expect(open?.state).toBe('open');

    const closedNotMerged = res.data!.entries.find((entry) => entry.number === 799);
    expect(closedNotMerged?.state).toBe('closed');

    expect(res.data!.counts.merged).toBe(1);
    expect(res.data!.counts.open).toBe(1);
    expect(res.data!.counts.total).toBe(3);
  });
});
