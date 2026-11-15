import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The player read against a stand-in for Supabase that answers as RLS does: `golf_practice_plans` gives a player nothing. Not a database test: policies are not exercised here. */
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const reads: Array<{ table: string; filters: Record<string, unknown>; cols: string }> = [];
const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
/**
 * Set to the viewer's own golf_players id, a direct golf_players read (or an embed of it) answers that row alone: what
 * `golf_players_select` gives a player once 20261017005000 drops its teammate branch.
 */
let ownRowOnly: string | null = null;
/** golf_player_profiles not deployed yet: PostgREST's PGRST202, and the helper reads the table instead. */
let profilesMissing = false;
/** golf_player_profiles failing for any other reason. */
let profilesFail = false;

const readable = (p: Row | undefined) => (p && (!ownRowOnly || p.id === ownRowOnly) ? p : null);

function from(table: string) {
  const filters: Record<string, unknown> = {};
  const ins: Record<string, unknown[]> = {};
  let cols = '';
  const answer = () => {
    reads.push({ table, filters, cols });
    const rows = (tables[table] ?? []).filter((r) => Object.entries(filters).every(([k, v]) => !(k in r) || r[k] === v) && Object.entries(ins).every(([k, vs]) => vs.includes(r[k])));
    if (table === 'golf_players') return rows.filter((r) => readable(r));
    // An embed of the roster's players (the helper's fallback, `player:golf_players(...)`), answered under the same rule and
    // under its alias, as PostgREST does.
    const embed = table === 'golf_team_members' ? cols.match(/(?:(\w+):)?golf_players\(/) : null;
    if (embed) return rows.map((m) => ({ ...m, [embed[1] ?? 'golf_players']: readable((tables.golf_players ?? []).find((p) => p.id === m.player_id)) }));
    return rows;
  };
  const chain = {
    select: (c = '') => ((cols = c), chain),
    eq: (k: string, v: unknown) => ((filters[k] = v), chain),
    in: (k: string, vs: unknown[]) => ((ins[k] = vs), chain),
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve({ data: answer()[0] ?? null, error: null }),
    then: (done: (r: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: answer(), error: null }).then(done),
  };
  return chain;
}

/** golf_player_profiles: SECURITY DEFINER, so a teammate's display columns come back whatever golf_players_select answers. */
function rpc(fn: string, args: Record<string, string[]>) {
  rpcs.push({ fn, args });
  if (profilesMissing) return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.golf_player_profiles' } });
  if (profilesFail) return Promise.resolve({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } });
  const teams = args.p_team_ids ?? [];
  const ids = new Set([...(args.p_player_ids ?? []), ...(tables.golf_team_members ?? []).filter((m) => teams.includes(m.team_id as string)).map((m) => m.player_id as string)]);
  const data = (tables.golf_players ?? []).filter((p) => ids.has(p.id as string)).map((p) => ({ id: p.id, user_id: null, first_name: p.first_name, last_name: p.last_name, avatar_url: null, graduation_year: null, handicap: null, handicap_index: null }));
  return Promise.resolve({ data, error: null });
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from, rpc }) }));

import { loadCoachPlan, loadPlayerPlan, loadPlayerPractice } from '../practice-plan';

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
  rpcs.length = 0;
  ownRowOnly = null;
  profilesMissing = false;
  profilesFail = false;
  for (const k of Object.keys(tables)) delete tables[k];
  Object.assign(tables, {
    // RLS: a player reads no row of the plans table.
    golf_practice_plans: [],
    golf_practice_plan_versions: [{ plan_id: 'plan-1', version: 2, title: 'Thursday practice', event_id: 'ev-1', body: versionBody, published_at: '2026-11-04T12:00:00Z', is_live: true }],
    golf_practice_plan_lines: [{ plan_id: 'plan-1', version: 2, player_id: 'me', block_id: 'o', line: 'Wedges to 60' }],
    golf_events: [{ id: 'ev-1', start_time: '2026-11-05T19:00:00Z', end_time: '2026-11-05T21:00:00Z', team_id: 't-1', location: 'Lakeside' }],
    golf_teams: [{ id: 't-1', name: 'Demo Golf', timezone: 'America/New_York', organization_id: 'o-1' }],
    golf_team_members: [
      { team_id: 't-1', status: 'active', player_id: 'me' },
      { team_id: 't-1', status: 'active', player_id: 'mate' },
      { team_id: 't-1', status: 'active', player_id: 'other' },
      // Off the roster: the profile function still returns them (it reads every status), the plan page leaves them out.
      { team_id: 't-1', status: 'inactive', player_id: 'left' },
    ],
    golf_players: [
      { id: 'me', first_name: 'Maya', last_name: 'Reed' },
      { id: 'mate', first_name: 'Jonah', last_name: 'Bell' },
      { id: 'other', first_name: 'Theo', last_name: 'Quinn' },
      { id: 'left', first_name: 'Ada', last_name: 'Gone' },
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
    expect(page.data.group).toEqual({ name: 'B', me: 'Maya', mates: ['Jonah'] });
    // The line under the title is the day alone: the group is said once, by `group`.
    expect(page.data.context).toBe('Thursday');
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

/**
 * Re-audit 2026-11-12 (20261017005000): the plan page read its names from a `golf_players` embed on the roster. With the
 * teammate branch gone from `golf_players_select`, a player's sheet would have shown every group-mate as "—" and the
 * Practice card would have dropped them. The names now come through golf_player_profiles.
 */
describe('names on the plan come through golf_player_profiles, not a golf_players embed', () => {
  it('a player’s sheet names their group-mates through the profile function', async () => {
    const load = await loadPlayerPlan('plan-1', 'me');
    if (load.status !== 'ready') throw new Error('not ready');
    expect(load.plan.groups).toEqual([{ letter: 'B', names: ['Maya Reed', 'Jonah Bell'] }]);
    expect(rpcs).toEqual([{ fn: 'golf_player_profiles', args: { p_team_ids: ['t-1'] } }]);
    expect(reads.filter((r) => r.table === 'golf_players' || r.cols.includes('golf_players'))).toEqual([]);
  });

  it('with teammates’ golf_players rows unreadable, every group-mate is still named, never "—"', async () => {
    ownRowOnly = 'me';
    const load = await loadPlayerPlan('plan-1', 'me');
    if (load.status !== 'ready') throw new Error('not ready');
    expect(load.plan.groups).toEqual([{ letter: 'B', names: ['Maya Reed', 'Jonah Bell'] }]);
    expect(JSON.stringify(load.plan)).not.toContain('—');
    const page = await loadPlayerPractice('plan-1', 'me', new Date('2026-11-05T19:10:00Z'));
    if (page.status !== 'ready') throw new Error('not ready');
    expect(page.data.group).toEqual({ name: 'B', me: 'Maya', mates: ['Jonah'] });
  });

  it('before the function is deployed (PGRST202) the names come from the table, as they did', async () => {
    profilesMissing = true;
    const load = await loadPlayerPlan('plan-1', 'me');
    if (load.status !== 'ready') throw new Error('not ready');
    expect(load.plan.groups).toEqual([{ letter: 'B', names: ['Maya Reed', 'Jonah Bell'] }]);
    expect(reads.some((r) => r.table === 'golf_team_members' && r.cols.includes('golf_players('))).toBe(true);
  });

  it('a failed profile read never draws a sheet of blank names', async () => {
    profilesFail = true;
    expect((await loadPlayerPlan('plan-1', 'me')).status).not.toBe('ready');
    expect((await loadPlayerPractice('plan-1', 'me')).status).not.toBe('ready');
  });

  it('a coach’s “seen N of M” still counts the active roster, and names who opened it', async () => {
    tables.golf_practice_plans = [{ id: 'plan-1', team_id: 't-1', event_id: 'ev-1', title: 'Thursday practice', body: { v: 2, focus: 'Lag', notes: '', place: 'Lakeside', arrivalBufferMin: 15, bring: [], players: versionBody.players, groups: versionBody.groups, variants: { main: { blocks: versionBody.blocks }, rain: null } }, version: 2, status: 'published', published_version: 2, coach_why: {}, edited_after_publish: false }];
    tables.golf_practice_plan_opens = [{ plan_id: 'plan-1', player_id: 'me' }, { plan_id: 'plan-1', player_id: 'mate' }];
    const load = await loadCoachPlan('plan-1');
    if (load.status !== 'ready' || !load.coach) throw new Error(`expected a coach plan, got ${load.status}`);
    // Three active players: the inactive one the profile function also returns is not counted.
    expect(load.coach.status.seen).toEqual({ names: ['Maya Reed', 'Jonah Bell'], of: 3 });
    expect(JSON.stringify(load.plan)).not.toContain('Ada');
  });
});
