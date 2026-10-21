/**
 * recordCoachHelmCorrection (Slice 6a): flag-off and missing-table paths,
 * input validation, who may correct what, and the row that is written.
 * Synthetic ids only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const INSIGHT = '3f2b8c1e-5a6d-4e7f-9a0b-1c2d3e4f5a6b';
const USER = 'user-1';
const PLAYER = 'player-1';
const TEAM = 'team-1';
const OTHER_TEAM = 'team-2';
const ROUND = 'round-1';

interface Calls {
  table: string;
  op: 'select' | 'insert';
  filters: Record<string, unknown>;
  payload?: unknown;
}

const state = vi.hoisted(() => ({
  flagOn: true,
  user: { id: 'user-1' } as { id: string } | null,
  insight: { id: 'x', player_id: 'player-1', team_id: 'team-1' } as Record<string, unknown> | null,
  insightError: null as { code: string } | null,
  coach: null as { id: string } | null,
  staffTeams: [] as string[],
  memberTeams: ['team-1'] as string[],
  playerRow: null as { id: string } | null,
  membersError: null as { code: string } | null,
  insertResult: { data: { id: 'corr-1' }, error: null } as {
    data: { id: string } | null;
    error: { code?: string; message?: string } | null;
  },
  inserts: [] as Array<{ table: string; payload: unknown }>,
  tablesTouched: [] as string[],
  logServerError: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock('@/lib/flags/is-enabled', () => ({
  isFlagEnabled: (id: string) => id === 'coachhelm_corrections_v1' && state.flagOn,
}));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_n: unknown, _m: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: state.logServerError }));

function respond(calls: Calls): { data: unknown; error: unknown } {
  switch (calls.table) {
    case 'golf_coach_insights':
      return { data: state.insight, error: state.insightError };
    case 'golf_coaches':
      return { data: state.coach, error: null };
    case 'golf_team_coach_staff':
      return { data: state.staffTeams.map((team_id) => ({ team_id })), error: null };
    case 'golf_team_members':
      return state.membersError
        ? { data: null, error: state.membersError }
        : { data: state.memberTeams.map((team_id) => ({ team_id })), error: null };
    case 'golf_players':
      return { data: state.playerRow, error: null };
    case 'golf_rounds':
      return { data: { id: ROUND }, error: null };
    case 'golf_coachhelm_corrections':
      return state.insertResult;
    default:
      throw new Error(`unexpected table ${calls.table}`);
  }
}

function builder(table: string) {
  state.tablesTouched.push(table);
  const calls: Calls = { table, op: 'select', filters: {} };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: () => b,
    eq: (k: string, v: unknown) => {
      calls.filters[k] = v;
      return b;
    },
    order: () => b,
    limit: () => b,
    insert: (payload: unknown) => {
      calls.op = 'insert';
      calls.payload = payload;
      state.inserts.push({ table, payload });
      return b;
    },
    maybeSingle: async () => respond(calls),
    single: async () => respond(calls),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(respond(calls)).then(res, rej),
  };
  return b;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => builder(table),
  }),
}));

import { recordCoachHelmCorrection } from '../coachhelm-corrections';

function asCoach() {
  state.coach = { id: 'coach-1' };
  state.staffTeams = [TEAM];
}

beforeEach(() => {
  state.flagOn = true;
  state.user = { id: USER };
  state.insight = { id: INSIGHT, player_id: PLAYER, team_id: TEAM };
  state.insightError = null;
  state.coach = null;
  state.staffTeams = [];
  state.memberTeams = [TEAM];
  state.playerRow = null;
  state.membersError = null;
  state.insertResult = { data: { id: 'corr-1' }, error: null };
  state.inserts = [];
  state.tablesTouched = [];
  state.logServerError.mockClear();
});

describe('recordCoachHelmCorrection: flag and table', () => {
  it('flag off: not available, touches nothing', async () => {
    state.flagOn = false;
    asCoach();
    await expect(recordCoachHelmCorrection({ insightId: INSIGHT, kind: 'not_this' })).resolves.toEqual({
      status: 'not_available',
      reason: 'flag_off',
    });
    expect(state.tablesTouched).toEqual([]);
  });

  it.each(['42P01', 'PGRST205'])('missing table (%s): not available, no throw, no log', async (code) => {
    asCoach();
    state.insertResult = { data: null, error: { code, message: 'relation does not exist' } };
    await expect(recordCoachHelmCorrection({ insightId: INSIGHT, kind: 'confirm' })).resolves.toEqual({
      status: 'not_available',
      reason: 'table_missing',
    });
    expect(state.logServerError).not.toHaveBeenCalled();
  });

  it('any other insert error: failed, logged with logServerError', async () => {
    asCoach();
    state.insertResult = { data: null, error: { code: '23514', message: 'check violation' } };
    const result = await recordCoachHelmCorrection({ insightId: INSIGHT, kind: 'confirm' });
    expect(result).toEqual({ status: 'failed', error: 'Could not save the correction.' });
    expect(state.logServerError).toHaveBeenCalledTimes(1);
  });
});

describe('recordCoachHelmCorrection: HELM_COACHHELM_TEAMS canary', () => {
  afterEach(() => {
    delete process.env.HELM_COACHHELM_TEAMS;
  });

  it('a coach of a listed team: recorded (the flag is read in the player’s team scope)', async () => {
    process.env.HELM_COACHHELM_TEAMS = TEAM;
    asCoach();
    const result = await recordCoachHelmCorrection({ insightId: INSIGHT, kind: 'not_this' });
    expect(result).toEqual({ status: 'recorded', id: 'corr-1' });
  });

  it('a player on no listed team: flag off, nothing written', async () => {
    process.env.HELM_COACHHELM_TEAMS = OTHER_TEAM;
    asCoach();
    const result = await recordCoachHelmCorrection({ insightId: INSIGHT, kind: 'not_this' });
    expect(result).toEqual({ status: 'not_available', reason: 'flag_off' });
    expect(state.inserts).toEqual([]);
  });

  it('the global flag off: flag off before any read', async () => {
    process.env.HELM_COACHHELM_TEAMS = TEAM;
    state.flagOn = false;
    asCoach();
    await expect(recordCoachHelmCorrection({ insightId: INSIGHT, kind: 'not_this' })).resolves.toEqual({
      status: 'not_available',
      reason: 'flag_off',
    });
    expect(state.tablesTouched).toEqual([]);
  });
});

describe('recordCoachHelmCorrection: validation', () => {
  it.each([
    [{ insightId: 'not-a-uuid', kind: 'not_this' }],
    [{ insightId: INSIGHT, kind: 'maybe' }],
    [{ insightId: INSIGHT, kind: 'confirm', reason: 'wrong' }],
    [{ insightId: INSIGHT, kind: 'not_this', reason: 'meh' }],
    [{ insightId: INSIGHT, kind: 'not_this', alternativeCauseLabel: 'Pace' }],
    [{ insightId: INSIGHT, kind: 'wrong_cause', alternativeCauseLabel: 'x'.repeat(121) }],
    [{ insightId: INSIGHT, kind: 'confirm', freeText: 'x'.repeat(501) }],
    [{ insightId: INSIGHT, kind: 'confirm', playerId: PLAYER }],
  ])('rejects %j before any read', async (input) => {
    asCoach();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await recordCoachHelmCorrection(input as any);
    expect(result.status).toBe('invalid');
    expect(state.tablesTouched).toEqual([]);
  });
});

describe('recordCoachHelmCorrection: who may correct', () => {
  it('signed out: forbidden', async () => {
    state.user = null;
    const result = await recordCoachHelmCorrection({ insightId: INSIGHT, kind: 'not_this' });
    expect(result).toEqual({ status: 'forbidden', error: 'Not authenticated' });
  });

  it('a read the caller cannot see: forbidden', async () => {
    asCoach();
    state.insight = null;
    const result = await recordCoachHelmCorrection({ insightId: INSIGHT, kind: 'not_this' });
    expect(result.status).toBe('forbidden');
    expect(state.inserts).toEqual([]);
  });

  it('a coach of another team: forbidden', async () => {
    state.coach = { id: 'coach-1' };
    state.staffTeams = [OTHER_TEAM];
    const result = await recordCoachHelmCorrection({ insightId: INSIGHT, kind: 'not_this' });
    expect(result.status).toBe('forbidden');
    expect(state.inserts).toEqual([]);
  });

  it('a coach of the player’s team: writes the row with the author from the session', async () => {
    asCoach();
    const result = await recordCoachHelmCorrection({
      insightId: INSIGHT,
      kind: 'not_this',
      reason: 'wrong',
      freeText: '  He has been working on this.  ',
    });
    expect(result).toEqual({ status: 'recorded', id: 'corr-1' });
    expect(state.inserts).toEqual([
      {
        table: 'golf_coachhelm_corrections',
        payload: {
          insight_id: INSIGHT,
          player_id: PLAYER,
          team_id: TEAM,
          author_user_id: USER,
          author_role: 'coach',
          kind: 'not_this',
          reason: 'wrong',
          alternative_cause_label: null,
          free_text: 'He has been working on this.',
          checkpoint_round_id: ROUND,
        },
      },
    ]);
  });

  it('a coach whose team differs from the insight’s team_id uses the shared team', async () => {
    state.coach = { id: 'coach-1' };
    state.staffTeams = [OTHER_TEAM];
    state.memberTeams = [TEAM, OTHER_TEAM];
    await recordCoachHelmCorrection({ insightId: INSIGHT, kind: 'wrong_cause', alternativeCauseLabel: 'Pace' });
    expect(state.inserts[0]?.payload).toMatchObject({
      team_id: OTHER_TEAM,
      kind: 'wrong_cause',
      alternative_cause_label: 'Pace',
    });
  });

  it('the player on their own read: may say Not this and Good read', async () => {
    state.playerRow = { id: PLAYER };
    const result = await recordCoachHelmCorrection({ insightId: INSIGHT, kind: 'confirm' });
    expect(result.status).toBe('recorded');
    expect(state.inserts[0]?.payload).toMatchObject({ author_role: 'player', team_id: TEAM });
  });

  it('the player on a read tagged with a team they left: team_id null (RLS binds it)', async () => {
    state.playerRow = { id: PLAYER };
    state.memberTeams = ['team-9'];
    const result = await recordCoachHelmCorrection({ insightId: INSIGHT, kind: 'not_this' });
    expect(result.status).toBe('recorded');
    expect(state.inserts[0]?.payload).toMatchObject({ author_role: 'player', team_id: null });
  });

  it('a team lookup error: failed and logged, nothing written', async () => {
    state.playerRow = { id: PLAYER };
    state.membersError = { code: '57014' };
    const result = await recordCoachHelmCorrection({ insightId: INSIGHT, kind: 'not_this' });
    expect(result.status).toBe('failed');
    expect(state.logServerError).toHaveBeenCalledTimes(1);
    expect(state.inserts).toEqual([]);
  });

  it.each(['wrong_cause', 'already_on_it', 'snooze'] as const)(
    'the player may not record %s',
    async (kind) => {
      state.playerRow = { id: PLAYER };
      const result = await recordCoachHelmCorrection({ insightId: INSIGHT, kind });
      expect(result).toEqual({ status: 'forbidden', error: 'Only coaches can make this correction.' });
      expect(state.inserts).toEqual([]);
    },
  );

  it('another player: forbidden', async () => {
    state.playerRow = { id: 'player-2' };
    const result = await recordCoachHelmCorrection({ insightId: INSIGHT, kind: 'not_this' });
    expect(result.status).toBe('forbidden');
  });

  it('an insight lookup error: failed and logged, nothing written', async () => {
    asCoach();
    state.insightError = { code: '57014' };
    const result = await recordCoachHelmCorrection({ insightId: INSIGHT, kind: 'not_this' });
    expect(result.status).toBe('failed');
    expect(state.logServerError).toHaveBeenCalledTimes(1);
    expect(state.inserts).toEqual([]);
  });
});
