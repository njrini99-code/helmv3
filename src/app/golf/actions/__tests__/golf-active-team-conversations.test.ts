import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * getGolfActiveTeamConversationIds — the messages-rail active-team scoping.
 *
 * Contract under test:
 *  - Returns `null` (NO scoping) for: unauthenticated, players, and coaches
 *    staffed on 0 or 1 team. This is the exact no-op guarantee — single-team
 *    coaches and players must be completely unaffected.
 *  - Returns the active team's participant-conversation ids for a coach
 *    staffed on >1 team (head OR assistant — gated on team COUNT, not canSwitch).
 *  - Fail-open: returns `null` when the active team can't be resolved or on any
 *    unexpected error, so the rail is never blanked.
 */

// ── Chainable Supabase mock (per-table seeded results; awaitable + maybeSingle) ──
const tableResults = new Map<string, { data: unknown }>();
const mockGetUser = vi.fn();

function makeChain(table: string) {
  const result = () => tableResults.get(table) ?? { data: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => result());
  // Awaitable: `await supabase.from(t).select().eq()...` resolves to result().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chain.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(result()).then(onFulfilled, onRejected);
  return chain;
}

const supabaseMock = {
  auth: { getUser: mockGetUser },
  from: vi.fn((t: string) => makeChain(t)),
};
let throwOnCreateClient = false;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => {
    if (throwOnCreateClient) throw new Error('boom');
    return supabaseMock;
  }),
}));

const mockResolve = vi.fn();
const mockCtx = vi.fn();
vi.mock('@/lib/golf/resolve-team-server', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolveCoachTeamIdWithCookie: (...args: any[]) => mockResolve(...args),
}));
vi.mock('@/lib/golf/resolve-team', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getCoachTeamSwitchContext: (...args: any[]) => mockCtx(...args),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));

import { getGolfActiveTeamConversationIds } from '@/app/actions/messages';

function seedCoach() {
  tableResults.set('golf_coaches', { data: { id: 'coach1', organization_id: 'org1' } });
}

describe('getGolfActiveTeamConversationIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableResults.clear();
    throwOnCreateClient = false;
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  it('returns null for an unauthenticated request', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect(await getGolfActiveTeamConversationIds()).toBeNull();
  });

  it('returns null for a player (no golf_coaches row) — players are never scoped', async () => {
    tableResults.set('golf_coaches', { data: null });
    expect(await getGolfActiveTeamConversationIds()).toBeNull();
    expect(mockCtx).not.toHaveBeenCalled();
  });

  it('returns null for a single-team coach — exact no-op', async () => {
    seedCoach();
    mockCtx.mockResolvedValue({ teams: [{ id: 'A' }], isHeadCoach: true, canSwitch: false });
    expect(await getGolfActiveTeamConversationIds()).toBeNull();
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('returns null for a zero-team coach', async () => {
    seedCoach();
    mockCtx.mockResolvedValue({ teams: [], isHeadCoach: false, canSwitch: false });
    expect(await getGolfActiveTeamConversationIds()).toBeNull();
  });

  it('returns null (fail-open) when the active team cannot be resolved', async () => {
    seedCoach();
    mockCtx.mockResolvedValue({ teams: [{ id: 'A' }, { id: 'B' }], isHeadCoach: true, canSwitch: true });
    mockResolve.mockResolvedValue(null);
    expect(await getGolfActiveTeamConversationIds()).toBeNull();
  });

  it('returns [] when a multi-team coach has no participant conversations', async () => {
    seedCoach();
    mockCtx.mockResolvedValue({ teams: [{ id: 'A' }, { id: 'B' }], isHeadCoach: true, canSwitch: true });
    mockResolve.mockResolvedValue('A');
    tableResults.set('golf_conversation_participants', { data: [] });
    expect(await getGolfActiveTeamConversationIds()).toEqual([]);
  });

  it('returns the active team\'s conversation ids for a multi-team HEAD coach', async () => {
    seedCoach();
    mockCtx.mockResolvedValue({ teams: [{ id: 'A' }, { id: 'B' }], isHeadCoach: true, canSwitch: true });
    mockResolve.mockResolvedValue('A');
    tableResults.set('golf_conversation_participants', {
      data: [{ conversation_id: 'c1' }, { conversation_id: 'c2' }, { conversation_id: 'c3' }],
    });
    // golf_conversations filtered by team_id='A' ∩ participant ids → c1, c3.
    tableResults.set('golf_conversations', { data: [{ id: 'c1' }, { id: 'c3' }] });
    expect(await getGolfActiveTeamConversationIds()).toEqual(['c1', 'c3']);
  });

  it('scopes a multi-team ASSISTANT too (gate is team count, not canSwitch)', async () => {
    seedCoach();
    // Assistant: >1 team but NOT head_coach → canSwitch false, still scoped.
    mockCtx.mockResolvedValue({ teams: [{ id: 'A' }, { id: 'B' }], isHeadCoach: false, canSwitch: false });
    mockResolve.mockResolvedValue('B');
    tableResults.set('golf_conversation_participants', {
      data: [{ conversation_id: 'c1' }, { conversation_id: 'c2' }],
    });
    tableResults.set('golf_conversations', { data: [{ id: 'c2' }] });
    expect(await getGolfActiveTeamConversationIds()).toEqual(['c2']);
  });

  it('returns null (fail-open) on an unexpected error', async () => {
    throwOnCreateClient = true;
    expect(await getGolfActiveTeamConversationIds()).toBeNull();
  });
});
