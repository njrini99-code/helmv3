import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The player read against a stand-in for Supabase that answers as RLS does: `golf_practice_plans` gives a player nothing. Not a database test: policies are not exercised here. */
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const reads: Array<{ table: string; filters: Record<string, unknown> }> = [];

function from(table: string) {
  const filters: Record<string, unknown> = {};
  const answer = () => {
    reads.push({ table, filters });
    return (tables[table] ?? []).filter((r) => Object.entries(filters).every(([k, v]) => !(k in r) || r[k] === v));
  };
  const chain = {
    select: () => chain,
    eq: (k: string, v: unknown) => {
      filters[k] = v;
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve({ data: answer()[0] ?? null, error: null }),
    then: (done: (r: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: answer(), error: null }).then(done),
  };
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from }) }));

import { loadPlayerPlan, loadPlayerPractice } from '../practice-plan';

/** The row `golf_practice_plan_publish` writes: flat, no variants, Own work lines removed. */
const versionBody = {
  v: 2,
  focus: 'Lag',
  notes: '',
  place: 'Lakeside',
  arrivalBufferMin: 15,
  bring: [],
  players: ['me', 'mate', 'other'],
  groups: [
    { id: 'gA', name: 'A', players: ['other'], savedGroupId: null },
    { id: 'gB', name: 'B', players: ['me', 'mate'], savedGroupId: null },
  ],
  variant: 'main',
  blocks: [
    { id: 'w', kind: 'team', title: 'Warm-up', len: 30, coach: null, note: '', place: 'Range', drill: null },
    { id: 's', kind: 'stations', title: 'Rotation', len: 40, coach: null, note: '', stations: [{ id: 's1', place: 'Back', coach: null, drill: null, note: '' }, { id: 's2', place: 'Front', coach: null, drill: null, note: '' }], groupIds: ['gA', 'gB'], turnMin: 20, moveMin: 0, turns: 2, grid: null },
    { id: 'o', kind: 'own', title: 'Own work', len: 20, coach: null, note: '', place: 'Range' },
  ],
  title: 'Thursday practice',
  drills: {},
};

beforeEach(() => {
  reads.length = 0;
  for (const k of Object.keys(tables)) delete tables[k];
  Object.assign(tables, {
    // RLS: a player reads no row of the plans table.
    golf_practice_plans: [],
    golf_practice_plan_versions: [{ plan_id: 'plan-1', version: 2, title: 'Thursday practice', event_id: 'ev-1', body: versionBody, published_at: '2026-11-04T12:00:00Z', is_live: true }],
    golf_practice_plan_lines: [{ plan_id: 'plan-1', version: 2, player_id: 'me', block_id: 'o', line: 'Wedges to 60' }],
    golf_events: [{ id: 'ev-1', start_time: '2026-11-05T19:00:00Z', end_time: '2026-11-05T21:00:00Z', team_id: 't-1', location: 'Lakeside' }],
    golf_teams: [{ id: 't-1', name: 'Demo Golf', timezone: 'America/New_York', organization_id: 'o-1' }],
    golf_team_members: [
      { team_id: 't-1', status: 'active', player_id: 'me', golf_players: { first_name: 'Maya', last_name: 'Reed' } },
      { team_id: 't-1', status: 'active', player_id: 'mate', golf_players: { first_name: 'Jonah', last_name: 'Bell' } },
      { team_id: 't-1', status: 'active', player_id: 'other', golf_players: { first_name: 'Theo', last_name: 'Quinn' } },
    ],
    golf_coaches: [{ organization_id: 'o-1', full_name: 'Coach Lin' }],
  });
});

describe('the player plan read', () => {
  it('opens from the version row alone, never the coach-only plans table', async () => {
    const load = await loadPlayerPlan('plan-1', 'me');
    expect(load.status).toBe('ready');
    expect(reads.some((r) => r.table === 'golf_practice_plans')).toBe(false);
    if (load.status === 'ready') expect(load.plan.title).toBe('Thursday practice');
  });

  it('asks only for the live version: a plan taken down is gone', async () => {
    await loadPlayerPlan('plan-1', 'me');
    expect(reads.find((r) => r.table === 'golf_practice_plan_versions')?.filters.is_live).toBe(true);
    tables.golf_practice_plan_versions = [{ ...tables.golf_practice_plan_versions![0], is_live: false }];
    expect((await loadPlayerPlan('plan-1', 'me')).status).toBe('gone');
    expect((await loadPlayerPractice('plan-1', 'me')).status).toBe('gone');
  });

  it('holds only the player’s own group in the sheet it returns', async () => {
    const load = await loadPlayerPlan('plan-1', 'me');
    if (load.status !== 'ready') throw new Error('not ready');
    const text = JSON.stringify(load.plan);
    expect(load.plan.groups.map((g) => g.letter)).toEqual(['B']);
    expect(text).toContain('Jonah Bell');
    expect(text).not.toContain('Theo');
  });

  it('the Practice page has the player’s stops, group and own line, and only theirs', async () => {
    const page = await loadPlayerPractice('plan-1', 'me', new Date('2026-11-05T19:10:00Z'));
    if (page.status !== 'ready') throw new Error('not ready');
    expect(page.data.title).toBe('Thursday practice');
    expect(page.data.group).toEqual({ name: 'B', mates: ['Jonah'] });
    expect(page.data.stops.map((s) => s.place)).toEqual(['Range', 'Front', 'Back', 'Range']);
    expect(page.data.stops[3]!.line).toContain('Wedges to 60');
    expect(page.data.stops[0]!.now).toBe(true);
    expect(reads.find((r) => r.table === 'golf_practice_plan_lines')?.filters).toEqual({ plan_id: 'plan-1', version: 2, player_id: 'me' });
    expect(JSON.stringify(page.data)).not.toContain('Theo');
  });

  it('a player in no group still gets the plan, with no group’s part', async () => {
    tables.golf_practice_plan_versions = [{ ...tables.golf_practice_plan_versions![0], body: { ...versionBody, players: [...versionBody.players, 'loner'] } }];
    const load = await loadPlayerPlan('plan-1', 'loner');
    if (load.status !== 'ready') throw new Error('not ready');
    expect(load.plan.groups).toEqual([]);
    expect(load.plan.rows.map((r) => r.id)).toEqual(['w', 'o']);
  });
});
