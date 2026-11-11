import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The reads practice-plan.ts used to make without looking at `error`. supabase-js RESOLVES a failed read as
 * `{ data: null, error }`, so each of these used to pass for "nothing there". A stand-in for Supabase: not a database
 * test. Synthetic ids only.
 */
type Row = Record<string, unknown>;
type Failure = { code?: string; message: string };
const tables: Record<string, Row[]> = {};
const failing: Record<string, Failure> = {};
const reads: string[] = [];
const logged = vi.hoisted(() => vi.fn());

function from(table: string) {
  const filters: Record<string, unknown> = {};
  const ins: Record<string, unknown[]> = {};
  const rows = () =>
    (tables[table] ?? []).filter((r) => Object.entries(filters).every(([k, v]) => !(k in r) || r[k] === v) && Object.entries(ins).every(([k, vs]) => vs.includes(r[k])));
  const answer = <T,>(data: T) => {
    reads.push(table);
    return failing[table] ? { data: null, error: failing[table] } : { data, error: null };
  };
  const chain = {
    select: () => chain,
    eq: (k: string, v: unknown) => ((filters[k] = v), chain),
    in: (k: string, vs: unknown[]) => ((ins[k] = vs), chain),
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(answer(rows()[0] ?? null)),
    then: (done: (r: { data: Row[] | null; error: Failure | null }) => unknown) => Promise.resolve(answer(rows())).then(done),
  };
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from }) }));
vi.mock('../../lib/track-server', () => ({ chLogServer: logged }));

import { loadCoachPlan, loadPlanDrills, PlanDrillsUnreadError } from '../practice-plan';

const TIMEOUT: Failure = { code: '57014', message: 'canceling statement due to statement timeout' };
const body = {
  v: 2,
  focus: 'Lag',
  notes: '',
  place: 'Lakeside',
  arrivalBufferMin: 15,
  bring: [],
  players: ['p1'],
  groups: [],
  variants: {
    main: {
      blocks: [
        { id: 'w', kind: 'team', title: 'Warm-up', len: 30, coach: null, note: '', place: 'Range', drill: { src: 'team', id: 'td-1' } },
        { id: 'c', kind: 'team', title: 'Chipping', len: 20, coach: null, note: '', place: 'Green', drill: { src: 'lib', id: 'ld-1' } },
      ],
    },
    rain: null,
  },
};

beforeEach(() => {
  reads.length = 0;
  logged.mockClear();
  for (const k of Object.keys(tables)) delete tables[k];
  for (const k of Object.keys(failing)) delete failing[k];
  Object.assign(tables, {
    golf_practice_plans: [{ id: 'plan-1', team_id: 't-1', event_id: 'ev-1', title: 'Thursday practice', step: 'review', body, version: 3, status: 'published', published_version: 3, coach_why: {}, updated_at: '2026-11-04T12:00:00Z' }],
    golf_practice_plan_versions: [{ plan_id: 'plan-1', version: 3, published_at: '2026-11-04T17:30:00Z' }],
    golf_practice_plan_opens: [],
    golf_practice_plan_formats: [],
    golf_events: [{ id: 'ev-1', start_time: '2026-11-05T19:00:00Z', end_time: '2026-11-05T21:00:00Z', team_id: 't-1', location: 'Lakeside' }],
    golf_teams: [{ id: 't-1', name: 'Demo Golf', timezone: 'America/New_York', organization_id: 'o-1' }],
    golf_team_members: [{ team_id: 't-1', status: 'active', player_id: 'p1', golf_players: { first_name: 'Maya', last_name: 'Reed' } }],
    golf_coaches: [{ organization_id: 'o-1', full_name: 'Coach Lin' }],
    golf_team_drills: [{ id: 'td-1', name: 'Ladder', area: 'putting', minutes: 15, setup: 'Five tees', goal: 'Make three in a row', diagram: null, scoring: null, levels: null }],
    golf_drills: [{ id: 'ld-1', title: 'Up and down', category: 'short_game', duration_min: 20, description: 'Nine balls' }],
  });
});

describe('the print appendix’s drills', () => {
  it('reads the team drill and the library drill the plan names', async () => {
    const drills = await loadPlanDrills('plan-1');
    expect(drills.map((d) => d.name)).toEqual(['Ladder', 'Up and down']);
    expect(logged).not.toHaveBeenCalled();
  });

  it('a plan that names no drills is an empty list: that read worked', async () => {
    tables.golf_practice_plans = [{ ...tables.golf_practice_plans![0], body: { ...body, variants: { main: { blocks: [] }, rain: null } } }];
    expect(await loadPlanDrills('plan-1')).toEqual([]);
    // Nothing to look up, so the drill tables are not asked.
    expect(reads).toEqual(['golf_practice_plans']);
    expect(logged).not.toHaveBeenCalled();
  });

  it.each([
    ['golf_practice_plans', 'drills plan'],
    ['golf_team_drills', 'drills team drills'],
    ['golf_drills', 'drills library drills'],
  ])('a failed read of %s throws and is logged: it is never an appendix with drills missing', async (table, read) => {
    failing[table] = TIMEOUT;
    await expect(loadPlanDrills('plan-1')).rejects.toBeInstanceOf(PlanDrillsUnreadError);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith('practice.plan', read, TIMEOUT, 'practice_plans');
  });

  it('Practice not there yet (the held tables) still throws, but there is nothing to page anyone about', async () => {
    failing.golf_practice_plans = { code: 'PGRST205', message: 'Could not find the table' };
    await expect(loadPlanDrills('plan-1')).rejects.toBeInstanceOf(PlanDrillsUnreadError);
    expect(logged).not.toHaveBeenCalled();
  });
});

describe('when a published plan went out', () => {
  it('is on the sheet when the version row reads', async () => {
    const load = await loadCoachPlan('plan-1');
    if (load.status !== 'ready') throw new Error(`expected ready, got ${load.status}`);
    expect(load.plan.foot).toMatch(/^Published \w{3}, Nov 4/);
    expect(logged).not.toHaveBeenCalled();
  });

  it('a failed read of the version row leaves "Published" with no time, logs it, and the plan still opens as published', async () => {
    failing.golf_practice_plan_versions = TIMEOUT;
    const load = await loadCoachPlan('plan-1');
    if (load.status !== 'ready') throw new Error(`expected ready, got ${load.status}`);
    expect(load.plan.foot).toBe('Published');
    expect(load.coach?.status.status).toBe('published');
    expect(logged).toHaveBeenCalledWith('practice.plan', 'published at', TIMEOUT, 'practice_plans');
  });
});
