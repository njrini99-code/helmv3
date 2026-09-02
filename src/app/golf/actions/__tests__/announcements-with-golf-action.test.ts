/**
 * Coverage for the withGolfAction retrofit on deleteAnnouncement.
 *
 * withGolfAction is nested INSIDE the existing withAdminObserved wrapper
 * (see the comment on golfActionDeleteAnnouncement in ../announcements.ts):
 * withAdminObserved still owns the demoSafe gate; withGolfAction now owns
 * the classify -> RLS-denial-capture -> log sequence for the returned
 * ActionResult envelope, with `observeSoftFailures: false` on the outer
 * wrapper so a failure is recorded once, not twice.
 *
 * deleteAnnouncementImpl keeps its own top-level try/catch (unchanged) —
 * these tests pin that nothing about the nesting changes the normal
 * success/known-failure/unexpected-exception return shapes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

const { validateCoachTeamAccess } = vi.hoisted(() => ({
  validateCoachTeamAccess: vi.fn(async () => true),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/golf/resolve-team', () => ({
  validateCoachTeamAccess,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));

import { deleteAnnouncement } from '../announcements';

function baseFake(): FakeSupabase {
  return createFakeSupabase({
    user: { id: 'coach-user' },
    tables: {
      golf_coaches: [{ id: 'coach-1', user_id: 'coach-user', organization_id: 'org-1' }],
      golf_announcements: [{ id: 'ann-1', team_id: 'team-1' }],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  validateCoachTeamAccess.mockResolvedValue(true);
  fake = baseFake();
});

describe('deleteAnnouncement — withGolfAction nesting', () => {
  it('still returns { success: true } on a normal delete (unaffected by the new wrapper)', async () => {
    const result = await deleteAnnouncement('ann-1');
    expect(result).toEqual({ success: true });
  });

  it('still returns the known-failure envelope unchanged when the caller is not authorized', async () => {
    validateCoachTeamAccess.mockResolvedValue(false);
    const result = await deleteAnnouncement('ann-1');
    expect(result).toEqual({ success: false, error: 'Not authorized to delete this announcement' });
  });

  it('still returns the generic ActionResult shape for an unexpected exception, via the impl\'s own catch (withGolfAction is a no-op here since the impl never lets it through)', async () => {
    validateCoachTeamAccess.mockRejectedValue(new Error('unexpected: connection reset'));
    const result = await deleteAnnouncement('ann-1');
    expect(result).toEqual({ success: false, error: 'An unexpected error occurred. Please try again.' });
  });
});
