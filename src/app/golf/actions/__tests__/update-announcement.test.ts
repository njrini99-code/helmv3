/**
 * Coverage for updateAnnouncement — the coach edit action (title/body/urgency/
 * requires_acknowledgement only; recipients, attachments, and tasks stay
 * fixed — see the note on updateAnnouncement in ../announcements.ts).
 *
 * Same withGolfAction-inside-withAdminObserved nesting as deleteAnnouncement
 * (see announcements-with-golf-action.test.ts), and the same F036/F037
 * any-staffed-coach authorization via validateCoachTeamAccess — these tests
 * mirror that file's shape for the new action.
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

import { updateAnnouncement } from '../announcements';

const VALID_INPUT = {
  title: 'Updated title',
  body: 'Updated body copy.',
  urgency: 'high' as const,
  requiresAcknowledgement: true,
};

function baseFake(): FakeSupabase {
  return createFakeSupabase({
    user: { id: 'coach-user' },
    tables: {
      golf_coaches: [{ id: 'coach-1', user_id: 'coach-user', organization_id: 'org-1' }],
      golf_announcements: [
        {
          id: 'ann-1',
          team_id: 'team-1',
          title: 'Original title',
          body: 'Original body.',
          urgency: 'normal',
          requires_acknowledgement: false,
        },
      ],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  validateCoachTeamAccess.mockResolvedValue(true);
  fake = baseFake();
});

describe('updateAnnouncement — auth and scope guards', () => {
  it('returns { success: true } and persists the new field values on a normal update', async () => {
    const result = await updateAnnouncement('ann-1', VALID_INPUT);
    expect(result).toEqual({ success: true });

    const row = (
      await fake.from('golf_announcements').select('*').eq('id', 'ann-1').single()
    ).data as Record<string, unknown> | null;
    expect(row).toMatchObject({
      title: 'Updated title',
      body: 'Updated body copy.',
      urgency: 'high',
      requires_acknowledgement: true,
    });
  });

  it('rejects when there is no authenticated user', async () => {
    fake = createFakeSupabase({
      user: null,
      tables: { golf_coaches: [], golf_announcements: [] },
    });
    const result = await updateAnnouncement('ann-1', VALID_INPUT);
    expect(result).toEqual({ success: false, error: 'Not authenticated' });
  });

  it('rejects when the authenticated user has no coach row', async () => {
    fake = createFakeSupabase({
      user: { id: 'coach-user' },
      tables: { golf_coaches: [], golf_announcements: [] },
    });
    const result = await updateAnnouncement('ann-1', VALID_INPUT);
    expect(result).toEqual({ success: false, error: 'Coach not found' });
  });

  it('rejects when the announcement does not exist', async () => {
    const result = await updateAnnouncement('does-not-exist', VALID_INPUT);
    expect(result).toEqual({ success: false, error: 'Announcement not found' });
  });

  it('rejects a coach not staffed on the announcement\'s team (F036/F037 scope check)', async () => {
    validateCoachTeamAccess.mockResolvedValue(false);
    const result = await updateAnnouncement('ann-1', VALID_INPUT);
    expect(result).toEqual({ success: false, error: 'Not authorized to edit this announcement' });

    // And the row is untouched.
    const row = (
      await fake.from('golf_announcements').select('*').eq('id', 'ann-1').single()
    ).data as Record<string, unknown> | null;
    expect(row).toMatchObject({ title: 'Original title' });
  });

  it('rejects an empty title with the zod validation message, before touching the row', async () => {
    const result = await updateAnnouncement('ann-1', { ...VALID_INPUT, title: '' });
    expect(result).toEqual({ success: false, error: 'Title is required' });

    const row = (
      await fake.from('golf_announcements').select('*').eq('id', 'ann-1').single()
    ).data as Record<string, unknown> | null;
    expect(row).toMatchObject({ title: 'Original title' });
  });

  it('returns the generic ActionResult shape for an unexpected exception', async () => {
    validateCoachTeamAccess.mockRejectedValue(new Error('unexpected: connection reset'));
    const result = await updateAnnouncement('ann-1', VALID_INPUT);
    expect(result).toEqual({ success: false, error: 'An unexpected error occurred. Please try again.' });
  });
});
