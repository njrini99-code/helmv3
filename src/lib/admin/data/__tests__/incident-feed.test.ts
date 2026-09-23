import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted so the `vi.mock` factory below (which vitest hoists above every
// import in this file) can close over it. Only `queryStaleUnresolvedIncidents`
// actually calls `createAdminClient()` — every other test in this file
// exercises a pure function and never touches this mock.
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));

import {
  buildIncidentFeedFromSources,
  buildSentrySearchQuery,
  filterSentryIssuesByDeploy,
  filterSentryIssuesByWindow,
  summarizeIncidentFeed,
  groupStaleUnresolvedRows,
  excludeInWindowFingerprints,
  queryStaleUnresolvedIncidents,
  type RawStaleUnresolvedRow,
  type StaleUnresolvedIncident,
} from '@/lib/admin/data/incident-feed';
import type { AppTriageEventRow } from '@/lib/admin/data/triage';
import type { SentryIssue } from '@/lib/admin/sentry-api';

/** Chainable stub matching supabase-js's query-builder shape — every method
 *  returns the same object until it is awaited (same pattern
 *  feature-health-detail.test.ts uses for the identical library). */
function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    not: () => chain,
    lt: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const appEvent = (over: Partial<AppTriageEventRow>): AppTriageEventRow => ({
  id: 'e1',
  title: 'save failed',
  message: 'insert failed',
  severity: 'error',
  sport: 'baseball',
  fingerprint: 'fp-1',
  user_id: 'u1',
  url: '/baseball/dashboard',
  created_at: '2026-07-04T12:00:00.000Z',
  ...over,
});

const sentryIssue = (over: Partial<SentryIssue>): SentryIssue => ({
  id: 's1',
  shortId: 'HELM-1',
  title: 'TypeError',
  culprit: null,
  level: 'error',
  status: 'unresolved',
  substatus: null,
  count: 3,
  userCount: 1,
  firstSeen: '2026-07-03T00:00:00Z',
  lastSeen: '2026-07-04T11:00:00.000Z',
  permalink: 'https://sentry.io/x',
  stats24h: [],
  ...over,
});

describe('incident feed', () => {
  it('filters Sentry issues to those with lastSeen inside the window', () => {
    const inWindow = sentryIssue({ id: 'in', lastSeen: new Date().toISOString() });
    const outWindow = sentryIssue({
      id: 'out',
      lastSeen: new Date(Date.now() - 48 * 3600_000).toISOString(),
    });

    const filtered = filterSentryIssuesByWindow([inWindow, outWindow], 24);
    expect(filtered.map((i) => i.id)).toEqual(['in']);
  });

  it('builds one total count from app + windowed sentry groups', () => {
    const { incidents, counts } = buildIncidentFeedFromSources(
      [appEvent({ id: 'e1' }), appEvent({ id: 'e2', fingerprint: 'fp-2' })],
      [
        sentryIssue({ id: 's1', lastSeen: new Date().toISOString() }),
        sentryIssue({ id: 's2', lastSeen: new Date(Date.now() - 48 * 3600_000).toISOString() }),
      ],
      24,
    );

    expect(incidents).toHaveLength(3);
    expect(summarizeIncidentFeed(incidents)).toEqual(counts);
    expect(counts).toMatchObject({ totalGroups: 3, appGroups: 2, sentryGroups: 1 });
  });

  // Catalogued defect (h): a QA fixture round stays in `totalGroups` (it
  // renders, badged, in the default feed — `actionable` is left untouched)
  // but must never inflate `actionableGroups`, the count `overview.ts` and
  // `errors/page.tsx` both render.
  it("excludes a QA fixture round from actionableGroups but keeps it in totalGroups", () => {
    const { incidents, counts } = buildIncidentFeedFromSources(
      [
        appEvent({ id: 'e1', fingerprint: 'fp-real' }),
        appEvent({
          id: 'e2',
          fingerprint: 'fp-fixture',
          metadata: { roundId: '0b000000-0000-4000-b000-000000000002' },
        }),
      ],
      [],
      24,
    );

    expect(incidents).toHaveLength(2);
    expect(counts.totalGroups).toBe(2);
    expect(counts.actionableGroups).toBe(1);
    expect(summarizeIncidentFeed(incidents)).toEqual(counts);
  });

  it('filterSentryIssuesByDeploy passes everything through when deploy data is unavailable', () => {
    const issues = [sentryIssue({ id: 'a', lastSeen: '2020-01-01T00:00:00Z' })];
    expect(filterSentryIssuesByDeploy(issues, null)).toEqual(issues);
  });

  it('filterSentryIssuesByDeploy passes everything through while the deploy is under 24h old', () => {
    const now = Date.parse('2026-07-16T12:00:00Z');
    const deployAt = now - 2 * 3600_000;
    const issues = [sentryIssue({ id: 'a', lastSeen: '2020-01-01T00:00:00Z' })];
    expect(filterSentryIssuesByDeploy(issues, deployAt, now)).toEqual(issues);
  });

  it('filterSentryIssuesByDeploy hides issues quiet since before a >=24h-old deploy, keeps regressions', () => {
    const now = Date.parse('2026-07-16T12:00:00Z');
    const deployAt = now - 48 * 3600_000;
    const fixed = sentryIssue({ id: 'fixed', lastSeen: new Date(deployAt - 3600_000).toISOString() });
    const regressed = sentryIssue({ id: 'regressed', lastSeen: new Date(deployAt + 3600_000).toISOString() });

    const filtered = filterSentryIssuesByDeploy([fixed, regressed], deployAt, now);
    expect(filtered.map((i) => i.id)).toEqual(['regressed']);
  });
});

describe('buildSentrySearchQuery', () => {
  it('defaults to is:unresolved plus the same info/debug noise floor queryAppErrorEvents applies', () => {
    expect(buildSentrySearchQuery({})).toBe('is:unresolved !level:info !level:debug');
  });

  it('translates an explicit severity to the matching Sentry level, no floor exclusion', () => {
    expect(buildSentrySearchQuery({ severity: 'critical' })).toBe('is:unresolved level:fatal');
    expect(buildSentrySearchQuery({ severity: 'error' })).toBe('is:unresolved level:error');
    expect(buildSentrySearchQuery({ severity: 'info' })).toBe('is:unresolved level:info');
  });

  it('adds sport/feature/source tokens so Sentry-origin incidents are actually narrowed', () => {
    expect(
      buildSentrySearchQuery({ sport: 'golf', feature: 'round_tracking', source: 'server_action' }),
    ).toBe('is:unresolved !level:info !level:debug sport:golf feature:round_tracking error_source:server_action');
  });

  it('never translates the synthetic "sentry" source chip into an error_source token', () => {
    expect(buildSentrySearchQuery({ source: 'sentry' })).toBe('is:unresolved !level:info !level:debug');
  });
});

// ---------------------------------------------------------------------------
// Stale-unresolved fingerprints — "still open, quiet for 72h+" (bridge-tab-
// audit-p0p1 incidents Finding 8).
// ---------------------------------------------------------------------------

describe('groupStaleUnresolvedRows', () => {
  const row = (over: Partial<RawStaleUnresolvedRow>): RawStaleUnresolvedRow => ({
    title: 'React #441 crashed',
    severity: 'error',
    fingerprint: 'fp-1',
    created_at: '2026-08-01T00:00:00.000Z',
    ...over,
  });

  it('groups by fingerprint: counts occurrences and spans firstSeen/lastSeen regardless of row order', () => {
    const items = groupStaleUnresolvedRows([
      row({ fingerprint: 'fp-1', created_at: '2026-08-03T00:00:00.000Z' }),
      row({ fingerprint: 'fp-1', created_at: '2026-08-01T00:00:00.000Z' }),
      row({ fingerprint: 'fp-2', created_at: '2026-08-02T00:00:00.000Z', severity: 'critical' }),
    ]);

    const fp1 = items.find((i) => i.fingerprint === 'fp-1');
    expect(fp1).toMatchObject({
      occurrences: 2,
      firstSeen: '2026-08-01T00:00:00.000Z',
      lastSeen: '2026-08-03T00:00:00.000Z',
    });
    expect(items.find((i) => i.fingerprint === 'fp-2')).toMatchObject({ occurrences: 1, severity: 'critical' });
  });

  it('drops a row with no fingerprint or no created_at rather than guessing it into a bucket', () => {
    const items = groupStaleUnresolvedRows([
      row({ fingerprint: null }),
      row({ fingerprint: 'fp-3', created_at: null }),
      row({ fingerprint: 'fp-4' }),
    ]);
    expect(items.map((i) => i.fingerprint)).toEqual(['fp-4']);
  });

  it('sorts newest lastSeen first — the most recently dropped-off fingerprint leads', () => {
    const items = groupStaleUnresolvedRows([
      row({ fingerprint: 'older', created_at: '2026-08-01T00:00:00.000Z' }),
      row({ fingerprint: 'newer', created_at: '2026-08-05T00:00:00.000Z' }),
    ]);
    expect(items.map((i) => i.fingerprint)).toEqual(['newer', 'older']);
  });
});

describe('excludeInWindowFingerprints', () => {
  const item = (over: Partial<StaleUnresolvedIncident>): StaleUnresolvedIncident => ({
    fingerprint: 'fp-1',
    title: 'React #441 crashed',
    severity: 'error',
    occurrences: 1,
    firstSeen: '2026-08-01T00:00:00.000Z',
    lastSeen: '2026-08-01T00:00:00.000Z',
    ...over,
  });

  it('drops a fingerprint that is already visible in the current windowed feed — it did not drop off the board', () => {
    const items = [item({ fingerprint: 'fp-visible' }), item({ fingerprint: 'fp-dropped' })];
    const result = excludeInWindowFingerprints(items, new Set(['fp-visible']));
    expect(result.map((i) => i.fingerprint)).toEqual(['fp-dropped']);
  });

  it('keeps every item when nothing overlaps the window set', () => {
    const items = [item({ fingerprint: 'fp-1' }), item({ fingerprint: 'fp-2' })];
    expect(excludeInWindowFingerprints(items, new Set(['unrelated']))).toEqual(items);
  });

  it('an empty exclusion set drops nothing', () => {
    const items = [item({ fingerprint: 'fp-1' })];
    expect(excludeInWindowFingerprints(items, new Set())).toEqual(items);
  });
});

describe('queryStaleUnresolvedIncidents', () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it('groups a successful bounded read into StaleUnresolvedIncident rows', async () => {
    mocks.from.mockReturnValue(
      makeChain({
        data: [
          { title: 'React #441 crashed', severity: 'error', fingerprint: '7e45247a', created_at: '2026-08-01T00:00:00.000Z' },
          { title: 'React #441 crashed', severity: 'error', fingerprint: '7e45247a', created_at: '2026-08-02T00:00:00.000Z' },
        ],
        error: null,
      }),
    );

    const result = await queryStaleUnresolvedIncidents(72);

    expect(result.readable).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ fingerprint: '7e45247a', occurrences: 2 });
  });

  it('degrades to readable:false with the reason on a failed read — never throws, never a silent empty list', async () => {
    mocks.from.mockReturnValue(makeChain({ data: null, error: { message: 'connection refused' } }));

    const result = await queryStaleUnresolvedIncidents(72);

    expect(result.readable).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.reason).toMatch(/connection refused/);
  });
});
