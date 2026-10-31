import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The minute release job: authenticated, quiet while the migrations are held, and honest when the run throws. The flag gates only new
 * holds: with class_awareness_v1 off the job still runs, so a push held before the flag went off is never stranded.
 */

const flag = vi.hoisted(() => ({ on: true }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => flag.on }));
vi.mock('@/lib/admin/job-log', () => ({ recordJobRun: async (_job: string, fn: () => Promise<unknown>) => fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
const release = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('@/lib/notifications/class-hold', () => ({ runClassHoldRelease: release.run }));
vi.mock('@/lib/notifications/push', () => ({ sendPushNotificationDirect: vi.fn(), shouldSendPush: vi.fn() }));

import { GET } from '../route';

const call = (token?: string) => GET(new NextRequest('https://helm.test/api/cron/class-holds-release', { headers: token ? { authorization: `Bearer ${token}` } : {} }));

beforeEach(() => {
  process.env.CRON_SECRET = 'sekret';
  flag.on = true;
  release.run.mockReset();
});

describe('GET /api/cron/class-holds-release', () => {
  it('refuses an unauthenticated caller before doing anything', async () => {
    expect((await call()).status).toBe(401);
    expect((await call('wrong')).status).toBe(401);
    expect(release.run).not.toHaveBeenCalled();
  });

  it('with the flag off it still releases what is held, and says the flag is off', async () => {
    flag.on = false;
    release.run.mockResolvedValue({ moved: 0, expired: 0, overdue: 0, tally: { users: 1, rows: 2 }, safetyNet: 0, unavailable: false });
    const res = await call('sekret');
    expect(res.status).toBe(200);
    expect(release.run).toHaveBeenCalledTimes(1);
    // A drain: no heartbeat, so the database never reads holding as live while the app holds nothing.
    expect(release.run.mock.calls[0]![3]).toEqual({ beat: false });
    expect(await res.json()).toMatchObject({ success: true, flag: 'off', tally: { users: 1, rows: 2 } });
  });

  it('with the flag off and the migrations held, it stays quiet', async () => {
    flag.on = false;
    release.run.mockResolvedValue({ unavailable: true });
    expect(await (await call('sekret')).json()).toEqual({ success: true, skipped: 'not_applied' });
  });

  it('with the flag on it beats as usual, and the summary carries no flag marker', async () => {
    release.run.mockResolvedValue({ moved: 0, expired: 0, overdue: 0, tally: { users: 0 }, safetyNet: 0, unavailable: false });
    expect(await (await call('sekret')).json()).not.toHaveProperty('flag');
    expect(release.run.mock.calls[0]![3]).toEqual({ beat: true });
  });

  it('answers 200 and "not applied" while the held migrations are missing', async () => {
    release.run.mockResolvedValue({ unavailable: true });
    const res = await call('sekret');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, skipped: 'not_applied' });
  });

  it('returns the run summary', async () => {
    release.run.mockResolvedValue({ moved: 1, expired: 0, overdue: 0, tally: { users: 2 }, safetyNet: 0, unavailable: false });
    const body = await (await call('sekret')).json();
    expect(body).toMatchObject({ success: true, moved: 1, tally: { users: 2 } });
  });

  it('a throw is a 500, never a silent success', async () => {
    release.run.mockRejectedValue(new Error('boom'));
    const res = await call('sekret');
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });
});
