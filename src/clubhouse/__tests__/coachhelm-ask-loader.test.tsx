import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

/**
 * Ask CoachHelm (P013): the server loader and the route that hands it to a coach and never to a player
 * (docs/clubhouse/catalog/coachhelm.md: CH-13221, 13222, 13223, 13224, 13320, 13321, 13322, 13420).
 */

const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const ctxState = vi.hoisted(() => ({ ctx: null as unknown, error: null as unknown, pulse: null as unknown }));
vi.mock('@/lib/coachhelm/v3/chat/request-cache', () => ({
  getCoachChatContext: () => (ctxState.error ? Promise.reject(ctxState.error) : Promise.resolve(ctxState.ctx)),
  getCoachProgramPulse: () => Promise.resolve(ctxState.pulse),
}));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: () => Promise.resolve(session.current) }));
const teamOf = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: () => Promise.resolve(teamOf.current) }));
const askSpy = vi.hoisted(() => vi.fn());
vi.mock('../data/coachhelm-chat', () => ({ loadAskCoachHelm: askSpy }));
const gateSpy = vi.hoisted(() => vi.fn());
vi.mock('../data/coachhelm', () => ({
  loadCoachCoachHelm: vi.fn(() => Promise.resolve({ board: 'coach' })),
  loadPlayerCoachHelm: vi.fn(() => Promise.resolve({ board: 'player' })),
  loadCoachHelmGate: gateSpy,
  emptyCoachHelm: (off: unknown) => ({ board: 'off', off }),
}));
vi.mock('../screens/coachhelm/CoachBoard', () => ({ CoachBoard: () => null }));
vi.mock('../screens/coachhelm/PlayerBoard', () => ({ PlayerBoard: () => null }));
vi.mock('../screens/coachhelm/chat/Ask', () => ({ Ask: () => null }));

import { ClubhouseCoachHelmRoute } from '../routes/coachhelm';
import { AskSkeleton } from '../screens/coachhelm/chat/AskSkeleton';
import { loadCoachCoachHelm, loadPlayerCoachHelm } from '../data/coachhelm';

const { loadAskCoachHelm: load } = await vi.importActual<typeof import('../data/coachhelm-chat')>('../data/coachhelm-chat');

const ROSTER = [
  { id: 'p1', name: 'Jonah Okafor', first_name: 'Jonah', last_name: 'Okafor', graduation_year: 2027 },
  { id: 'p2', name: 'Eli Brandt', first_name: 'Eli', last_name: 'Brandt', graduation_year: 2028 },
];
const ctx = (over: Record<string, unknown> = {}) => ({ coach_id: 'c1', user_id: 'u1', team_id: 't1', team_name: 'Finley University', timezone: 'America/New_York', roster: ROSTER, ...over });
const pulse = (over: Record<string, unknown> = {}) => ({
  items: [{ id: 'rsvp-1', headline: '2 players have not responded for Hilltop', evidence: 'Sat 8:00 AM · 6 of 8 responded', tone: 'attention', weight: 85, action: { label: 'Open calendar', href: '/golf/dashboard/calendar' }, ask: 'Send an RSVP reminder for Hilltop' }],
  latest_round_at: '2026-09-29T15:00:00Z',
  players_without_rounds: 0,
  players_with_recent_rounds: 4,
  recent_window_days: 30,
  active_roster: 4,
  as_of: '2026-09-30T18:05:00.000Z',
  ...over,
});
const CONV = '4f6f3b0e-3c5f-4a36-9d4a-0a6d1f2f9e11';

beforeEach(() => {
  logServer.mockReset();
  askSpy.mockReset();
  vi.mocked(loadCoachCoachHelm).mockClear();
  vi.mocked(loadPlayerCoachHelm).mockClear();
  gateSpy.mockReset();
  gateSpy.mockResolvedValue({ status: 'on' });
  ctxState.ctx = ctx();
  ctxState.error = null;
  ctxState.pulse = pulse();
  tables.current = {
    golf_coachhelm_chat_conversations: (filters) => {
      const byId = filters.find(([k]) => k === 'eq');
      if (byId) return { data: byId[1][1] === CONV ? { id: CONV, title: 'Putting inside 6 feet' } : null };
      return {
        data: [
          { id: CONV, title: 'Putting inside 6 feet', updated_at: '2026-09-30T17:30:00Z' },
          { id: 'c2', title: null, updated_at: '2026-09-20T17:30:00Z' },
        ],
      };
    },
    golf_coachhelm_chat_messages: {
      data: [
        { id: 'm1', conversation_id: CONV, role: 'user', content: 'Why are we missing short putts?', tool_calls: null, tool_results: null, cost_usd: null, created_at: '2026-09-30T17:29:00Z', client_turn_id: 'k1', status: null, ui_parts: null },
        { id: 'm2', conversation_id: CONV, role: 'assistant', content: 'Mostly downhill.', tool_calls: null, tool_results: null, cost_usd: 0.02, created_at: '2026-09-30T17:29:10Z', client_turn_id: 'k1', status: 'complete', ui_parts: null },
      ],
    },
  };
});

describe('loadAskCoachHelm', () => {
  it('CH-13221 a chat context that does not load is its own result (failed), logged, and never a thrown page', async () => {
    ctxState.error = new Error('No active team for this coach');
    expect(await load()).toEqual({ status: 'failed' });
    expect(logServer).toHaveBeenCalledWith('coachhelm.ask', 'context', expect.any(Error), 'coachhelm');
  });

  it('CH-13321 an empty roster is the first-run page, with the team name and no chat', async () => {
    ctxState.ctx = ctx({ roster: [] });
    expect(await load()).toEqual({ status: 'noRoster', teamName: 'Finley University' });
  });

  it('reads the team, the roster (id and name only), the openers, the findings, the coverage line, the as-of time in the team zone and the chats', async () => {
    const res = await load();
    expect(res.status).toBe('ready');
    if (res.status !== 'ready') return;
    const d = res.data;
    expect(d.teamName).toBe('Finley University');
    expect(d.players).toEqual([
      { id: 'p1', name: 'Jonah Okafor' },
      { id: 'p2', name: 'Eli Brandt' },
    ]);
    expect(d.suggestions.map((s) => s.id)).toEqual(['brief', 'strokes', 'trending', 'week']);
    expect(d.pulse?.findings).toEqual([
      {
        id: 'rsvp-1',
        category: 'Schedule',
        headline: '2 players have not responded for Hilltop',
        evidence: 'Sat 8:00 AM · 6 of 8 responded',
        tone: 'attention',
        ask: 'Send an RSVP reminder for Hilltop',
        link: { label: 'Open calendar', href: '/golf/dashboard/calendar' },
      },
    ]);
    expect(d.pulse?.coverage).toBe('All 4 players have a round in the last 30 days.');
    expect(d.pulse?.asOfLabel?.replace(/\s/g, ' ')).toBe('2:05 PM');
    expect(d.conversations).toEqual({
      list: [
        { id: CONV, title: 'Putting inside 6 feet', updatedAt: '2026-09-30T17:30:00Z' },
        { id: 'c2', title: 'Untitled chat', updatedAt: '2026-09-20T17:30:00Z' },
      ],
      error: false,
    });
    expect(d.thread).toBeNull();
    expect(d.notFound).toBe(false);
    expect(d.threadFailed).toBe(false);
  });

  it('CH-13322 players and no recorded round between them is noRounds, with no strokes or trending opener', async () => {
    ctxState.pulse = pulse({ items: [], players_without_rounds: 4, players_with_recent_rounds: 0, active_roster: 4 });
    const res = await load();
    if (res.status !== 'ready') throw new Error('not ready');
    expect(res.data.noRounds).toBe(true);
    expect(res.data.suggestions.map((s) => s.id)).toEqual(['week']);
    expect(res.data.pulse?.coverage).toBe('No player has a recorded round yet.');
  });

  it('CH-13223 a pulse that does not load is pulse: null (the chat still works), never an empty list of findings', async () => {
    ctxState.pulse = null;
    const res = await load();
    if (res.status !== 'ready') throw new Error('not ready');
    expect(res.data.pulse).toBeNull();
    expect(res.data.noRounds).toBe(false);
    expect(res.data.suggestions.map((s) => s.id)).toEqual(['week']);
  });

  it('a finding whose screen is not rebuilt keeps its text and loses its link', async () => {
    ctxState.pulse = pulse({ items: [{ id: 'tasks-overdue', headline: '2 tasks are overdue', evidence: 'e', tone: 'attention', weight: 1, action: { label: 'Open tasks', href: '/golf/dashboard/tasks' } }] });
    const res = await load();
    if (res.status !== 'ready') throw new Error('not ready');
    expect(res.data.pulse?.findings[0]).toMatchObject({ headline: '2 tasks are overdue', link: null });
  });

  it('CH-13222 a chat list that does not read is its own flag with an empty list, logged, and never "no chats yet"', async () => {
    tables.current.golf_coachhelm_chat_conversations = { error: { message: 'boom' } };
    const res = await load();
    if (res.status !== 'ready') throw new Error('not ready');
    expect(res.data.conversations).toEqual({ list: [], error: true });
    expect(logServer).toHaveBeenCalledWith('coachhelm.ask', 'conversations', expect.anything(), 'coachhelm');
  });

  it('opens the requested conversation: its title and its restored messages', async () => {
    const res = await load({ conversationId: CONV });
    if (res.status !== 'ready') throw new Error('not ready');
    expect(res.data.notFound).toBe(false);
    expect(res.data.thread?.id).toBe(CONV);
    expect(res.data.thread?.title).toBe('Putting inside 6 feet');
    expect(res.data.thread?.messages.map((m) => [m.role, (m.parts[0] as { text?: string }).text])).toEqual([
      ['user', 'Why are we missing short putts?'],
      ['assistant', 'Mostly downhill.'],
    ]);
  });

  it('CH-13320 a conversation that is gone or not the coach\'s (row-level security hides it) is notFound, and a value that is not an id never reaches the database', async () => {
    const gone = await load({ conversationId: '11111111-1111-4111-8111-111111111111' });
    if (gone.status !== 'ready') throw new Error('not ready');
    expect(gone.data.notFound).toBe(true);
    expect(gone.data.thread).toBeNull();

    const seen: string[] = [];
    tables.current.golf_coachhelm_chat_conversations = (filters) => {
      seen.push(filters.map(([k]) => k).join(','));
      return { data: [] };
    };
    const junk = await load({ conversationId: 'not-an-id' });
    if (junk.status !== 'ready') throw new Error('not ready');
    expect(junk.data.notFound).toBe(true);
    expect(seen.every((s) => !s.includes('eq'))).toBe(true);
  });

  it('CH-13224 a conversation whose read fails, or whose messages fail, is threadFailed and never an empty thread', async () => {
    const orig = tables.current.golf_coachhelm_chat_conversations;
    tables.current.golf_coachhelm_chat_conversations = (filters) => (filters.some(([k]) => k === 'eq') ? { error: { message: 'boom' } } : (orig as (f: typeof filters) => { data?: unknown })(filters));
    const a = await load({ conversationId: CONV });
    if (a.status !== 'ready') throw new Error('not ready');
    expect(a.data.threadFailed).toBe(true);
    expect(a.data.thread).toBeNull();
    expect(a.data.notFound).toBe(false);

    tables.current.golf_coachhelm_chat_conversations = orig!;
    tables.current.golf_coachhelm_chat_messages = { error: { message: 'boom' } };
    const b = await load({ conversationId: CONV });
    if (b.status !== 'ready') throw new Error('not ready');
    expect(b.data.threadFailed).toBe(true);
    expect(b.data.thread).toBeNull();
  });
});

describe('ClubhouseCoachHelmRoute: the Ask sub-tab is the coach\'s alone', () => {
  const coach = { coach: { id: 'c1', organization_id: 'o1' }, player: null };
  const player = { coach: null, player: { id: 'pl1' } };

  it('a coach on ?view=ask gets the Ask inside a Suspense boundary with the Ask skeleton, and the loader gets ?c=', async () => {
    session.current = coach;
    teamOf.current = { role: 'coach', teamId: 't1', coachId: 'c1' };
    askSpy.mockResolvedValue({ status: 'failed' });
    const el = (await ClubhouseCoachHelmRoute({ view: 'ask', c: 'abc' })) as ReactElement<{ fallback: ReactElement; children: ReactElement<{ conversationId?: string }> }>;
    expect(el.props.fallback.type).toBe(AskSkeleton);
    const child = el.props.children;
    expect(child.props.conversationId).toBe('abc');
    const out = (await (child.type as (p: unknown) => Promise<ReactElement<{ load: unknown }>>)(child.props)) as ReactElement<{ load: unknown }>;
    expect(askSpy).toHaveBeenCalledWith({ conversationId: 'abc' });
    expect(out.props.load).toEqual({ status: 'failed' });
    expect(loadCoachCoachHelm).not.toHaveBeenCalled();
    // CH13-20: Ask is read only once CoachHelm is on for this coach.
    expect(gateSpy).toHaveBeenCalledWith('c1');
  });

  it('a coach without ?view=ask still gets the board, and a coach with no team gets the no-team page before any chat read', async () => {
    session.current = coach;
    teamOf.current = { role: 'coach', teamId: 't1', coachId: 'c1' };
    await ClubhouseCoachHelmRoute({});
    expect(loadCoachCoachHelm).toHaveBeenCalled();
    expect(askSpy).not.toHaveBeenCalled();
    teamOf.current = null;
    const el = (await ClubhouseCoachHelmRoute({ view: 'ask' })) as ReactElement;
    expect(el.type).toBe('main');
    expect(askSpy).not.toHaveBeenCalled();
  });

  it('a player on ?view=ask gets their own board: the chat loader is never called, so no other player\'s stats are read', async () => {
    session.current = player;
    teamOf.current = { role: 'player', teamId: 't1', playerId: 'pl1' };
    const el = (await ClubhouseCoachHelmRoute({ view: 'ask', c: CONV })) as ReactElement<{ data: unknown }>;
    expect(loadPlayerCoachHelm).toHaveBeenCalledWith({ playerId: 'pl1' });
    expect(el.props.data).toEqual({ board: 'player' });
    expect(askSpy).not.toHaveBeenCalled();
  });
});
