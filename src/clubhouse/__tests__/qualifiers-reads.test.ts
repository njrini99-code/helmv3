import { afterEach, describe, expect, it, vi } from 'vitest';
import { readWaves } from './read-waves';

/** Qualifiers (P009): how many round trips deep the detail and the edit form read (perf, 2026-10-01). Correctness is in qualifiers.test.tsx. */

const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables, gate: undefined as ((t: string) => Promise<void>) | undefined }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

import { loadQualifierDetail, loadQualifierForm } from '../data/qualifiers';

const Q = 'a0000000-0000-4000-8000-0000000000q1';
const qualifier = {
  id: Q,
  team_id: 't1',
  name: 'Fall qualifier',
  description: null,
  status: 'active',
  start_date: '2026-10-01',
  end_date: null,
  entry_deadline: null,
  course_name: 'Hope Valley CC',
  rules: null,
  num_rounds: 2,
  selection_slots_total: 5,
  selection_slots_coach_pick: 1,
  selection_state: 'selected',
  is_test: false,
};
const entry = { qualifier_id: Q, player_id: 'p1', player: { id: 'p1', first_name: 'Eli', last_name: 'Brandt', graduation_year: 2027 } };
const round = { id: 'r1', qualifier_id: Q, player_id: 'p1', qualifier_round_number: 1, total_score: 72, score_to_par: 0, round_date: '2026-10-02', course_name: 'Hope Valley CC', holes_played: 18 };

afterEach(() => {
  tables.current = {};
  tables.gate = undefined;
  logServer.mockClear();
});

describe('Qualifier detail reads', () => {
  const answers = () => ({
    golf_qualifiers: { data: qualifier },
    golf_qualifier_entries: { data: [entry] },
    golf_rounds: { data: [round] },
    golf_qualifier_round_courses: { data: [{ round_number: 1, course_name: 'Hope Valley CC', tee_id: 'tee1' }] },
    golf_qualifier_selections: { data: [{ player_id: 'p1', selection_type: 'top_score' }] },
    golf_course_tees: { data: [{ id: 'tee1', tee_name: 'Blue', total_par: 72 }] },
    golf_holes: { data: [{ round_id: 'r1', hole_number: 1, par: 4, score: 4 }] },
    'rpc:get_qualifier_selection_reasons': { data: [] },
  });
  const read = () => loadQualifierDetail({ role: 'player', teamId: 't1', playerId: 'p1', qualifierId: Q });

  it('the standings, facts and squad come back after two waves (the qualifier, then its parts); the tees and the scorecards are read after and stream behind them', async () => {
    const waves = readWaves();
    // The tees and the scorecards are held until the page has its core: the core must not wait for them.
    let release: () => void = () => {};
    const held = new Promise<void>((r) => (release = r));
    const streamed = new Set(['golf_course_tees', 'golf_holes']);
    tables.gate = (table) => (streamed.has(table) ? held : waves.gate(table));
    tables.current = answers();
    const { result, waves: depth } = await waves.run(read());
    expect(depth[0]).toEqual(['golf_qualifiers']);
    expect(depth[1]).toEqual(['golf_qualifier_entries', 'golf_qualifier_round_courses', 'golf_qualifier_selections', 'golf_rounds']);
    expect(depth).toHaveLength(2);
    // The core is whole without them.
    expect(result?.board?.rows.map((r) => r.playerId)).toEqual(['p1']);
    expect(result?.selections).toEqual([{ playerId: 'p1', type: 'top_score', reasoning: null, name: 'Eli Brandt' }]);
    expect(result).not.toHaveProperty('holes');
    release();
    const secondary = await result!.secondary;
    expect(secondary.holes).toEqual({ r1: [{ n: 1, par: 4, score: 4 }] });
    expect(secondary.roundCourses[0]).toMatchObject({ teeName: 'Blue', par: 72 });
    expect(secondary).toMatchObject({ holesError: false, coursesError: false, par: null });
  });

  it('the scorecards start the moment the rounds are in and the tees the moment the round courses are, not after the squad or anything else of the core', async () => {
    const started: string[] = [];
    let release: () => void = () => {};
    const held = new Promise<void>((r) => (release = r));
    tables.gate = async (table) => {
      started.push(table);
      // The squad is the slowest read of the core.
      if (table === 'golf_qualifier_selections') await held;
    };
    tables.current = answers();
    const loading = read();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(started).toEqual(expect.arrayContaining(['golf_qualifier_selections', 'golf_course_tees', 'golf_holes']));
    release();
    expect((await loading)?.name).toBe('Fall qualifier');
  });

  it('the streamed part never rejects: a read that fails is that section’s flag, and a read that throws is every section’s, logged', async () => {
    tables.current = { ...answers(), golf_course_tees: { error: { message: 'tees' } }, golf_holes: { error: { message: 'holes' } } };
    const failed = await (await read())!.secondary;
    expect(failed).toMatchObject({ coursesError: true, holesError: true, par: null });
    expect(logServer).toHaveBeenCalledWith('qualifiers', 'tees', expect.anything(), 'qualifiers');
    expect(logServer).toHaveBeenCalledWith('qualifiers', 'holes', expect.anything(), 'qualifiers');
    tables.current = {
      ...answers(),
      golf_course_tees: () => {
        throw new Error('tees blew up');
      },
    };
    const thrown = await (await read())!.secondary;
    expect(thrown).toEqual({ holes: {}, holesError: true, roundCourses: [], par: null, coursesError: true });
    expect(logServer).toHaveBeenCalledWith('qualifiers', 'secondary', expect.any(Error), 'qualifiers');
  });

  it('with the rounds unread there are no cards, said as a flag, and the round courses still stream', async () => {
    tables.current = { ...answers(), golf_rounds: { error: { message: 'rounds' } } };
    const core = (await read())!;
    expect(core).toMatchObject({ board: null, roundsError: true });
    const secondary = await core.secondary;
    expect(secondary).toMatchObject({ holes: {}, holesError: true, coursesError: false });
    expect(secondary.roundCourses[0]).toMatchObject({ teeName: 'Blue', par: 72 });
  });
});

describe('Qualifier form reads', () => {
  it('editing reads the roster beside the qualifier, then its parts, then the tees (three waves, not four)', async () => {
    const waves = readWaves();
    tables.gate = waves.gate;
    tables.current = {
      golf_team_members: { data: [{ player: entry.player }] },
      golf_qualifiers: { data: qualifier },
      golf_qualifier_entries: { data: [entry] },
      golf_rounds: { data: [{ player_id: 'p1', qualifier_round_number: 1 }] },
      golf_qualifier_selections: { data: [] },
      golf_qualifier_round_courses: { data: [{ round_number: 1, course_id: 'c1', course_name: 'Hope Valley CC', tee_id: 'tee1' }] },
      golf_course_tees: { data: [{ id: 'tee1', tee_name: 'Blue', total_par: 72 }] },
    };
    const { result, waves: depth } = await waves.run(loadQualifierForm({ teamId: 't1', qualifierId: Q }));
    expect(depth[0]).toEqual(['golf_qualifiers', 'golf_team_members']);
    expect(depth[1]).toEqual(['golf_qualifier_entries', 'golf_qualifier_round_courses', 'golf_qualifier_selections', 'golf_rounds']);
    expect(depth[2]).toEqual(['golf_course_tees']);
    expect(depth).toHaveLength(3);
    expect(result).toMatchObject({ mode: 'edit', playersError: false, coursesError: false });
  });

  it('creating reads the roster and nothing else, in the one wave', async () => {
    const waves = readWaves();
    tables.gate = waves.gate;
    tables.current = { golf_team_members: { data: [{ player: entry.player }] } };
    const { result, waves: depth } = await waves.run(loadQualifierForm({ teamId: 't1', qualifierId: null }));
    expect(depth).toEqual([['golf_team_members']]);
    expect(result).toMatchObject({ mode: 'create' });
  });
});
