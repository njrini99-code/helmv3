import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const P1 = '00000000-0000-0000-0000-0000000000a1';
const P2 = '00000000-0000-0000-0000-0000000000a2';
const RE = '00000000-0000-0000-0000-0000000000b1';
const TID = '00000000-0000-0000-0000-0000000000c1';

type Err = { code: string; message: string } | null;
const state = vi.hoisted(() => ({
  on: true,
  role: 'coach' as 'coach' | 'player',
  playerSession: { id: '00000000-0000-0000-0000-0000000000a1' },
  existing: null as null | { round_id: string | null; entered_total: number | null },
  official: null as string | null,
  field: [{ player_id: '00000000-0000-0000-0000-0000000000a1', role: 'lineup' }] as Array<{ player_id: string; role: string }>,
  snap: [] as Array<{ player_id: string; role: string }>,
  insertErr: null as Err,
  linkErr: null as Err,
  holeErr: null as Err,
  scoredCount: 3,
  calls: [] as string[],
}));
vi.mock('@/lib/flags', () => ({ isFlagEnabled: () => state.on }));
vi.mock('@/lib/auth/get-golf-dashboard-role', () => ({ getGolfDashboardRole: async () => state.role }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => ({ coach: { id: 'c1', organization_id: 'o1' }, player: state.playerSession }) }));
vi.mock('@/lib/golf/dashboard-request-cache', () => ({
  resolveCoachActiveTeamForRequest: async () => ({ status: 'ok', teamId: 'team-1' }),
  getActivePlayerTeamMembership: async () => ({ data: { team_id: 'team-1' }, error: null }),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn(), logServerException: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _o: unknown, fn: unknown) => fn }));

function query(table: string) {
  const q: Record<string, unknown> = {};
  const chain = () => q;
  Object.assign(q, {
    select: (_c?: string, opts?: { head?: boolean }) => {
      if (opts?.head) return { eq: () => ({ not: async () => ({ count: state.scoredCount, error: null }) }) };
      return q;
    },
    eq: chain,
    is: chain,
    not: chain,
    maybeSingle: async () => {
      if (table === 'golf_tournament_rounds') return { data: { tournament_id: TID, course_id: 'course-1' }, error: null };
      if (table === 'golf_tournaments') return { data: { team_id: 'team-1', holes_per_round: 18, course_id: 'course-1', official_at: state.official }, error: null };
      if (table === 'golf_tournament_player_rounds') return { data: state.existing, error: null };
      return { data: null, error: null };
    },
    then: (ok: (v: unknown) => void) => ok({ data: table === 'golf_tournament_round_lineups' ? state.snap : state.field, error: null }),
    insert: (row: unknown) => {
      state.calls.push(`insert ${table} ${JSON.stringify(row)}`);
      return { select: () => ({ single: async () => (state.insertErr ? { data: null, error: state.insertErr } : { data: { id: 'new-round' }, error: null }) }) };
    },
    upsert: async (row: unknown, opts: unknown) => {
      state.calls.push(`upsert ${table} ${JSON.stringify(row)} ${JSON.stringify(opts)}`);
      return { error: table === 'golf_tournament_player_rounds' ? state.linkErr : state.holeErr };
    },
    update: (row: unknown) => {
      state.calls.push(`update ${table} ${JSON.stringify(row)}`);
      return { eq: () => ({ eq: async () => ({ error: state.holeErr }) }) };
    },
    delete: () => {
      state.calls.push(`delete ${table}`);
      return { eq: () => ({ eq: () => ({ is: async () => ({ error: null }) }), then: (ok: (v: unknown) => void) => ok({ error: null }) }) };
    },
  });
  return q;
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: (t: string) => query(t) }) }));

import { saveTournamentHole } from '../tournaments-holes';

const base = { roundEventId: RE, playerId: P1, date: '2026-11-12', hole: 3, par: 4, strokes: 5 };

beforeEach(() => {
  state.on = true;
  state.role = 'coach';
  state.playerSession = { id: P1 };
  state.existing = null;
  state.official = null;
  state.field = [{ player_id: P1, role: 'lineup' }];
  state.snap = [];
  state.insertErr = null;
  state.linkErr = null;
  state.holeErr = null;
  state.scoredCount = 3;
  state.calls = [];
});

describe('saveTournamentHole', () => {
  it('a coach scoring a player’s first hole makes their tournament round, links it, and writes the hole', async () => {
    const res = await saveTournamentHole(base);
    expect(res).toMatchObject({ success: true, data: { roundId: 'new-round', thru: 3 } });
    expect(state.calls[0]).toContain('insert golf_rounds');
    expect(state.calls[0]).toContain('"round_type":"tournament"');
    expect(state.calls[0]).toContain('"status":"in_progress"');
    expect(state.calls[1]).toContain('upsert golf_tournament_player_rounds');
    expect(state.calls[1]).toContain('"link_source":"coach"');
    expect(state.calls[2]).toContain('upsert golf_holes');
    expect(state.calls[2]).toContain('"hole_number":3');
    expect(state.calls[2]).toContain('"onConflict":"round_id,hole_number"');
  });

  it('never completes a round (that is the protected submit flow’s)', async () => {
    await saveTournamentHole(base);
    expect(state.calls.join('\n')).not.toContain('completed');
  });

  it('later holes go onto the linked round with no new round or link', async () => {
    state.existing = { round_id: 'linked', entered_total: null };
    await saveTournamentHole({ ...base, hole: 4 });
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]).toContain('"round_id":"linked"');
  });

  it('clearing a hole sets its score to null', async () => {
    state.existing = { round_id: 'linked', entered_total: null };
    await saveTournamentHole({ ...base, strokes: null });
    expect(state.calls[0]).toContain('update golf_holes {"score":null}');
  });

  it('a round with an entered total is not scored by hole until the total is cleared', async () => {
    state.existing = { round_id: null, entered_total: 72 };
    await expect(saveTournamentHole(base)).resolves.toMatchObject({ success: false, code: 'invalid' });
    expect(state.calls).toEqual([]);
  });

  it('refuses a player who is not playing the round, official results, and a hole past the format', async () => {
    state.field = [{ player_id: P2, role: 'lineup' }];
    await expect(saveTournamentHole(base)).resolves.toMatchObject({ success: false, code: 'not_in_lineup' });
    state.field = [{ player_id: P1, role: 'alternate' }];
    await expect(saveTournamentHole(base)).resolves.toMatchObject({ success: false, code: 'not_in_lineup' });
    state.field = [{ player_id: P1, role: 'lineup' }];
    state.official = '2026-11-13T00:00:00Z';
    await expect(saveTournamentHole(base)).resolves.toMatchObject({ success: false, code: 'invalid' });
    expect(state.calls).toEqual([]);
  });

  it('refuses bad input before anything is read', async () => {
    await expect(saveTournamentHole({ ...base, hole: 19 })).resolves.toMatchObject({ success: false, code: 'invalid' });
    await expect(saveTournamentHole({ ...base, strokes: 0 })).resolves.toMatchObject({ success: false, code: 'invalid' });
    await expect(saveTournamentHole({ ...base, playerId: 'nope' })).resolves.toMatchObject({ success: false, code: 'invalid' });
    state.on = false;
    await expect(saveTournamentHole(base)).resolves.toMatchObject({ success: false, code: 'off' });
    expect(state.calls).toEqual([]);
  });

  it('a player scores only themselves, as a player link', async () => {
    state.role = 'player';
    await expect(saveTournamentHole({ ...base, playerId: P2 })).resolves.toMatchObject({ success: false, code: 'not_coach' });
    expect(state.calls).toEqual([]);
    await expect(saveTournamentHole(base)).resolves.toMatchObject({ success: true });
    expect(state.calls[1]).toContain('"link_source":"player"');
  });

  it('a link the policy refuses leaves no half-made round, and the refusal is a code with its words', async () => {
    state.role = 'player';
    state.linkErr = { code: '42501', message: 'new row violates row-level security policy' };
    await expect(saveTournamentHole(base)).resolves.toMatchObject({ success: false, code: 'not_coach', error: expect.any(String) });
    expect(state.calls.some((c) => c.startsWith('delete golf_rounds'))).toBe(true);
    expect(state.calls.some((c) => c.includes('upsert golf_holes'))).toBe(false);
  });
});
