import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `push_announcements` is read by the push gate (src/lib/notifications/push.ts)
 * and shown as a switch in Settings, so saving it must persist and reading it
 * must default it on, like the delivery default in src/lib/notifications/types.ts.
 */
const update = vi.fn();
let stored: Record<string, unknown> | null = null;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { notification_preferences: stored }, error: null }) }) }),
      update: (row: unknown) => {
        update(row);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

import { getNotificationPreferences, updateNotificationPreferences } from '@/app/actions/notification-preferences';

describe('push_announcements preference', () => {
  beforeEach(() => {
    update.mockReset();
    stored = null;
  });

  it('persists when saved', async () => {
    const r = await updateNotificationPreferences({ push_announcements: false } as never);
    expect(r.success).toBe(true);
    expect(update).toHaveBeenCalledWith({ notification_preferences: { push_announcements: false } });
  });

  it('defaults on when never set, matching delivery', async () => {
    const r = await getNotificationPreferences();
    expect((r.data as Record<string, unknown>).push_announcements).toBe(true);
  });
});
