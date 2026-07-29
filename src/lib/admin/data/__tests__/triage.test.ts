import { describe, it, expect } from 'vitest';
import { mergeTriage, isExpectedAuthNoise, type AppTriageEventRow } from '@/lib/admin/data/triage';
import type { SentryIssue } from '@/lib/admin/sentry-api';

const sentryIssue = (over: Partial<SentryIssue>): SentryIssue => ({
  id: 's1', shortId: 'HELM-1', title: 'TypeError in rounds', culprit: null,
  level: 'error', status: 'unresolved', substatus: 'ongoing',
  count: 40, userCount: 7, firstSeen: '2026-06-30T00:00:00Z',
  lastSeen: '2026-07-01T02:00:00Z', permalink: 'https://sentry.io/x', stats24h: [],
  ...over,
});

const appEvent = (over: Partial<AppTriageEventRow>): AppTriageEventRow => ({
  id: 'e1', title: 'savePartialRound failed', message: 'insert failed',
  severity: 'error', sport: 'golf', fingerprint: 'fp-1',
  user_id: 'u1', url: '/api/golf/rounds', created_at: '2026-07-01T01:00:00Z',
  ...over,
});

describe('mergeTriage', () => {
  it('groups app events by fingerprint and counts distinct users', () => {
    const items = mergeTriage({
      sentryIssues: [],
      appEvents: [
        appEvent({ id: 'e1', user_id: 'u1' }),
        appEvent({ id: 'e2', user_id: 'u2' }),
        appEvent({ id: 'e3', user_id: 'u2' }),
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      key: 'app:fp-1', origin: 'app', occurrences: 3, affectedUsers: 2,
      eventIds: ['e1', 'e2', 'e3'], sport: 'golf',
    });
  });

  it('ranks by affected users first, recency second — never raw volume', () => {
    const items = mergeTriage({
      sentryIssues: [sentryIssue({ id: 'noisy', count: 9999, userCount: 1 })],
      appEvents: [
        appEvent({ id: 'e1', user_id: 'u1' }),
        appEvent({ id: 'e2', user_id: 'u2' }),
      ],
    });
    expect(items[0]!.key).toBe('app:fp-1');   // 2 users beats 9999 events / 1 user
    expect(items[1]!.key).toBe('sentry:noisy');
  });

  it('attributes sport/feature to sentry-origin items only when the caller says the fetch was scoped by that tag', () => {
    const unscoped = mergeTriage({ sentryIssues: [sentryIssue({})], appEvents: [] });
    expect(unscoped[0]).toMatchObject({ sport: null, feature: null });

    const scoped = mergeTriage({
      sentryIssues: [sentryIssue({})],
      appEvents: [],
      sentryTagHint: { sport: 'golf', feature: 'round_tracking' },
    });
    expect(scoped[0]).toMatchObject({ sport: 'golf', feature: 'round_tracking' });
  });

  it('carries sentry substatus + permalink through', () => {
    const items = mergeTriage({
      sentryIssues: [sentryIssue({ substatus: 'regressed' })],
      appEvents: [],
    });
    expect(items[0]).toMatchObject({
      origin: 'sentry', substatus: 'regressed', permalink: 'https://sentry.io/x', eventIds: [],
    });
  });

  it('drops expected auth-state control flow (Noise Charter) but keeps real denials', () => {
    const items = mergeTriage({
      sentryIssues: [],
      appEvents: [
        appEvent({
          id: 'n1', fingerprint: null, severity: 'warning',
          title: '[getUnreadNotificationCount] You must be signed in.',
          message: 'You must be signed in.',
        }),
        appEvent({
          id: 'n2', fingerprint: null, severity: 'warning',
          title: '[getUnreadNotificationCount] No active baseball team for this account.',
          message: 'No active baseball team for this account.',
        }),
        // Access denial for a signed-in user is a real signal — must survive.
        appEvent({
          id: 'k1', fingerprint: null, severity: 'error',
          title: '[getPlayerBodyweightHistory] You do not have access to this Lifting Lab.',
          message: 'You do not have access to this Lifting Lab.',
        }),
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.key).toBe('app:row:k1');
  });
});

describe('isExpectedAuthNoise', () => {
  it('matches in title or message, case-insensitively', () => {
    expect(isExpectedAuthNoise({ title: 'x', message: 'YOU MUST BE SIGNED IN' })).toBe(true);
    expect(isExpectedAuthNoise({ title: 'No active baseball team for this account.', message: null })).toBe(true);
    expect(isExpectedAuthNoise({ title: 'savePartialRound failed', message: 'permission denied' })).toBe(false);
  });
});

describe('isExpectedAuthNoise', () => {
  it('flags the "you must be signed in" family, case-insensitively', () => {
    expect(isExpectedAuthNoise('You must be signed in')).toBe(true);
    expect(isExpectedAuthNoise('you must be signed in to submit rounds')).toBe(true);
  });
  it('flags the baseball no-active-team message', () => {
    expect(isExpectedAuthNoise('No active baseball team context')).toBe(true);
  });
  it('does not flag a real incident message', () => {
    expect(isExpectedAuthNoise('insert failed: duplicate key value')).toBe(false);
  });
  it('treats null/undefined as not-noise', () => {
    expect(isExpectedAuthNoise(null)).toBe(false);
    expect(isExpectedAuthNoise(undefined)).toBe(false);
  });
});

/**
 * Regression detection for APP-origin incidents. Sentry rows have always had
 * this via Sentry's own substatus; the app-origin branch hardcoded null, so
 * TriageQueue's REGRESSED tag could never fire for the majority-volume half
 * of the feed. "Did my fix hold?" was unanswerable.
 */
describe('mergeTriage — app-origin regression detection', () => {
  const RESOLVED_AT = '2026-07-01T00:00:00Z';

  it('flags REGRESSED when the incident fired again AFTER its resolution', () => {
    const items = mergeTriage({
      sentryIssues: [],
      appEvents: [appEvent({ id: 'e1', created_at: '2026-07-02T00:00:00Z' })],
      priorResolutions: new Map([['fp-1', RESOLVED_AT]]),
    });
    expect(items[0]?.substatus).toBe('regressed');
  });

  it('does NOT flag when the occurrence predates the resolution — an incident that was open all along is not a regression', () => {
    const items = mergeTriage({
      sentryIssues: [],
      appEvents: [appEvent({ id: 'e1', created_at: '2026-06-30T00:00:00Z' })],
      priorResolutions: new Map([['fp-1', RESOLVED_AT]]),
    });
    expect(items[0]?.substatus).toBeNull();
  });

  it('compares against firstSeen, not lastSeen — an ongoing incident spanning a stale resolution must not read as regressed', () => {
    const items = mergeTriage({
      sentryIssues: [],
      appEvents: [
        // firstSeen precedes the resolution; lastSeen follows it.
        appEvent({ id: 'e1', created_at: '2026-06-29T00:00:00Z' }),
        appEvent({ id: 'e2', created_at: '2026-07-05T00:00:00Z' }),
      ],
      priorResolutions: new Map([['fp-1', RESOLVED_AT]]),
    });
    expect(items[0]?.substatus).toBeNull();
  });

  it('does not flag a fingerprint that was never resolved', () => {
    const items = mergeTriage({
      sentryIssues: [],
      appEvents: [appEvent({ id: 'e1', created_at: '2026-07-02T00:00:00Z' })],
      priorResolutions: new Map(),
    });
    expect(items[0]?.substatus).toBeNull();
  });

  it('is inert when priorResolutions is omitted — every existing caller keeps its prior behaviour', () => {
    const items = mergeTriage({
      sentryIssues: [],
      appEvents: [appEvent({ id: 'e1', created_at: '2026-07-02T00:00:00Z' })],
    });
    expect(items[0]?.substatus).toBeNull();
  });

  it('only flags the fingerprint that actually regressed', () => {
    const items = mergeTriage({
      sentryIssues: [],
      appEvents: [
        appEvent({ id: 'e1', fingerprint: 'fp-1', created_at: '2026-07-02T00:00:00Z' }),
        appEvent({ id: 'e2', fingerprint: 'fp-2', created_at: '2026-07-02T00:00:00Z' }),
      ],
      priorResolutions: new Map([['fp-1', RESOLVED_AT]]),
    });
    expect(items.find((i) => i.key === 'app:fp-1')?.substatus).toBe('regressed');
    expect(items.find((i) => i.key === 'app:fp-2')?.substatus).toBeNull();
  });

  it('leaves Sentry substatus untouched — Sentry remains the authority for its own rows', () => {
    const items = mergeTriage({
      sentryIssues: [sentryIssue({ substatus: 'ongoing' })],
      appEvents: [],
      priorResolutions: new Map([['fp-1', RESOLVED_AT]]),
    });
    expect(items[0]?.substatus).toBe('ongoing');
  });
});
