/**
 * C-22: a write that matches ZERO rows is not an error in PostgREST (an UPDATE or DELETE that RLS or a stale id
 * filters away resolves `{ data: [], error: null }`), so these three actions reported success while changing
 * nothing. Each now asks for the written rows back and fails on none.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase | Record<string, unknown>;

const { validateCoachTeamAccess } = vi.hoisted(() => ({
  validateCoachTeamAccess: vi.fn(async () => true),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));
vi.mock('@/lib/golf/resolve-team', () => ({ validateCoachTeamAccess }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));

import { completeAnnouncementTask, deleteAnnouncement, updateAnnouncement } from '../announcements';

/** A write that RLS filtered to nothing: no error, no rows. */
function filteredToNothing() {
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    eq: () => b,
    in: () => b,
    select: () => b,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
  });
  return b;
}

function coachWorld(): FakeSupabase {
  return createFakeSupabase({
    user: { id: 'coach-user' },
    tables: {
      golf_coaches: [{ id: 'coach-1', user_id: 'coach-user', organization_id: 'org-1' }],
      golf_announcements: [{ id: 'ann-1', team_id: 'team-1', title: 'T', body: 'B', urgency: 'normal', requires_acknowledgement: false }],
    },
  });
}

/** The same world, except RLS lets the coach read the announcement but write nothing to it. */
function coachWorldWhereWritesAreFilteredAway() {
  const real = coachWorld();
  return {
    ...real,
    from: (table: string) => {
      const builder = real.from(table);
      if (table !== 'golf_announcements') return builder;
      return { ...builder, update: () => filteredToNothing(), delete: () => filteredToNothing() };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  validateCoachTeamAccess.mockResolvedValue(true);
});

describe('completeAnnouncementTask (C-22)', () => {
  const world = (assignedTo: string) =>
    createFakeSupabase({
      user: { id: 'player-user' },
      tables: {
        golf_players: [{ id: 'player-1', user_id: 'player-user' }],
        golf_task_assignments: [{ id: 'a1', task_id: 'task-1', player_id: assignedTo, status: 'pending' }],
      },
    });

  it('completes the assignment that belongs to the caller', async () => {
    fake = world('player-1');
    expect(await completeAnnouncementTask('task-1')).toEqual({ success: true });
  });

  it('fails, rather than reporting success, when no assignment matched', async () => {
    fake = world('someone-else');
    const result = await completeAnnouncementTask('task-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/isn't assigned to you/);
  });
});

describe('deleteAnnouncement (C-22)', () => {
  it('deletes an announcement the coach can remove', async () => {
    fake = coachWorld();
    expect(await deleteAnnouncement('ann-1')).toEqual({ success: true });
  });

  it('fails when the delete removed no row', async () => {
    fake = coachWorldWhereWritesAreFilteredAway();
    const result = await deleteAnnouncement('ann-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Couldn't delete/);
  });
});

describe('updateAnnouncement (C-22)', () => {
  const input = { title: 'New', body: 'Body', urgency: 'normal' as const, requiresAcknowledgement: false };

  it('saves an announcement the coach can edit', async () => {
    fake = coachWorld();
    expect(await updateAnnouncement('ann-1', input)).toEqual({ success: true });
  });

  it('fails when the update changed no row', async () => {
    fake = coachWorldWhereWritesAreFilteredAway();
    const result = await updateAnnouncement('ann-1', input);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Couldn't save/);
  });
});
