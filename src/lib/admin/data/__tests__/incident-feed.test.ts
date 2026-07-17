import { describe, it, expect } from 'vitest';
import {
  buildIncidentFeedFromSources,
  buildSentrySearchQuery,
  filterSentryIssuesByDeploy,
  filterSentryIssuesByWindow,
  summarizeIncidentFeed,
} from '@/lib/admin/data/incident-feed';
import type { AppTriageEventRow } from '@/lib/admin/data/triage';
import type { SentryIssue } from '@/lib/admin/sentry-api';

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
