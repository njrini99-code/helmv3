/**
 * F-0003 (audit 2026-10-29, S0): a message to one person landed in the Team Channel. createConversation reused ANY
 * conversation the two users shared (`limit(1)`, no team, kind or member-count filter), so a player's "To: Coach" came
 * back as the channel they both sit in, and the typed message was sent there.
 *
 * A direct conversation is reused only when it is on this team, is neither the team channel nor a team chat, and has
 * exactly two members; the newest such wins. Anything else creates a new one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fake) }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/golf/conversation-audience', () => ({ assertGolfConversationAudience: vi.fn(async () => undefined) }));

import { createConversation } from '../messages';

const ME = 'user-player';
const COACH = 'user-coach';
const TEAM = 'team-1';
const OTHER_TEAM = 'team-2';

type Conv = { id: string; team_id: string; is_team_channel?: boolean | null; is_team_chat?: boolean | null; updated_at: string; members: string[] };

function seed(convs: Conv[]) {
  fake = createFakeSupabase({
    user: { id: ME },
    tables: {
      golf_conversations: convs.map(({ members: _members, ...c }) => ({ created_by: COACH, ...c })),
      golf_conversation_participants: convs.flatMap((c) => c.members.map((user_id) => ({ conversation_id: c.id, user_id, hidden_at: null }))),
    },
  });
}

async function create() {
  return createConversation({ participantUserIds: [COACH], sport: 'golf', teamId: TEAM });
}

async function conversationCount() {
  const { data } = await fake.from('golf_conversations').select('id');
  return (data ?? []).length;
}

const six = [ME, COACH, 'u3', 'u4', 'u5', 'u6'];

describe('createConversation: one person', () => {
  beforeEach(() => vi.clearAllMocks());

  it('never returns the Team Channel or a group the two share: it creates a direct thread', async () => {
    seed([
      { id: 'channel', team_id: TEAM, is_team_channel: true, is_team_chat: true, updated_at: '2026-10-29T12:00:00Z', members: six },
      { id: 'group', team_id: TEAM, is_team_chat: true, updated_at: '2026-10-29T11:00:00Z', members: [ME, COACH, 'u3'] },
    ]);
    const res = await create();
    expect(res.conversationId).not.toBe('channel');
    expect(res.conversationId).not.toBe('group');
    expect(res).toMatchObject({ reused: false });
    expect(await conversationCount()).toBe(3);
  });

  it('never returns a two-person team channel (a team of one player)', async () => {
    seed([{ id: 'channel', team_id: TEAM, is_team_channel: true, updated_at: '2026-10-29T12:00:00Z', members: [ME, COACH] }]);
    const res = await create();
    expect(res.conversationId).not.toBe('channel');
    expect(await conversationCount()).toBe(2);
  });

  it('a direct thread on another team is not reused', async () => {
    seed([{ id: 'dm-other-team', team_id: OTHER_TEAM, updated_at: '2026-10-29T12:00:00Z', members: [ME, COACH] }]);
    const res = await create();
    expect(res.conversationId).not.toBe('dm-other-team');
    expect(await conversationCount()).toBe(2);
  });

  it('the direct thread on this team is reused, the newest when there are two', async () => {
    seed([
      { id: 'channel', team_id: TEAM, is_team_channel: true, updated_at: '2026-10-29T13:00:00Z', members: six },
      { id: 'dm-old', team_id: TEAM, is_team_channel: false, is_team_chat: false, updated_at: '2026-10-01T12:00:00Z', members: [ME, COACH] },
      { id: 'dm-new', team_id: TEAM, is_team_channel: null, is_team_chat: null, updated_at: '2026-10-28T12:00:00Z', members: [ME, COACH] },
    ]);
    const res = await create();
    expect(res).toEqual({ conversationId: 'dm-new', reused: true });
    expect(await conversationCount()).toBe(3);
  });
});
