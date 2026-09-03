import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queueMockAdminClient, type MockResult } from './test-helpers';
import type { AdminFetchResult } from '@/lib/admin/fetch-result';
import type { ReleaseLedgerData } from '@/lib/admin/data/release-ledger';
import type { fetchUserDetail as FetchUserDetail } from '@/lib/admin/data/users';

const perTable: Record<string, Array<() => MockResult>> = {};
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => queueMockAdminClient(perTable),
}));

type UserDetail = Awaited<ReturnType<typeof FetchUserDetail>>;
let userDetail: UserDetail;
vi.mock('@/lib/admin/data/users', () => ({
  fetchUserDetail: async () => userDetail,
}));

let releaseResult: AdminFetchResult<ReleaseLedgerData>;
vi.mock('@/lib/admin/data/release-ledger', () => ({
  fetchReleaseLedger: async () => releaseResult,
}));

import { fetchUserJourneyRibbon } from '../user-ribbon';

function emptyDetail(): UserDetail {
  return {
    user: { id: 'u1', email: 'nick@example.com', role: 'player', createdAt: null, lastSeen: null, sports: ['golf'] },
    memberships: [],
    recentActivity: [],
    authEvents: [],
    errorEvents: [],
  };
}

describe('fetchUserJourneyRibbon', () => {
  beforeEach(() => {
    for (const k of Object.keys(perTable)) delete perTable[k];
    userDetail = emptyDetail();
    releaseResult = { status: 'unconfigured', data: null, fetchedAt: null, error: 'Vercel not configured' };
    perTable['admin_events'] = [() => ({ data: [], error: null }), () => ({ data: [], error: null })];
  });

  it('never leaks email or name into the returned ribbon — only the opaque subject id', async () => {
    const ribbon = await fetchUserJourneyRibbon('u1');

    expect(ribbon.subjectRef).toBe('u1');
    expect(JSON.stringify(ribbon)).not.toContain('nick@example.com');
  });

  it('a user with no captured events leaves every stage null, never fabricates "reached"', async () => {
    const ribbon = await fetchUserJourneyRibbon('u1');

    for (const stage of ribbon.stages) {
      expect(stage.reached === null || stage.reached === false).toBe(true);
    }
    expect(ribbon.stages.find((s) => s.id === 'dashboard')!.reached).toBeNull();
  });

  it('marks stages reached from real events, distinct from stages this codebase cannot observe', async () => {
    userDetail = {
      ...emptyDetail(),
      authEvents: [{ id: 'e1', title: 'User logged in', event_type: 'login', created_at: '2026-09-01T00:00:00Z' }],
      recentActivity: [{ kind: 'round', at: '2026-09-01T01:00:00Z', label: 'Round at Pinehurst' }],
    };
    perTable['admin_events'] = [
      () => ({ data: [{ id: 'rs1', created_at: '2026-09-01T02:00:00Z' }], error: null }), // round_submitted
      () => ({ data: [], error: null }), // ai_generation
    ];

    const ribbon = await fetchUserJourneyRibbon('u1');

    expect(ribbon.stages.find((s) => s.id === 'login')!.reached).toBe(true);
    expect(ribbon.stages.find((s) => s.id === 'start_round')!.reached).toBe(true);
    expect(ribbon.stages.find((s) => s.id === 'submit')!.reached).toBe(true);
    expect(ribbon.stages.find((s) => s.id === 'coachhelm')!.reached).toBe(false);
    expect(ribbon.stages.find((s) => s.id === 'autosave')!.reached).toBeNull();
  });

  it('blind source: a failed round_submitted read leaves that stage null and is disclosed', async () => {
    perTable['admin_events'] = [() => ({ error: { message: 'boom' } }), () => ({ data: [], error: null })];

    const ribbon = await fetchUserJourneyRibbon('u1');

    expect(ribbon.stages.find((s) => s.id === 'submit')!.reached).toBeNull();
    expect(ribbon.degradedNote).toContain('round_submitted read failed');
  });

  it('always links to the existing semantic-thread page for this user rather than duplicating it', async () => {
    const ribbon = await fetchUserJourneyRibbon('u1');
    expect(ribbon.threadHref).toBe('/admin/thread/user/u1');
  });

  it('found is true for a real user', async () => {
    const ribbon = await fetchUserJourneyRibbon('u1');
    expect(ribbon.found).toBe(true);
  });

  it('found is false when no users row resolves for the id — the caller must not render a full ribbon of honest nulls as if it were a real, data-poor user', async () => {
    userDetail = { user: null, memberships: [], recentActivity: [], authEvents: [], errorEvents: [] };

    const ribbon = await fetchUserJourneyRibbon('does-not-exist');

    expect(ribbon.found).toBe(false);
  });
});
