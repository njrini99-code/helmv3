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

// A real UUID — fetchUserJourneyRibbon now gates its param with isUuid()
// before any query, so a non-UUID string like the old 'u1' fixture would
// short-circuit to found:false before reaching any of the mocked tables.
const USER_ID = '11111111-1111-1111-1111-111111111111';

function emptyDetail(): UserDetail {
  return {
    user: { id: USER_ID, email: 'nick@example.com', role: 'player', createdAt: null, lastSeen: null, sports: ['golf'] },
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
    // Dedicated existence check (admin.from('users')) — default: the user
    // exists. A DIFFERENT table from admin_events, so this does not consume
    // from the admin_events queue below.
    perTable['users'] = [() => ({ data: { id: USER_ID }, error: null })];
    perTable['admin_events'] = [() => ({ data: [], error: null }), () => ({ data: [], error: null })];
  });

  it('never leaks email or name into the returned ribbon — only the opaque subject id', async () => {
    const ribbon = await fetchUserJourneyRibbon(USER_ID);

    expect(ribbon.subjectRef).toBe(USER_ID);
    expect(JSON.stringify(ribbon)).not.toContain('nick@example.com');
  });

  it('a user with no captured events leaves every stage null, never fabricates "reached"', async () => {
    const ribbon = await fetchUserJourneyRibbon(USER_ID);

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

    const ribbon = await fetchUserJourneyRibbon(USER_ID);

    expect(ribbon.stages.find((s) => s.id === 'login')!.reached).toBe(true);
    expect(ribbon.stages.find((s) => s.id === 'start_round')!.reached).toBe(true);
    expect(ribbon.stages.find((s) => s.id === 'submit')!.reached).toBe(true);
    expect(ribbon.stages.find((s) => s.id === 'coachhelm')!.reached).toBe(false);
    expect(ribbon.stages.find((s) => s.id === 'autosave')!.reached).toBeNull();
  });

  it('blind source: a failed round_submitted read leaves that stage null and is disclosed', async () => {
    perTable['admin_events'] = [() => ({ error: { message: 'boom' } }), () => ({ data: [], error: null })];

    const ribbon = await fetchUserJourneyRibbon(USER_ID);

    expect(ribbon.stages.find((s) => s.id === 'submit')!.reached).toBeNull();
    expect(ribbon.degradedNote).toContain('round_submitted read failed');
  });

  it('always links to the existing semantic-thread page for this user rather than duplicating it', async () => {
    const ribbon = await fetchUserJourneyRibbon(USER_ID);
    expect(ribbon.threadHref).toBe(`/admin/thread/user/${USER_ID}`);
  });

  it('found is true for a real user', async () => {
    const ribbon = await fetchUserJourneyRibbon(USER_ID);
    expect(ribbon.found).toBe(true);
  });

  it('found is false when the dedicated existence check succeeds with no row — a confirmed absence', async () => {
    perTable['users'] = [() => ({ data: null, error: null })];
    // fetchUserDetail disagreeing (or not) must not matter here — `found`
    // is authoritative and independent of it.
    userDetail = { user: null, memberships: [], recentActivity: [], authEvents: [], errorEvents: [] };

    const ribbon = await fetchUserJourneyRibbon(USER_ID);

    expect(ribbon.found).toBe(false);
    expect(ribbon.stages).toEqual([]);
  });

  it('found is false for a malformed (non-UUID) id, gated before any query reaches the database', async () => {
    perTable['users'] = [() => ({ data: { id: 'should-never-be-read' }, error: null })];

    const ribbon = await fetchUserJourneyRibbon('not-a-real-uuid');

    expect(ribbon.found).toBe(false);
    expect(ribbon.stages).toEqual([]);
    expect(ribbon.degradedNote).toBeNull();
  });

  it('found is null (not false) when the existence check itself fails — unknown is not the same as confirmed absent', async () => {
    perTable['users'] = [() => ({ error: { message: 'connection reset' } })];

    const ribbon = await fetchUserJourneyRibbon(USER_ID);

    expect(ribbon.found).toBeNull();
    expect(ribbon.stages).toEqual([]);
    expect(ribbon.degradedNote).toContain('user existence check failed');
    expect(ribbon.degradedNote).toContain('connection reset');
  });
});
