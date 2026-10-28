/**
 * @vitest-environment node
 *
 * P009. confirmSelection writes the travel brief into the PRIMARY coach's
 * CoachHelm "Qualifying Updates" chat (W32). chat_conversations_coach_only /
 * chat_messages_coach_only admit only coach_id = current_coach_id(), so when
 * an ASSISTANT confirmed, their session was refused and the brief was only
 * logged. The confirm action now hands the service a service-role client for
 * the brief, after getAuthedCoachContext has verified the caller staffs the
 * qualifier's team.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';
import type { QualifyingWorkspace } from '@/lib/coachhelm/v3/qualifying/types';

type Sb = SupabaseClient<Database>;
type Row = Record<string, unknown>;

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/coachhelm/v3/qualifying/loader', () => ({ loadQualifyingWorkspace: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/qualifying/player-notify', () => ({
  notifyPlayersOfSelectionOutcome: vi.fn(async () => {}),
}));

import { loadQualifyingWorkspace } from '@/lib/coachhelm/v3/qualifying/loader';
import { confirmSelection } from '@/lib/coachhelm/v3/qualifying/service';
import { logServerError } from '@/lib/server-error-logger';

const WORKSPACE: QualifyingWorkspace = {
  qualifier_id: 'q1',
  team_id: 't1',
  name: 'Spring Qualifier',
  start_date: '2026-05-20',
  end_date: '2026-05-22',
  status: 'in_progress',
  selection_state: 'closed',
  selection_slots_total: 1,
  selection_slots_coach_pick: 0,
  target_tournament_id: null,
  coach_picks_complete: true,
  candidates: [
    {
      player_id: 'p1',
      player_first_name: 'Alice',
      player_last_name: 'Smith',
      rounds_completed: 2,
      total_score: 140,
      total_to_par: -4,
      leaderboard_rank: 1,
      selection: null,
      is_top_score_slot: true,
    },
  ],
};

/** The assistant's session: may write the selection, may not touch another coach's chat or see the primary's staff row. */
function assistantSession(): { sb: Sb; chatWrites: string[] } {
  const chatWrites: string[] = [];
  const real = createFakeSupabase({
    user: { id: 'assistant-user' },
    tables: {
      golf_qualifier_selections: [],
      golf_qualifiers: [{ id: 'q1', team_id: 't1', selection_state: 'closed' }],
      golf_team_coach_staff: [],
      golf_coachhelm_chat_conversations: [],
      golf_coachhelm_chat_messages: [],
    },
  });
  const refused = { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
  const sb = {
    ...real,
    from: (table: string) => {
      const b = real.from(table);
      if (table !== 'golf_coachhelm_chat_conversations' && table !== 'golf_coachhelm_chat_messages') return b;
      const refuse = () => {
        chatWrites.push(table);
        const n: Record<string, unknown> = {};
        Object.assign(n, {
          select: () => n,
          single: async () => refused,
          then: (resolve: (v: unknown) => unknown) => Promise.resolve(refused).then(resolve),
        });
        return n;
      };
      return { ...b, insert: refuse, upsert: refuse, update: refuse };
    },
  } as unknown as Sb;
  return { sb, chatWrites };
}

function serviceRole(): { sb: Sb; tables: Record<string, Row[]> } {
  const tables: Record<string, Row[]> = {
    golf_team_coach_staff: [
      { id: 's-primary', team_id: 't1', coach_id: 'coach-primary', is_primary: true },
      { id: 's-assistant', team_id: 't1', coach_id: 'coach-assistant', is_primary: false },
    ],
    golf_coachhelm_chat_conversations: [],
    golf_coachhelm_chat_messages: [],
  };
  return { sb: createFakeSupabase({ tables }) as unknown as Sb, tables };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadQualifyingWorkspace).mockResolvedValue(WORKSPACE);
});

describe('confirmSelection travel brief when an assistant confirms (P009)', () => {
  it('writes the brief into the primary coach’s Qualifying Updates chat through the brief client', async () => {
    const session = assistantSession();
    const admin = serviceRole();

    const result = await confirmSelection(
      session.sb,
      { qualifier_id: 'q1', user_id: 'assistant-user' },
      { briefClient: () => admin.sb },
    );

    expect(result).toEqual({ ok: true, data: { notified: true } });
    expect(admin.tables.golf_coachhelm_chat_conversations).toHaveLength(1);
    expect(admin.tables.golf_coachhelm_chat_conversations![0]).toMatchObject({
      coach_id: 'coach-primary',
      title: 'Qualifying Updates',
    });
    expect(admin.tables.golf_coachhelm_chat_messages).toHaveLength(1);
    expect(admin.tables.golf_coachhelm_chat_messages![0]).toMatchObject({
      conversation_id: admin.tables.golf_coachhelm_chat_conversations![0]!.id,
      role: 'assistant',
    });
    expect(String(admin.tables.golf_coachhelm_chat_messages![0]!.content)).toContain('Spring Qualifier');
    // The assistant's own session never tried the coach-only chat tables.
    expect(session.chatWrites).toEqual([]);
  });

  it('without a brief client the assistant’s session is refused, and the confirm still commits', async () => {
    const session = assistantSession();
    const result = await confirmSelection(session.sb, { qualifier_id: 'q1', user_id: 'assistant-user' });
    expect(result.ok).toBe(true);
  });

  it('a brief client that cannot be created is logged and never fails the confirm', async () => {
    const session = assistantSession();
    const result = await confirmSelection(
      session.sb,
      { qualifier_id: 'q1', user_id: 'assistant-user' },
      {
        briefClient: () => {
          throw new Error('Missing SUPABASE_SECRET_KEY');
        },
      },
    );
    expect(result.ok).toBe(true);
    expect(vi.mocked(logServerError)).toHaveBeenCalledWith(
      expect.stringContaining('travel-brief push failed for qualifier q1'),
      expect.objectContaining({ action: 'v3.qualifying.confirmSelection.travelBrief' }),
    );
  });
});

describe('confirmQualifierSelection wires the service-role brief client (P009)', () => {
  it('passes a brief client built from createAdminClient, only after the team check passed', async () => {
    vi.resetModules();
    const adminSentinel = { admin: true };
    const confirm = vi.fn(async () => ({ ok: true, data: { notified: true } }));
    const team = { allowed: true };
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: vi.fn(async () =>
        createFakeSupabase({ user: { id: 'assistant-user' }, tables: { golf_qualifiers: [{ id: 'q1', team_id: 't1' }] } }),
      ),
    }));
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => adminSentinel) }));
    vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
    vi.doMock('@/lib/admin/observed-action', () => ({
      withAdminObserved: <T,>(_n: string, _o: unknown, action: T) => action,
    }));
    vi.doMock('@/lib/auth/verify-player-access', () => ({
      verifyTeamAccess: vi.fn(async () => team),
      verifyPlayersOnTeam: vi.fn(async () => ({ ok: true })),
    }));
    vi.doMock('@/lib/coachhelm/v3/qualifying/service', () => ({
      transitionSelectionState: vi.fn(),
      setCoachPick: vi.fn(),
      removeCoachPick: vi.fn(),
      confirmSelection: confirm,
      chooseTiePlace: vi.fn(),
    }));

    const { confirmQualifierSelection } = await import('@/app/golf/actions/v3/qualifying');
    const { verifyTeamAccess } = await import('@/lib/auth/verify-player-access');

    expect(await confirmQualifierSelection('q1')).toEqual({ ok: true, notified: true });
    expect(verifyTeamAccess).toHaveBeenCalledWith('t1', 'assistant-user', expect.anything());
    const call = confirm.mock.calls[0] as unknown as [unknown, unknown, { briefClient: () => unknown }];
    // No order from the caller (Fairway's workspace): the plain standings order.
    expect(call[1]).toEqual({ qualifier_id: 'q1', user_id: 'assistant-user', order: 'score' });
    expect(call[2].briefClient()).toBe(adminSentinel);

    // Clubhouse passes the board's order; anything else a client sends is read as the plain order.
    confirm.mockClear();
    await confirmQualifierSelection('q1', 'board');
    expect((confirm.mock.calls[0] as unknown as [unknown, { order: string }])[1].order).toBe('board');
    confirm.mockClear();
    await confirmQualifierSelection('q1', 'nonsense' as never);
    expect((confirm.mock.calls[0] as unknown as [unknown, { order: string }])[1].order).toBe('score');

    // Refused at the team check: the service (and so the admin brief) is never reached.
    team.allowed = false;
    confirm.mockClear();
    expect(await confirmQualifierSelection('q1')).toEqual({ ok: false, error: 'Not a coach of this team' });
    expect(confirm).not.toHaveBeenCalled();
  });
});
