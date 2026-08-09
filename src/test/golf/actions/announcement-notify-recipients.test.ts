import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Creating a targeted announcement resolves who to notify — golf_players ->
 * user_id — and that read discarded its error.
 *
 * A failure left `playerRows` null, the `if (playerRows && playerRows.length)`
 * guard fell through, and the ENTIRE email + push block was skipped. The
 * announcement was created, so the coach saw success and reasonably believed
 * the players they targeted had been told.
 *
 * The comment immediately below this read already documents a PREVIOUS instance
 * of exactly this class in the same block — a coach-scoped read of public.users
 * returning [] and "silently starving BOTH the email loop and the push below,
 * which is why every row in golf_announcements has send_push = false". The read
 * one line above it still had the hole.
 *
 * Notification stays fire-and-forget: the announcement is real and visible
 * in-app either way, so this logs rather than failing the action. Only the
 * silence changes.
 */

const logServerError = vi.fn(async () => {});

vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock('@/lib/notifications', () => ({
  notifyTeamAnnouncement: vi.fn(async () => {}),
}));
vi.mock('@/lib/notifications/push', () => ({
  sendBulkPushNotification: vi.fn(async () => ({ sent: 1, failed: 0 })),
}));
vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1'),
}));
vi.mock('@/lib/golf/resolve-team', () => ({
  validateCoachTeamAccess: vi.fn(async () => true),
}));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const ok = (d: unknown): Outcome => ({ data: d, error: null });
const fails = (m: string, code = '08006'): Outcome => ({ data: null, error: { message: m, code } });

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok([]);
  const settleSingle = () => outcomes.get(`${table}:single`) ?? outcomes.get(table) ?? ok(null);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self, eq: self, in: self, is: self, order: self, limit: self,
    insert: self, update: self, delete: self,
    single: async () => settleSingle(),
    maybeSingle: async () => settleSingle(),
    then: (r: (v: Outcome) => unknown, j?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(r, j),
  });
  return node;
}

const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  from: (t: string) => tableChain(t),
  rpc: async () => ({ data: null, error: null }),
};
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));

const PLAYER_ID = '8c1b4e77-2d95-4a30-9f16-5b7e0c9a3d21';

async function create() {
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
  logServerError.mockClear();
  outcomes.clear();
  outcomes.set('golf_coaches:single', ok({ id: 'coach-1', organization_id: 'org-1', full_name: 'Coach' }));
  outcomes.set('golf_announcements:single', ok({ id: 'ann-1' }));
  // The targeted player must validate as on-team, or createEnrichedAnnouncement
  // refuses with "Some selected players are not on your team" long before the
  // notification block and the assertions below prove nothing.
  outcomes.set('golf_team_members', ok([{ player_id: PLAYER_ID, team_id: 'team-1', status: 'active' }]));
  outcomes.set('golf_players', ok([{ user_id: 'u-player' }]));
  outcomes.set('users', ok([{ id: 'u-player', email: 'p@example.com' }]));
});

describe('targeted announcement — a failed recipient read must not be silent', () => {
  it('records it when the player lookup fails and nobody is notified', async () => {
    outcomes.set('golf_players', fails('statement timeout', '57014'));

    await create();

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /recipient lookup failed/i.test(m))).toBe(true);
  });
});

describe('targeted announcement — the healthy path stays quiet', () => {
  it('logs no recipient failure when the lookup succeeds', async () => {
    await create();

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /recipient lookup failed/i.test(m))).toBe(false);
  });
});
