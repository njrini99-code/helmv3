/**
 * The Edit qualifier setup actions (D-32): squad size and entrants. Each one
 * checks the caller coaches the qualifier's team before any write, refuses
 * what would break the standings or a confirmed squad, and never calls a
 * write that matched no row "saved". Both are HELD (D-61): with the
 * Clubhouse UI off they refuse before any read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;
const clubhouse = vi.hoisted(() => ({ on: true }));
const access = vi.hoisted(() => ({ result: { allowed: true, reason: 'coach' } as { allowed: boolean; reason?: string } }));

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: <T extends (...args: never[]) => unknown>(_name: string, _options: unknown, action: T) => action,
}));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseFor: vi.fn(() => clubhouse.on) }));
vi.mock('@/lib/auth/verify-player-access', () => ({ verifyTeamAccess: vi.fn(async () => access.result) }));

import { setQualifierEntrants, setQualifierSquadSize } from '../qualifier-setup';
import { verifyTeamAccess } from '@/lib/auth/verify-player-access';

const Q = '11111111-1111-4111-8111-111111111111';
const TEAM = '22222222-2222-4222-8222-222222222222';
const p = (n: number) => `33333333-3333-4333-8333-00000000000${n}`;

function world(over: { selection_state?: string; entries?: string[]; members?: string[]; rounds?: Array<{ player_id: string; status: string }>; picks?: string[] } = {}) {
  fake = createFakeSupabase({
    user: { id: 'coach-user' },
    tables: {
      golf_qualifiers: [{ id: Q, team_id: TEAM, selection_state: over.selection_state ?? 'open', selection_slots_total: 5, selection_slots_coach_pick: 1 }],
      golf_qualifier_entries: (over.entries ?? [p(1), p(2)]).map((player_id, i) => ({ id: `e${i}`, qualifier_id: Q, player_id, status: 'entered' })),
      golf_team_members: (over.members ?? [p(1), p(2), p(3)]).map((player_id) => ({ team_id: TEAM, player_id, status: 'active' })),
      golf_rounds: (over.rounds ?? []).map((r, i) => ({ id: `r${i}`, qualifier_id: Q, ...r })),
      golf_qualifier_selections: (over.picks ?? []).map((player_id) => ({ qualifier_id: Q, player_id, selection_type: 'coach_pick' })),
    },
  });
}

beforeEach(() => {
  clubhouse.on = true;
  access.result = { allowed: true, reason: 'coach' };
  vi.mocked(verifyTeamAccess).mockClear();
  world();
});

describe('HELD gate (D-61)', () => {
  it('refuses both actions before any read while the Clubhouse UI is off', async () => {
    clubhouse.on = false;
    const from = vi.spyOn(fake, 'from');
    const refusal = { success: false, error: 'Editing a qualifier’s setup isn’t available yet.' };
    expect(await setQualifierSquadSize(Q, { total: 6, coachPicks: 2 })).toEqual(refusal);
    expect(await setQualifierEntrants(Q, [p(1), p(3)])).toEqual(refusal);
    expect(from).not.toHaveBeenCalled();
    expect(verifyTeamAccess).not.toHaveBeenCalled();
    const row = (await fake.from('golf_qualifiers').select('*').eq('id', Q).single()).data as { selection_slots_total: number };
    expect(row.selection_slots_total).toBe(5);
  });
});

describe('setQualifierSquadSize', () => {
  it('saves a valid squad after checking the caller coaches the team', async () => {
    const res = await setQualifierSquadSize(Q, { total: 6, coachPicks: 2 });
    expect(res).toEqual({ success: true, data: undefined });
    expect(verifyTeamAccess).toHaveBeenCalledWith(TEAM, 'coach-user', expect.anything());
    const row = (await fake.from('golf_qualifiers').select('*').eq('id', Q).single()).data as { selection_slots_total: number; selection_slots_coach_pick: number };
    expect([row.selection_slots_total, row.selection_slots_coach_pick]).toEqual([6, 2]);
  });

  it('refuses a caller who does not coach the team, before any write', async () => {
    access.result = { allowed: false, reason: 'denied' };
    const res = await setQualifierSquadSize(Q, { total: 6, coachPicks: 2 });
    expect(res).toEqual({ success: false, error: 'Only a coach of this team can change this qualifier.' });
    const row = (await fake.from('golf_qualifiers').select('*').eq('id', Q).single()).data as { selection_slots_total: number };
    expect(row.selection_slots_total).toBe(5);
  });

  it('refuses a signed-out caller and a malformed id', async () => {
    fake = createFakeSupabase({ user: null, tables: {} });
    expect((await setQualifierSquadSize(Q, { total: 5, coachPicks: 1 })).success).toBe(false);
    expect(await setQualifierSquadSize('not-a-uuid', { total: 5, coachPicks: 1 })).toEqual({ success: false, error: 'That qualifier link isn’t valid.' });
  });

  it('refuses sizes the database would reject: more picks than places, or over 12', async () => {
    expect((await setQualifierSquadSize(Q, { total: 3, coachPicks: 4 })).success).toBe(false);
    expect((await setQualifierSquadSize(Q, { total: 13, coachPicks: 1 })).success).toBe(false);
    expect((await setQualifierSquadSize(Q, { total: 0, coachPicks: 0 })).success).toBe(false);
  });

  it('refuses once the squad is confirmed', async () => {
    world({ selection_state: 'selected' });
    expect(await setQualifierSquadSize(Q, { total: 6, coachPicks: 1 })).toEqual({ success: false, error: 'The squad is already confirmed, so its size can’t change.' });
  });

  it('never calls an update that matched no row saved', async () => {
    fake = createFakeSupabase({
      user: { id: 'coach-user' },
      // The gate sees an open squad; the row itself is confirmed by the time the update runs.
      tables: { golf_qualifiers: [{ id: Q, team_id: TEAM, selection_state: 'selected' }], golf_qualifier_selections: [] },
    });
    const read = fake.from.bind(fake);
    let first = true;
    fake.from = ((table: string) => {
      if (table === 'golf_qualifiers' && first) {
        first = false;
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: Q, team_id: TEAM, selection_state: 'open' }, error: null }) }) }) };
      }
      return read(table);
    }) as typeof fake.from;
    expect(await setQualifierSquadSize(Q, { total: 6, coachPicks: 1 })).toEqual({ success: false, error: 'Couldn’t save the squad size. You may not have edit access to this team.' });
  });

  it('keeps at least as many pick spots as picks already chosen', async () => {
    world({ selection_state: 'closed', picks: [p(1), p(2)] });
    const res = await setQualifierSquadSize(Q, { total: 5, coachPicks: 1 });
    expect(res).toEqual({ success: false, error: '2 coach’s picks are already chosen. Keep at least 2 pick spots.' });
  });
});

describe('setQualifierEntrants', () => {
  it('adds and removes entrants, reporting both counts', async () => {
    const res = await setQualifierEntrants(Q, [p(1), p(3)]);
    expect(res).toEqual({ success: true, data: { added: 1, removed: 1 } });
    const { data } = await fake.from('golf_qualifier_entries').select('player_id').eq('qualifier_id', Q);
    expect((data as Array<{ player_id: string }>).map((e) => e.player_id).sort()).toEqual([p(1), p(3)].sort());
  });

  it('changes nothing when the list is the same', async () => {
    expect(await setQualifierEntrants(Q, [p(2), p(1)])).toEqual({ success: true, data: { added: 0, removed: 0 } });
  });

  it('refuses a player who is not on the active roster, and enters nobody', async () => {
    world({ members: [p(1), p(2)] });
    const res = await setQualifierEntrants(Q, [p(1), p(2), p(4)]);
    expect(res).toEqual({ success: false, error: 'One player isn’t on the active roster, so nothing changed.' });
    const { data } = await fake.from('golf_qualifier_entries').select('player_id').eq('qualifier_id', Q);
    expect((data as unknown[]).length).toBe(2);
  });

  it('refuses to take out a player with a round, started or finished, and changes nothing', async () => {
    world({ rounds: [{ player_id: p(2), status: 'in_progress' }] });
    const res = await setQualifierEntrants(Q, [p(1), p(3)]);
    expect(res).toEqual({ success: false, error: 'One player has a round or a squad place in this qualifier and can’t be taken out, so nothing changed.' });
    const { data } = await fake.from('golf_qualifier_entries').select('player_id').eq('qualifier_id', Q);
    expect((data as Array<{ player_id: string }>).map((e) => e.player_id).sort()).toEqual([p(1), p(2)].sort());
  });

  it('refuses a qualifier the caller cannot see (another team’s, hidden by RLS) as not found', async () => {
    fake = createFakeSupabase({ user: { id: 'coach-user' }, tables: { golf_qualifiers: [], golf_qualifier_entries: [] } });
    expect(await setQualifierEntrants(Q, [p(1)])).toEqual({ success: false, error: 'That qualifier wasn’t found. It may have been deleted.' });
    expect(await setQualifierSquadSize(Q, { total: 5, coachPicks: 1 })).toEqual({ success: false, error: 'That qualifier wasn’t found. It may have been deleted.' });
    expect(verifyTeamAccess).not.toHaveBeenCalled();
  });

  it('refuses a player who is active on another team, and enters nobody', async () => {
    fake = createFakeSupabase({
      user: { id: 'coach-user' },
      tables: {
        golf_qualifiers: [{ id: Q, team_id: TEAM, selection_state: 'open' }],
        golf_qualifier_entries: [p(1), p(2)].map((player_id, i) => ({ id: `e${i}`, qualifier_id: Q, player_id, status: 'entered' })),
        golf_team_members: [
          ...[p(1), p(2)].map((player_id) => ({ team_id: TEAM, player_id, status: 'active' })),
          { team_id: '44444444-4444-4444-8444-444444444444', player_id: p(4), status: 'active' },
        ],
        golf_rounds: [],
        golf_qualifier_selections: [],
      },
    });
    expect(await setQualifierEntrants(Q, [p(1), p(2), p(4)])).toEqual({ success: false, error: 'One player isn’t on the active roster, so nothing changed.' });
    const { data } = await fake.from('golf_qualifier_entries').select('player_id').eq('qualifier_id', Q);
    expect((data as unknown[]).length).toBe(2);
  });

  it('says what saved when the new players went in but taking players out matched no row', async () => {
    const real = fake.from.bind(fake);
    fake.from = ((table: string) => {
      const builder = real(table);
      if (table === 'golf_qualifier_entries') {
        // RLS refusing the delete: no error, no rows.
        const refused = { eq: () => refused, in: () => refused, select: async () => ({ data: [], error: null }) };
        Object.assign(builder, { delete: () => refused });
      }
      return builder;
    }) as typeof fake.from;
    expect(await setQualifierEntrants(Q, [p(1), p(3)])).toEqual({ success: false, error: 'The new players were entered, but taking players out didn’t save. Save again to finish.' });
    const { data } = await real('golf_qualifier_entries').select('player_id').eq('qualifier_id', Q);
    expect((data as Array<{ player_id: string }>).map((e) => e.player_id).sort()).toEqual([p(1), p(2), p(3)].sort());
  });

  it('refuses to take out a player with a round in any status, not only started or finished', async () => {
    world({ rounds: [{ player_id: p(2), status: 'draft' }] });
    expect((await setQualifierEntrants(Q, [p(1)])).success).toBe(false);
  });

  it('refuses an empty or malformed list and a caller who does not coach the team', async () => {
    expect(await setQualifierEntrants(Q, [])).toEqual({ success: false, error: 'Choose at least one player.' });
    expect(await setQualifierEntrants(Q, ['not-a-uuid'])).toEqual({ success: false, error: 'That player list isn’t valid. Reload and try again.' });
    access.result = { allowed: false, reason: 'unavailable' };
    expect(await setQualifierEntrants(Q, [p(1)])).toEqual({ success: false, error: 'Couldn’t confirm your access to this team. Try again.' });
  });
});
