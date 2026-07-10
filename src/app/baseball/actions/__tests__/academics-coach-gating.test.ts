// =============================================================================
// Regression test: updatePlayerClass / deletePlayerClass must be reachable by
// the coach who actually calls them from the UI (ClassScheduleModal).
//
// THE BUG: assertOwnPlayerClass gated ONLY on
// `existing.player_id !== ctx.activePlayerId`. The Academics page is
// coach-only (requireAcademicsCoachRoute), and a coach's resolved active
// context always has activePlayerId: null (active-context.ts loadMemberships
// coach branch), so for EVERY coach on EVERY class `existing.player_id !==
// null` was unconditionally true — updatePlayerClass/deletePlayerClass always
// threw BaseballUnauthorizedError, mapped to {success:false, error:
// 'Unauthorized'}. Only addPlayerClass (gated by the separate
// assertPlayerClassAccess) ever worked.
//
// THE FIX: assertOwnPlayerClass now mirrors assertPlayerClassAccess — a coach
// with can_view_academics acting on a player who is on the coach's active
// team is a valid actor, in addition to the player-owns-their-own-class path.
// These tests lock both the previously-broken coach path and the still-valid
// rejections (no capability; player not on the coach's team).
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;
let capabilityGranted = true;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: vi.fn(async () => ({
    userId: 'user-1',
    activeTeamId: 'team-1',
    activeRole: 'coach' as const,
    activeCoachId: 'coach-1',
    activePlayerId: null,
    fellBackFromStale: false,
  })),
}));

vi.mock('@/lib/baseball/capabilities', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/baseball/capabilities')>();
  return {
    ...actual,
    requireBaseballCapability: vi.fn(async () => {
      if (!capabilityGranted) {
        throw new actual.BaseballCapabilityError('can_view_academics', 'team-1');
      }
    }),
  };
});

vi.mock('@/lib/demo/baseball-config.server', () => ({
  isCurrentSessionBaseballDemo: vi.fn(async () => false),
  isBaseballDemoCoachEmail: vi.fn(() => false),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerException: vi.fn(async () => undefined),
  logServerError: vi.fn(async () => undefined),
}));

vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => unknown) =>
    fn({ setTag: vi.fn(), addBreadcrumb: vi.fn(), setUser: vi.fn() }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { updatePlayerClass, deletePlayerClass } from '@/app/baseball/actions/academics';

function seed(overrides?: { teamMembers?: Array<{ team_id: string; player_id: string }> }) {
  fake = createFakeSupabase({
    user: { id: 'user-1', email: 'coach@example.edu' },
    tables: {
      baseball_player_classes: [
        { id: 'class-1', player_id: 'player-1', class_name: 'Biology 101' },
      ],
      baseball_team_members: overrides?.teamMembers ?? [
        { id: 'member-1', team_id: 'team-1', player_id: 'player-1' },
      ],
    },
  });
}

beforeEach(() => {
  capabilityGranted = true;
  seed();
});

describe('assertOwnPlayerClass — coach path (repair round)', () => {
  it('updatePlayerClass succeeds for a coach with can_view_academics whose player is on the active team', async () => {
    const result = await updatePlayerClass('class-1', { class_name: 'Chemistry 201' });
    expect(result.success).toBe(true);

    const { data } = await fake
      .from('baseball_player_classes')
      .select('*')
      .eq('id', 'class-1')
      .single();
    expect((data as { class_name: string }).class_name).toBe('Chemistry 201');
  });

  it('deletePlayerClass succeeds for a coach with can_view_academics whose player is on the active team', async () => {
    const result = await deletePlayerClass('class-1');
    expect(result.success).toBe(true);

    const { data } = await fake.from('baseball_player_classes').select('*').eq('id', 'class-1');
    expect(data).toHaveLength(0);
  });

  it('updatePlayerClass still rejects when the class player is NOT on the coach\'s active team', async () => {
    seed({ teamMembers: [] });
    const result = await updatePlayerClass('class-1', { class_name: 'Chemistry 201' });
    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('updatePlayerClass still rejects a coach who lacks can_view_academics', async () => {
    capabilityGranted = false;
    const result = await updatePlayerClass('class-1', { class_name: 'Chemistry 201' });
    expect(result.success).toBe(false);
  });
});
