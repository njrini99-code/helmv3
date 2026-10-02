import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

/**
 * C-22. In PostgREST an UPDATE or DELETE that matches ZERO rows (a policy hides the row, the id is stale, someone else
 * got there first) raises no error: `{ data: [], error: null }`. These writes treated "no error" as "done", so the
 * player or coach was told it worked while nothing changed. Each now asks for the written rows back and fails on none.
 */

let fake: unknown;
/** Tables whose UPDATE/DELETE answers "no row matched" (what an RLS filter looks like from here). */
const filtered = new Set<string>();

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fake) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/notifications', () => ({
  notifyTaskAssigned: vi.fn(async () => {}),
  notifyTeamAnnouncement: vi.fn(async () => {}),
}));

type Row = Record<string, unknown>;

function nothingMatched() {
  const n: Record<string, unknown> = {};
  Object.assign(n, {
    eq: () => n,
    in: () => n,
    select: () => n,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
  });
  return n;
}

function install(userId: string, tables: Record<string, Row[]>) {
  const real = createFakeSupabase({ user: { id: userId }, tables });
  fake = {
    ...real,
    from: (table: string) => {
      const b = real.from(table);
      return filtered.has(table) ? { ...b, update: () => nothingMatched(), delete: () => nothingMatched() } : b;
    },
  };
  return tables;
}

beforeEach(() => {
  vi.clearAllMocks();
  filtered.clear();
});

describe('completeTask (C-22)', () => {
  const world = () =>
    install('user-1', {
      golf_players: [{ id: 'player-1', user_id: 'user-1' }],
      golf_tasks: [{ id: 'task-1', team_id: 'team-1', status: 'pending' }],
      golf_task_assignments: [{ id: 'a1', task_id: 'task-1', player_id: 'player-1', status: 'pending' }],
    });

  it('marks the player\'s assignment done', async () => {
    const tables = world();
    const { completeTask } = await import('@/app/golf/actions/tasks');
    expect(await completeTask('task-1')).toEqual({ success: true });
    expect(tables.golf_task_assignments![0]!.status).toBe('completed');
  });

  it('fails, rather than reporting done, when the assignment update matched no row', async () => {
    const tables = world();
    filtered.add('golf_task_assignments');
    const { completeTask } = await import('@/app/golf/actions/tasks');

    const result = await completeTask('task-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Couldn't mark this task done/);
    expect(tables.golf_task_assignments![0]!.status).toBe('pending');
  });
});

describe('detachDocumentFromEvent (C-22)', () => {
  const world = () =>
    install('coach-user', {
      golf_event_documents: [{ event_id: 'ev-1', document_id: 'doc-1' }],
    });

  it('detaches an attached document', async () => {
    const tables = world();
    const { detachDocumentFromEvent } = await import('@/app/golf/actions/event-documents');
    expect(await detachDocumentFromEvent('ev-1', 'doc-1')).toEqual({ success: true });
    expect(tables.golf_event_documents).toEqual([]);
  });

  it('fails when nothing was detached (not attached, or a policy hid the row)', async () => {
    const tables = world();
    const { detachDocumentFromEvent } = await import('@/app/golf/actions/event-documents');

    const stale = await detachDocumentFromEvent('ev-1', 'doc-other');
    expect(stale.success).toBe(false);
    expect(stale.error).toMatch(/isn't attached|can't change/);

    filtered.add('golf_event_documents');
    const hidden = await detachDocumentFromEvent('ev-1', 'doc-1');
    expect(hidden.success).toBe(false);
    expect(tables.golf_event_documents).toHaveLength(1);
  });
});

describe('updateNotificationPreferences (C-22)', () => {
  const world = (stored: Row | null) =>
    install('user-1', { users: [{ id: 'user-1', notification_preferences: stored }] });

  it('saves a preference and keeps the ones already stored', async () => {
    const tables = world({ email_messages: false, push_events: true });
    const { updateNotificationPreferences } = await import('@/app/actions/notification-preferences');

    expect(await updateNotificationPreferences({ push_announcements: false })).toEqual({ success: true });
    expect(tables.users![0]!.notification_preferences).toEqual({ email_messages: false, push_events: true, push_announcements: false });
  });

  it('fails when the update matched no users row (an orphaned auth user), instead of reporting saved', async () => {
    install('orphan-user', { users: [] });
    const { updateNotificationPreferences } = await import('@/app/actions/notification-preferences');

    const result = await updateNotificationPreferences({ push_announcements: false });

    expect(result).toEqual({ success: false, error: 'Failed to update notification preferences' });
  });

  it('fails when a policy filters the update to nothing', async () => {
    world({ email_messages: false });
    filtered.add('users');
    const { updateNotificationPreferences } = await import('@/app/actions/notification-preferences');
    expect((await updateNotificationPreferences({ push_events: true })).success).toBe(false);
  });

  it('does not overwrite every other saved preference when the read that feeds the merge fails', async () => {
    const tables = world({ email_messages: false, push_events: true });
    const real = fake as { from: (t: string) => Record<string, unknown> };
    fake = {
      ...(fake as object),
      from: (table: string) => {
        const b = real.from(table);
        if (table !== 'users') return b;
        return {
          ...b,
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: '57014', message: 'timeout' } }) }) }),
        };
      },
    };
    const { updateNotificationPreferences } = await import('@/app/actions/notification-preferences');

    const result = await updateNotificationPreferences({ push_announcements: false });

    expect(result.success).toBe(false);
    // Merging onto {} after a failed read would have replaced the stored object with just the one switch.
    expect(tables.users![0]!.notification_preferences).toEqual({ email_messages: false, push_events: true });
  });
});
