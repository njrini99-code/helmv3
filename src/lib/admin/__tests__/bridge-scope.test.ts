/**
 * "Bridge should just be clubhouse only" (owner, 2026-11-17). The scope narrows the Bridge's error and incident VIEWS
 * and nothing else: an unscoped call (the digest cron, self-heal, auto-resolve) must read exactly what it read before.
 */
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));

import {
  ADMIN_EVENTS_CLUBHOUSE_FILTER,
  BRIDGE_UI_SCOPE,
  ERROR_LOGS_CLUBHOUSE_FILTER,
  isClubhouseTagged,
  scopeAdminEvents,
  scopeErrorLogs,
  scopedSentryUnresolvedQuery,
  sentryScopeTokens,
} from '@/lib/admin/bridge-scope';
import { buildSentrySearchQuery, queryStaleUnresolvedIncidents } from '@/lib/admin/data/incident-feed';
import { describeErrorsFilters } from '@/lib/admin/data/errors';
import { keepScopedDrafts } from '@/lib/admin/incidents/fetch';

function orSpy() {
  const calls: string[] = [];
  const q = {
    or: (filter: string) => {
      calls.push(filter);
      return q;
    },
  };
  return { q, calls };
}

describe('BRIDGE_UI_SCOPE', () => {
  it('is Clubhouse', () => {
    expect(BRIDGE_UI_SCOPE).toBe('clubhouse');
  });
});

describe('scopeAdminEvents / scopeErrorLogs', () => {
  it('reads the tag wherever either writer put it, new rows and old', () => {
    expect(ADMIN_EVENTS_CLUBHOUSE_FILTER.split(',')).toEqual([
      'metadata->>ui.eq.clubhouse',
      'metadata->context->>ui.eq.clubhouse',
      'metadata->tags->>ui.eq.clubhouse',
    ]);
    expect(ERROR_LOGS_CLUBHOUSE_FILTER.split(',')).toEqual(['context->>ui.eq.clubhouse', 'context->tags->>ui.eq.clubhouse']);
  });

  it('narrows a scoped query once', () => {
    const a = orSpy();
    expect(scopeAdminEvents(a.q, 'clubhouse')).toBe(a.q);
    expect(a.calls).toEqual([ADMIN_EVENTS_CLUBHOUSE_FILTER]);
    const b = orSpy();
    scopeErrorLogs(b.q, 'clubhouse');
    expect(b.calls).toEqual([ERROR_LOGS_CLUBHOUSE_FILTER]);
  });

  it("is a no-op for 'all' and for the machinery's unscoped call", () => {
    for (const scope of ['all', undefined] as const) {
      const s = orSpy();
      scopeAdminEvents(s.q, scope);
      scopeErrorLogs(s.q, scope);
      expect(s.calls).toEqual([]);
    }
  });
});

describe('Sentry under the scope', () => {
  it('adds ui:clubhouse to the merge query and the unresolved pull', () => {
    expect(sentryScopeTokens('clubhouse')).toEqual(['ui:clubhouse']);
    expect(scopedSentryUnresolvedQuery('clubhouse')).toBe('is:unresolved ui:clubhouse');
    expect(buildSentrySearchQuery({ scope: 'clubhouse' })).toBe('is:unresolved !level:info !level:debug ui:clubhouse');
  });

  it('leaves an unscoped query exactly as it was', () => {
    expect(sentryScopeTokens(undefined)).toEqual([]);
    expect(scopedSentryUnresolvedQuery('all')).toBe('is:unresolved');
    expect(buildSentrySearchQuery({})).toBe('is:unresolved !level:info !level:debug');
  });
});

describe('isClubhouseTagged', () => {
  it('matches the three places the tag is stored', () => {
    expect(isClubhouseTagged({ ui: 'clubhouse' })).toBe(true);
    expect(isClubhouseTagged({ context: { ui: 'clubhouse' } })).toBe(true);
    expect(isClubhouseTagged({ tags: { ui: 'clubhouse', surface: 'home' } })).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isClubhouseTagged({ sport: 'golf' })).toBe(false);
    expect(isClubhouseTagged({ tags: { ui: 'fairway' } })).toBe(false);
    expect(isClubhouseTagged(null)).toBe(false);
    expect(isClubhouseTagged([])).toBe(false);
  });
});

describe('queryStaleUnresolvedIncidents under the scope', () => {
  it('narrows the stale read the Incidents page shows', async () => {
    const orCalls: string[] = [];
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      not: () => chain,
      lt: () => chain,
      order: () => chain,
      limit: () => chain,
      or: (f: string) => {
        orCalls.push(f);
        return chain;
      },
      then: (resolve: (v: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    mocks.from.mockReturnValue(chain);
    await queryStaleUnresolvedIncidents(72, 'clubhouse');
    expect(orCalls).toEqual([ADMIN_EVENTS_CLUBHOUSE_FILTER]);
    orCalls.length = 0;
    await queryStaleUnresolvedIncidents(72);
    expect(orCalls).toEqual([]);
  });
});

describe('keepScopedDrafts', () => {
  const draft = (app: string[], sentry: string[]) => ({ appFingerprints: app, sentryIssueIds: sentry });

  it('drops reliability-only incidents under the scope: no UI can be attributed to them', () => {
    const drafts = [draft(['fp'], []), draft([], ['s1']), draft([], [])];
    expect(keepScopedDrafts(drafts, 'clubhouse')).toEqual([draft(['fp'], []), draft([], ['s1'])]);
  });

  it('keeps everything for an unscoped read', () => {
    const drafts = [draft([], [])];
    expect(keepScopedDrafts(drafts, undefined)).toEqual(drafts);
    expect(keepScopedDrafts(drafts, 'all')).toEqual(drafts);
  });
});

describe('describeErrorsFilters', () => {
  it('names the scope in a copied report', () => {
    expect(describeErrorsFilters({ windowHours: 72, scope: 'clubhouse' })).toBe(
      'window=72h; kind=actionable only; ui=clubhouse',
    );
  });
});
