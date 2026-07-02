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
