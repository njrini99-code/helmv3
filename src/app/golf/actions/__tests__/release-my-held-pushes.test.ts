import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Deliver now: the signed-in player's own held pushes, released through the same path the minute job uses. class_awareness_v1 gates only
 * new holds, so Deliver now works with it off too: a push held before the flag went off is never stranded.
 */

const flag = vi.hoisted(() => ({ on: true }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => flag.on }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: unknown, _m: unknown, fn: unknown) => fn }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
const session = vi.hoisted(() => ({ user: { id: 'player-user' } as { id: string } | null, rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: session.user } }) }, rpc: session.rpc }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ admin: true }) }));
const release = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('@/lib/notifications/class-hold', () => ({ releaseHeldForUser: release.run }));
vi.mock('@/lib/notifications/push', () => ({ sendPushNotificationDirect: vi.fn(), shouldSendPush: vi.fn() }));

import { releaseMyHeldPushes } from '../class-status';

beforeEach(() => {
  flag.on = true;
  session.user = { id: 'player-user' };
  session.rpc.mockReset().mockResolvedValue({ error: null });
  release.run.mockReset().mockResolvedValue({ rows: 3 });
});

describe('releaseMyHeldPushes', () => {
  it('makes the rows due as the signed-in user, then releases that user (never due-only) with the admin client', async () => {
    const r = await releaseMyHeldPushes();
    expect(r).toEqual({ success: true, data: { released: 3 } });
    expect(session.rpc).toHaveBeenCalledWith('golf_push_holds_release_mine');
    expect(release.run).toHaveBeenCalledWith({ admin: true }, 'player-user', expect.objectContaining({ dueOnly: false, push: expect.anything() }));
  });

  it('with the flag off it still delivers what was held before the flag went off', async () => {
    flag.on = false;
    expect(await releaseMyHeldPushes()).toEqual({ success: true, data: { released: 3 } });
    expect(session.rpc).toHaveBeenCalledWith('golf_push_holds_release_mine');
    expect(release.run).toHaveBeenCalledWith({ admin: true }, 'player-user', expect.objectContaining({ dueOnly: false }));
  });

  it('does nothing for a signed-out caller, flag on or off', async () => {
    session.user = null;
    for (const on of [true, false]) {
      flag.on = on;
      expect((await releaseMyHeldPushes()).success).toBe(false);
    }
    expect(session.rpc).not.toHaveBeenCalled();
    expect(release.run).not.toHaveBeenCalled();
  });

  it('reads a missing function (the migration is held) as nothing held', async () => {
    session.rpc.mockResolvedValue({ error: { code: 'PGRST202', message: 'missing' } });
    expect(await releaseMyHeldPushes()).toEqual({ success: true, data: { released: 0 } });
    expect(release.run).not.toHaveBeenCalled();
  });

  it('says so when the database refuses', async () => {
    session.rpc.mockResolvedValue({ error: { code: '42501', message: 'denied' } });
    const r = await releaseMyHeldPushes();
    expect(r.success).toBe(false);
    expect(release.run).not.toHaveBeenCalled();
  });
});
