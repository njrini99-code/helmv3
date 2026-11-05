import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A retry after a lost response: the same coach posting the same title and body to the same team within two minutes gets the
 * post that landed back. No second row and no second notice to every player.
 */

const spies = vi.hoisted(() => ({
  notify: vi.fn(async () => {}),
  push: vi.fn(async () => ({ sent: 1, failed: 0 })),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock('@/lib/notifications', () => ({ notifyTeamAnnouncement: spies.notify }));
vi.mock('@/lib/notifications/push', () => ({ sendBulkPushNotification: spies.push }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1') }));
vi.mock('@/lib/golf/resolve-team', () => ({ validateCoachTeamAccess: vi.fn(async () => true) }));

type Outcome = { data: unknown; error: unknown };
const PLAYER_ID = '8c1b4e77-2d95-4a30-9f16-5b7e0c9a3d21';
const ok = (data: unknown): Outcome => ({ data, error: null });

type Recent = { id: string; body: string; urgency: string; requires_acknowledgement: boolean };
let recent: Recent[] | null = null;
let recipientRows: Array<{ player_id: string }> = [];
let duplicateFilters: Array<[string, unknown]> = [];
let inserted: string[] = [];

function chain(table: string) {
  const settle = (): Outcome => {
    if (table === 'golf_announcement_recipients') return ok(recipientRows);
    if (table === 'golf_team_members') return ok([{ player_id: PLAYER_ID, team_id: 'team-1', status: 'active' }]);
    if (table === 'golf_players') return ok([{ user_id: 'u-player' }]);
    if (table === 'users') return ok([{ id: 'u-player', email: 'p@example.com' }]);
    return ok([]);
  };
  const single = (): Outcome => (table === 'golf_coaches' ? ok({ id: 'coach-1', organization_id: 'org-1', full_name: 'Coach' }) : table === 'golf_announcements' ? ok({ id: 'ann-new' }) : ok(null));
  const node: Record<string, unknown> = {};
  const self = () => node;
  const filters: Array<[string, unknown]> = [];
  Object.assign(node, {
    select: self,
    in: self,
    is: self,
    order: self,
    limit: self,
    update: self,
    delete: self,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return node;
    },
    gte: () => {
      duplicateFilters = filters;
      return { limit: async () => ok(recent ?? []) };
    },
    insert: () => {
      inserted.push(table);
      return node;
    },
    single: async () => single(),
    maybeSingle: async () => single(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  from: (table: string) => chain(table),
  rpc: async () => ({ data: null, error: null }),
};

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));

async function post() {
  const mod = await import('@/app/golf/actions/announcements');
  return mod.createEnrichedAnnouncement({
    title: 'Bus leaves at 6',
    body: 'Be early.',
    urgency: 'normal',
    requiresAcknowledgement: false,
    recipientPlayerIds: [PLAYER_ID],
    documentIds: [],
    inlineTasks: [],
  } as never);
}

beforeEach(() => {
  recent = null;
  recipientRows = [{ player_id: PLAYER_ID }];
  duplicateFilters = [];
  inserted = [];
  spies.notify.mockClear();
  spies.push.mockClear();
});

describe('createEnrichedAnnouncement · the duplicate check', () => {
  it('returns the post that landed, inserts nothing and notifies nobody', async () => {
    recent = [{ id: 'ann-earlier', body: 'Be early.', urgency: 'normal', requires_acknowledgement: false }];
    const result = await post();
    expect(result).toEqual({ success: true, data: { announcementId: 'ann-earlier' } });
    expect(inserted).toEqual([]);
    expect(spies.notify).not.toHaveBeenCalled();
    expect(spies.push).not.toHaveBeenCalled();
  });

  it('looks only at this coach, this team and this exact post', async () => {
    recent = [{ id: 'ann-earlier', body: 'Be early.', urgency: 'normal', requires_acknowledgement: false }];
    await post();
    expect(Object.fromEntries(duplicateFilters)).toEqual({ team_id: 'team-1', created_by: 'coach-1', title: 'Bus leaves at 6' });
  });

  it('inserts when the same title has a different body', async () => {
    recent = [{ id: 'ann-earlier', body: 'Something else.', urgency: 'normal', requires_acknowledgement: false }];
    const result = await post();
    expect(result).toMatchObject({ success: true, data: { announcementId: 'ann-new' } });
    expect(inserted).toContain('golf_announcements');
  });

  it('inserts when the same words go to different players', async () => {
    recent = [{ id: 'ann-earlier', body: 'Be early.', urgency: 'normal', requires_acknowledgement: false }];
    recipientRows = [{ player_id: 'someone-else' }];
    const result = await post();
    expect(result).toMatchObject({ success: true, data: { announcementId: 'ann-new' } });
    expect(inserted).toContain('golf_announcements');
  });

  it('inserts when nothing recent matches', async () => {
    const result = await post();
    expect(result).toMatchObject({ success: true, data: { announcementId: 'ann-new' } });
    expect(inserted).toContain('golf_announcements');
  });
});
