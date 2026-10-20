import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * approvePendingAssistantCoach / declinePendingAssistantCoach take a bare coach
 * id from the browser. Being in the head coach's program is not enough: the id
 * must be a still-pending request (not the head coach, onboarding not done, no
 * staff row anywhere). Otherwise approve rewrites a co-head coach's staff row
 * down to assistant_coach, and decline detaches any coach in the program.
 */

const ORG = 'org-1';
const TEAM = 'team-1';

const state: {
  candidate: { id: string; organization_id: string; onboarding_completed: boolean } | null;
  staffed: Array<{ coach_id: string }>;
} = { candidate: null, staffed: [] };
const writes: Array<{ table: string; op: string }> = [];

function chain(table: string) {
  const c: Record<string, unknown> = {
    select: () => c,
    eq: () => c,
    limit: async () => ({ data: table === 'golf_team_coach_staff' ? state.staffed : [], error: null }),
    maybeSingle: async () => ({ data: table === 'golf_coaches' ? state.candidate : null, error: null }),
    upsert: async () => (writes.push({ table, op: 'upsert' }), { error: null }),
    update: () => (writes.push({ table, op: 'update' }), { eq: async () => ({ error: null }) }),
  };
  return c;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'head-user' } }, error: null })) },
    from: (table: string) => {
      // requireHeadCoachOfTeam: the caller's own coach row, then their head_coach staff row.
      const c: Record<string, unknown> = {
        select: () => c,
        eq: () => c,
        maybeSingle: async () =>
          table === 'golf_coaches'
            ? { data: { id: 'head-coach', organization_id: ORG }, error: null }
            : { data: { id: 'staff-row' }, error: null },
      };
      return c;
    },
  })),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: chain }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
  logServerException: vi.fn(async () => undefined),
}));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_n: string, _m: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: vi.fn() }));
vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: vi.fn(() => ({ insert: async () => ({ error: null }) })),
}));

import { approvePendingAssistantCoach, declinePendingAssistantCoach } from '../teams';

describe('approve / decline only touch a still-pending request', () => {
  beforeEach(() => {
    writes.length = 0;
    state.candidate = { id: 'asst', organization_id: ORG, onboarding_completed: false };
    state.staffed = [];
  });

  it('approves a genuine pending request', async () => {
    const result = await approvePendingAssistantCoach('asst', TEAM);
    expect(result.success).toBe(true);
    expect(writes).toContainEqual({ table: 'golf_team_coach_staff', op: 'upsert' });
  });

  it('refuses to approve a coach who is already on staff (no downgrade)', async () => {
    state.staffed = [{ coach_id: 'asst' }];
    const result = await approvePendingAssistantCoach('asst', TEAM);
    expect(result.success).toBe(false);
    expect(writes).toEqual([]);
  });

  it('refuses to decline a coach who is already on staff (no detach)', async () => {
    state.staffed = [{ coach_id: 'asst' }];
    const result = await declinePendingAssistantCoach('asst', TEAM);
    expect(result.success).toBe(false);
    expect(writes).toEqual([]);
  });

  it('refuses to decline a coach whose onboarding is complete', async () => {
    state.candidate = { id: 'asst', organization_id: ORG, onboarding_completed: true };
    const result = await declinePendingAssistantCoach('asst', TEAM);
    expect(result.success).toBe(false);
    expect(writes).toEqual([]);
  });

  it('refuses the head coach acting on themselves', async () => {
    state.candidate = { id: 'head-coach', organization_id: ORG, onboarding_completed: false };
    const result = await declinePendingAssistantCoach('head-coach', TEAM);
    expect(result.success).toBe(false);
    expect(writes).toEqual([]);
  });

  it('refuses a coach from another program', async () => {
    state.candidate = { id: 'asst', organization_id: 'org-2', onboarding_completed: false };
    const result = await approvePendingAssistantCoach('asst', TEAM);
    expect(result.success).toBe(false);
    expect(writes).toEqual([]);
  });
});
