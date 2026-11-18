import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const P1 = '00000000-0000-0000-0000-0000000000a1';
const P2 = '00000000-0000-0000-0000-0000000000a2';
const RE1 = '00000000-0000-0000-0000-0000000000b1';
const RE2 = '00000000-0000-0000-0000-0000000000b2';
const TID = '00000000-0000-0000-0000-0000000000c1';
const FT = '00000000-0000-0000-0000-0000000000d1';
const US = '00000000-0000-0000-0000-0000000000d9';

type Err = { code: string; message: string } | null;
type Row = Record<string, unknown>;
/**
 * A stand-in database: every read answers from `state`, and every write is recorded. No network (the test client must
 * never reach a Supabase project).
 */
const state = vi.hoisted(() => ({
  on: true,
  role: 'coach' as 'coach' | 'player',
  tour: { id: '00000000-0000-0000-0000-0000000000c1', team_id: 'team-1', holes_per_round: 18, course_id: 'course-1', official_at: null as string | null },
  rounds: [] as Row[],
  entries: [] as Row[],
  snap: [] as Row[],
  existing: [] as Row[],
  linked: [] as Row[],
  field: [] as Row[],
  insertErr: null as Err,
  calls: [] as string[],
}));
vi.mock('@/lib/flags', () => ({ isFlagEnabled: () => state.on }));
vi.mock('@/lib/auth/get-golf-dashboard-role', () => ({ getGolfDashboardRole: async () => state.role }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => ({ coach: state.role === 'coach' ? { id: 'c1', organization_id: 'o1' } : null, player: null }) }));
vi.mock('@/lib/golf/dashboard-request-cache', () => ({ resolveCoachActiveTeamForRequest: async () => ({ status: 'ok', teamId: 'team-1' }) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn(), logServerException: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _o: unknown, fn: unknown) => fn }));

function query(table: string) {
  const reads: Record<string, () => Row[]> = {
    golf_tournament_rounds: () => state.rounds,
    golf_tournament_entries: () => state.entries,
    golf_tournament_round_lineups: () => state.snap,
    golf_tournament_player_rounds: () => state.existing,
    golf_rounds: () => state.linked,
    golf_tournament_field_teams: () => state.field,
  };
  const q: Record<string, unknown> = {};
  const chain = () => q;
  Object.assign(q, {
    select: chain,
    eq: chain,
    in: chain,
    maybeSingle: async () => (table === 'golf_tournaments' ? { data: state.tour, error: null } : { data: null, error: null }),
    then: (ok: (v: unknown) => void) => ok({ data: reads[table]?.() ?? [], error: null }),
    insert: (row: unknown) => {
      state.calls.push(`insert ${table} ${JSON.stringify(row)}`);
      if (table === 'golf_rounds') return { select: () => ({ single: async () => (state.insertErr ? { data: null, error: state.insertErr } : { data: { id: 'new-round' }, error: null }) }) };
      const rows = (row as Row[]).map((r, i) => ({ id: `00000000-0000-0000-0000-00000000e00${i}`, name: r.name, is_us: r.is_us }));
      return { select: async () => ({ data: rows, error: null }) };
    },
    upsert: async (row: unknown, opts: unknown) => {
      state.calls.push(`upsert ${table} ${JSON.stringify(row)} ${JSON.stringify(opts)}`);
      return { error: null };
    },
    update: (row: unknown) => {
      state.calls.push(`update ${table} ${JSON.stringify(row)}`);
      const done = { error: null };
      const e = { eq: () => e, then: (ok: (v: unknown) => void) => ok(done) };
      return e;
    },
    delete: () => {
      state.calls.push(`delete ${table}`);
      return { eq: async () => ({ error: null }) };
    },
  });
  return q;
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: (t: string) => query(t), auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }) }));

import { importTournamentResults, type TourImportInput } from '../tournaments-import';

const PARS = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const holes = PARS.map((p) => p);
const cardRow = (over: Partial<TourImportInput['cards'][number]> = {}): TourImportInput['cards'][number] => ({ roundEventId: RE1, playerId: P1, date: '2026-10-20', holes, pars: PARS, total: null, status: 'ok', replace: false, ...over });
const input = (over: Partial<TourImportInput> = {}): TourImportInput => ({ tournamentId: TID, cards: [cardRow()], teams: [], ...over });

beforeEach(() => {
  state.on = true;
  state.role = 'coach';
  state.tour = { ...state.tour, official_at: null, holes_per_round: 18 };
  state.rounds = [
    { round_event_id: RE1, round_number: 1, course_id: 'course-1' },
    { round_event_id: RE2, round_number: 2, course_id: 'course-1' },
  ];
  state.entries = [
    { player_id: P1, role: 'lineup' },
    { player_id: P2, role: 'alternate' },
  ];
  state.snap = [];
  state.existing = [];
  state.linked = [];
  state.field = [];
  state.insertErr = null;
  state.calls = [];
});

describe('importTournamentResults: our players', () => {
  it('a player with nothing for the round gets a tournament card: an in-progress round, its link, its holes', async () => {
    const res = await importTournamentResults(input());
    expect(res).toMatchObject({ success: true, data: { cards: 1, kept: [] } });
    expect(state.calls[0]).toContain('insert golf_rounds');
    expect(state.calls[0]).toContain('"round_type":"tournament"');
    expect(state.calls[0]).toContain('"status":"in_progress"');
    expect(state.calls[1]).toContain('upsert golf_tournament_player_rounds');
    expect(state.calls[1]).toContain('"round_id":"new-round","entered_total":null');
    expect(state.calls[1]).toContain('"link_source":"coach"');
    expect(state.calls[2]).toContain('upsert golf_holes');
    expect(state.calls[2]).toContain('"onConflict":"round_id,hole_number"');
    expect(JSON.parse(state.calls[2]!.split(' ').slice(2, -1).join(' '))).toHaveLength(18);
  });

  it('never completes or deletes a round', async () => {
    await importTournamentResults(input());
    expect(state.calls.join('\n')).not.toMatch(/completed|delete/);
  });

  it('an open card is corrected hole by hole, as hole scoring does', async () => {
    state.existing = [{ round_event_id: RE1, player_id: P1, round_id: 'open-1', entered_total: null }];
    state.linked = [{ id: 'open-1', status: 'in_progress' }];
    const res = await importTournamentResults(input());
    expect(res).toMatchObject({ success: true, data: { cards: 1 } });
    expect(state.calls.some((c) => c.startsWith('upsert golf_holes') && c.includes('"round_id":"open-1"'))).toBe(true);
    expect(state.calls.some((c) => c.startsWith('insert golf_rounds'))).toBe(false);
  });

  it('a submitted round is never written: holes are kept back, and only a chosen official score replaces the link', async () => {
    state.existing = [{ round_event_id: RE1, player_id: P1, round_id: 'done-1', entered_total: null }];
    state.linked = [{ id: 'done-1', status: 'completed' }];
    await expect(importTournamentResults(input())).resolves.toMatchObject({ success: true, data: { cards: 0, kept: [{ playerId: P1, roundEventId: RE1, why: 'submitted' }] } });
    expect(state.calls).toEqual([]);
    await expect(importTournamentResults(input({ cards: [cardRow({ holes: null, pars: null, total: 74 })] }))).resolves.toMatchObject({ success: true, data: { cards: 0, kept: [{ why: 'card' }] } });
    state.calls = [];
    await expect(importTournamentResults(input({ cards: [cardRow({ holes: null, pars: null, total: 74, replace: true })] }))).resolves.toMatchObject({ success: true, data: { cards: 1 } });
    expect(state.calls[0]).toContain('"round_id":null,"entered_total":74');
    expect(state.calls.join('\n')).not.toContain('golf_holes');
  });

  it('an entered total is replaced by holes only when the coach said so', async () => {
    state.existing = [{ round_event_id: RE1, player_id: P1, round_id: null, entered_total: 72 }];
    await expect(importTournamentResults(input())).resolves.toMatchObject({ success: true, data: { cards: 0, kept: [{ why: 'entered' }] } });
    await expect(importTournamentResults(input({ cards: [cardRow({ replace: true })] }))).resolves.toMatchObject({ success: true, data: { cards: 1 } });
  });

  it('keeps back a player who doesn’t play the round (an alternate), by the lineup snapshot once it is locked', async () => {
    await expect(importTournamentResults(input({ cards: [cardRow({ playerId: P2 })] }))).resolves.toMatchObject({ success: true, data: { cards: 0, kept: [{ why: 'not_in_lineup' }] } });
    state.snap = [{ round_event_id: RE1, player_id: P2, role: 'lineup' }];
    await expect(importTournamentResults(input({ cards: [cardRow({ playerId: P2 })] }))).resolves.toMatchObject({ success: true, data: { cards: 1 } });
  });

  it('refuses official results, another round’s id, holes that don’t match the format, and anyone but a coach', async () => {
    await expect(importTournamentResults(input({ cards: [cardRow({ roundEventId: '00000000-0000-0000-0000-0000000000ff' })] }))).resolves.toMatchObject({ success: false, code: 'not_found' });
    await expect(importTournamentResults(input({ cards: [cardRow({ holes: holes.slice(0, 9), pars: PARS.slice(0, 9) })] }))).resolves.toMatchObject({ success: false, code: 'invalid' });
    await expect(importTournamentResults(input({ cards: [cardRow({ pars: null })] }))).resolves.toMatchObject({ success: false, code: 'invalid' });
    state.tour = { ...state.tour, official_at: '2026-10-22T00:00:00Z' };
    await expect(importTournamentResults(input())).resolves.toMatchObject({ success: false, code: 'invalid' });
    state.tour = { ...state.tour, official_at: null };
    state.role = 'player';
    await expect(importTournamentResults(input())).resolves.toMatchObject({ success: false, code: 'not_coach' });
    state.role = 'coach';
    state.on = false;
    await expect(importTournamentResults(input())).resolves.toMatchObject({ success: false, code: 'off' });
    expect(state.calls).toEqual([]);
  });
});

describe('importTournamentResults: the field', () => {
  it('adds teams the field lacks, upserts their round scores, and saves places; our row takes a place only', async () => {
    state.field = [{ id: US, name: 'Demo', is_us: true }];
    const res = await importTournamentResults(
      input({
        cards: [],
        teams: [
          { fieldTeamId: null, name: 'Elon', us: false, bTeam: false, rounds: [{ n: 1, total: 292 }, { n: 2, total: 294 }], place: { n: 1, tied: false }, total: 586 },
          { fieldTeamId: US, name: 'Demo', us: true, bTeam: false, rounds: [], place: { n: 2, tied: false }, total: null },
        ],
      }),
    );
    expect(res).toMatchObject({ success: true, data: { teams: 2, added: 1, places: true } });
    const all = state.calls.join('\n');
    expect(all).toContain('insert golf_tournament_field_teams [{"tournament_id"');
    expect(all).toMatch(/upsert golf_tournament_field_scores .*"round_number":1,"total":292.*"onConflict":"field_team_id,round_number"/);
    expect(all).toContain('update golf_tournament_field_teams {"final_place":1,"final_place_tied":false,"final_total":586}');
    expect(all).toContain('update golf_tournament_field_teams {"final_place":2,"final_place_tied":false}');
    expect(all).not.toMatch(/field_scores.*d9/);
  });

  it('refuses a field row from another tournament or our own row dressed as another team', async () => {
    state.field = [{ id: FT, name: 'Elon', is_us: false }];
    const elsewhere = { fieldTeamId: '00000000-0000-0000-0000-0000000000ee', name: 'X', us: false, bTeam: false, rounds: [], place: null, total: null };
    await expect(importTournamentResults(input({ cards: [], teams: [elsewhere] }))).resolves.toMatchObject({ success: false, code: 'invalid' });
    await expect(importTournamentResults(input({ cards: [], teams: [{ ...elsewhere, fieldTeamId: FT, us: true }] }))).resolves.toMatchObject({ success: false, code: 'invalid' });
  });

  it('saving the same teams twice writes the same rows (upserts, no second insert)', async () => {
    state.field = [{ id: FT, name: 'Elon', is_us: false }];
    const team = { fieldTeamId: FT, name: 'Elon', us: false, bTeam: false, rounds: [{ n: 1, total: 292 }], place: null, total: null };
    await importTournamentResults(input({ cards: [], teams: [team] }));
    const first = state.calls.filter((c) => !c.includes('entered_at')).join('\n');
    state.calls = [];
    await importTournamentResults(input({ cards: [], teams: [team] }));
    expect(state.calls.filter((c) => !c.includes('entered_at')).join('\n')).toBe(first);
    expect(state.calls.join('\n')).not.toContain('insert');
  });
});
