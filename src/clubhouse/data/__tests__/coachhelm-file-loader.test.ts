import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FieldRoundInput } from '@/lib/coachhelm/v3/field-day/field';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';

/**
 * Lenses W-LNS-1, W-LNS-4, W-LNS-5, W-LNS-9, W-LNS-10, S-FILE 31 and S-BOARD 6 to 8: the coach's own plan and track reach the coach's file only, through the
 * session client; the lens and the player's "Your week" carry neither, and neither carries a teammate's figure.
 */

const SECRET_NOTE = 'secret-coach-note';
const SECRET_TRACK = 'secret-track-title';
const SECRET_DISMISSED = 'secret-dismissed-title';
const TEAMMATE_SCORE = 11;

type Res = { data: unknown; error: unknown };
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Res>,
  calls: [] as Array<{ table: string; filters: Array<[string, string, unknown]> }>,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from(table: string) {
      const call = { table, filters: [] as Array<[string, string, unknown]> };
      db.calls.push(call);
      const res = () => db.tables[table] ?? { data: [], error: null };
      const chain: Record<string, unknown> = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        range: () => chain,
        eq: (c: string, v: unknown) => (call.filters.push(['eq', c, v]), chain),
        gte: (c: string, v: unknown) => (call.filters.push(['gte', c, v]), chain),
        in: (c: string, v: unknown) => (call.filters.push(['in', c, v]), chain),
        not: () => chain,
        gt: () => chain,
        maybeSingle: async () => {
          const r = res();
          return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
        },
        then: (ok: (r: Res) => unknown) => Promise.resolve(res()).then(ok),
      };
      return chain;
    },
  })),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('the file reads with the session client, never the admin client');
  },
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
const flags = vi.hoisted(() => ({ on: new Set<string>() }));
vi.mock('@/lib/flags', () => ({ isFlagEnabled: (name: string) => flags.on.has(name) }));
vi.mock('@/lib/coachhelm/v3/read/flag', () => ({ isReadEnabled: () => true }));
const field = vi.hoisted(() => ({ rounds: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/field-day/loader', () => ({ loadTeamFieldRounds: field.rounds }));
vi.mock('@/lib/coachhelm/v3/effectiveness/attribution-read', () => ({ readAttributionForPlayer: vi.fn(async () => ({ ok: true, rows: [] })) }));
vi.mock('@/lib/coachhelm/focus-areas/practice-log-loader', () => ({ loadFocusAreaPracticeLogData: vi.fn(async () => ({})) }));
const goals = vi.hoisted(() => ({ active: vi.fn(), done: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/goals/loader', () => ({ loadActiveGoals: goals.active, loadRecentlyAchievedGoals: goals.done }));
vi.mock('../coachhelm', () => ({
  loadPlayerHelmGate: vi.fn(async () => ({ status: 'on' })),
  loadProposals: vi.fn(async () => ({ list: [], failed: false })),
  playerTeam: vi.fn(async () => ({ teamId: 'team-1' })),
  roundsToGo: vi.fn(async () => 3),
  topInsights: vi.fn(async () => new Map()),
}));
const dive = vi.hoisted(() => ({ player: vi.fn(), coach: vi.fn() }));
vi.mock('../coachhelm-dive', () => ({ playerDiveCore: dive.player }));
vi.mock('../coachhelm-player', () => ({ coachDiveCore: dive.coach, loadCoachPlayerStanding: vi.fn(async () => ({ status: 'failed' })) }));
vi.mock('../coachhelm-standing', () => ({ loadPlayerStanding: vi.fn(async () => ({ status: 'failed' })), readStandingRows: vi.fn(async () => ({ ok: true, rows: [] })) }));
vi.mock('../season', async (orig) => ({ ...(await orig<typeof import('../season')>()), loadTeamZone: vi.fn(async () => 'America/New_York') }));

import { roundsToGo } from '../coachhelm';
import { readStandingRows } from '../coachhelm-standing';
import { loadCoachPlayerFile, loadFileField, loadFileIntent, loadFilePlan, loadPlayerYourWeek } from '../coachhelm-file';
import type { ChCoachPlayerScope } from '../coachhelm-player';

const scope = { coachId: 'coach-1', teamId: 'team-1', playerId: 'p1', head: { first: 'Eli', name: 'Eli Stone' } } as unknown as ChCoachPlayerScope;
const ready = { status: 'ready', data: { list: [], cleared: [], rounds: 8 } };

const round = (player_id: string, score_to_par: number): FieldRoundInput => ({ round_id: `r-${player_id}`, player_id, team_id: 'team-1', date: '2026-10-05', course_id: 'c1', score_to_par, holes: 18 });
const FIELD_OF_FIVE = [round('p1', 2), round('mate-1', TEAMMATE_SCORE), round('mate-2', 4), round('mate-3', 6), round('mate-4', 8)];

beforeEach(() => {
  db.tables = {};
  db.calls = [];
  flags.on = new Set(['coachhelm_team_pattern_v1']);
  field.rounds.mockReset();
  goals.active.mockReset().mockResolvedValue([]);
  goals.done.mockReset().mockResolvedValue([]);
  dive.player.mockReset().mockResolvedValue({ load: ready, raw: new Map() });
  dive.coach.mockReset().mockResolvedValue({ load: ready, raw: new Map(), lens: [] });
});

describe('loadFileIntent (W-LNS-9)', () => {
  it('no row is No plan set: null, never a made-up default', async () => {
    db.tables.golf_coach_player_intent = { data: null, error: null };
    await expect(loadFileIntent(scope)).resolves.toBeNull();
  });

  it('a failed read is undefined, so the card says so instead of No plan set', async () => {
    db.tables.golf_coach_player_intent = { data: null, error: { message: 'down' } };
    await expect(loadFileIntent(scope)).resolves.toBeUndefined();
  });

  it('reads this coach and this player only, and maps the row as written', async () => {
    db.tables.golf_coach_player_intent = { data: { narrative_goal: 'develop', alert_posture: 'quiet', highlight_categories: null, notes: SECRET_NOTE }, error: null };
    await expect(loadFileIntent(scope)).resolves.toEqual({ aim: 'develop', alerts: 'quiet', watching: [], note: SECRET_NOTE });
    expect(db.calls[0]?.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'coach_id', 'coach-1'],
        ['eq', 'player_id', 'p1'],
      ]),
    );
  });
});

describe('loadFilePlan (W-LNS-1, W-LNS-5)', () => {
  const focus = { id: 'f1', title: 'Approach', status: 'active', created_at: '2026-10-01T12:00:00Z', started_at: '2026-10-02T12:00:00Z', updated_at: null, from_insight_id: 'ins-1', drill_ids: null };
  const goal = (over: Partial<Goal>) => ({ id: 'g', title: 'g', player_id: 'p1', creator_role: 'coach', shared_with_coach: false, baseline_value: 1, target_value: 2, snapshots: [], origin_insight_id: null, ...over }) as Goal;

  it('Shown reads the player feed only, at or after the focus was made', async () => {
    db.tables.golf_player_focus_areas = { data: [focus], error: null };
    db.tables.golf_insight_exposure = { data: [], error: null };
    db.tables.golf_coaches = { data: { full_name: 'Sam Reed' }, error: null };
    const plan = await loadFilePlan(scope, 'America/New_York');
    expect(plan?.coach).toBe('Coach Reed');
    const seen = db.calls.find((c) => c.table === 'golf_insight_exposure');
    expect(seen?.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'insight_id', 'ins-1'],
        ['eq', 'surface', 'player_feed'],
        ['gte', 'shown_at', focus.created_at],
      ]),
    );
  });

  it('a private player goal never reaches the coach, even as the only goal', async () => {
    db.tables.golf_player_focus_areas = { data: [focus], error: null };
    goals.active.mockResolvedValue([goal({ title: 'private-goal', creator_role: 'player', shared_with_coach: false })]);
    const plan = await loadFilePlan(scope, 'America/New_York');
    expect(plan?.goal).toBeNull();
    expect(JSON.stringify(plan)).not.toContain('private-goal');
  });

  it('a shared player goal and a coach goal do, and the goal made from this read wins', async () => {
    db.tables.golf_player_focus_areas = { data: [focus], error: null };
    goals.active.mockResolvedValue([goal({ title: 'shared', creator_role: 'player', shared_with_coach: true }), goal({ title: 'from-read', origin_insight_id: 'ins-1' })]);
    expect((await loadFilePlan(scope, 'America/New_York'))?.goal?.title).toBe('from-read');
  });

  it('a failed exposure read is a failed plan, never a false tick', async () => {
    db.tables.golf_player_focus_areas = { data: [{ ...focus, status: 'proposed' }], error: null };
    db.tables.golf_insight_exposure = { data: null, error: { message: 'down' } };
    await expect(loadFilePlan(scope, 'America/New_York')).resolves.toBeNull();
  });
});

describe('loadFileField (W-LNS-10)', () => {
  const at = { teamId: 'team-1', playerId: 'p1', lastRound: '2026-10-05' };

  it('the team-pattern flag off never calls the loader', async () => {
    flags.on = new Set();
    await expect(loadFileField(at, { role: 'coach', first: 'Eli' }, 'UTC')).resolves.toBeNull();
    expect(field.rounds).not.toHaveBeenCalled();
  });

  it('a coach gets the others as bare numbers; a player gets dots null', async () => {
    field.rounds.mockResolvedValue(FIELD_OF_FIVE);
    const coach = await loadFileField(at, { role: 'coach', first: 'Eli' }, 'UTC');
    expect(coach?.dots).toEqual([4, 6, 8, TEAMMATE_SCORE]);
    const player = await loadFileField(at, { role: 'player' }, 'UTC');
    expect(player?.dots).toBeNull();
  });

  it('a field under five gives a player nothing', async () => {
    field.rounds.mockResolvedValue(FIELD_OF_FIVE.slice(0, 4));
    await expect(loadFileField(at, { role: 'player' }, 'UTC')).resolves.toBeNull();
  });

  it('a failed read is undefined, so the card can say so', async () => {
    field.rounds.mockResolvedValue(null);
    await expect(loadFileField(at, { role: 'player' }, 'UTC')).resolves.toBeUndefined();
  });
});

describe('the coach file and its lens (W-LNS-4, S-FILE 31)', () => {
  function seedCoachOnly() {
    db.tables.golf_coach_player_intent = { data: { narrative_goal: 'develop', alert_posture: 'quiet', highlight_categories: [], notes: SECRET_NOTE }, error: null };
    db.tables.golf_player_focus_areas = { data: [{ id: 'f1', title: SECRET_TRACK, status: 'proposed', outcome_status: 'improved', created_at: '2026-10-01T12:00:00Z', started_at: null, from_insight_id: null, drill_ids: null, completed_at: null }], error: null };
    db.tables.golf_coach_insights = { data: [{ id: 'd1', title: SECRET_DISMISSED, lifecycle_state: 'detected' }], error: null };
    db.tables.golf_rounds = { data: [], error: null };
  }

  it('the coach cards hold the plan and track; the lens cards hold neither, nor the dismissed reads', async () => {
    seedCoachOnly();
    const load = await loadCoachPlayerFile({ scope });
    if (load.status !== 'ready') throw new Error(`expected ready, got ${load.status}`);
    expect(load.data.cards.intent?.note).toBe(SECRET_NOTE);
    expect(load.data.cards.dismissed?.[0]?.title).toBe(SECRET_DISMISSED);
    const lens = load.data.lens;
    expect(lens).not.toBeNull();
    expect(Object.keys(lens ?? {})).not.toContain('intent');
    expect(Object.keys(lens ?? {})).not.toContain('track');
    expect(lens?.dismissed).toEqual([]);
    expect(JSON.stringify(lens)).not.toContain(SECRET_NOTE);
    expect(JSON.stringify(lens)).not.toContain(SECRET_DISMISSED);
  });

  it('the lens field card is the player view: no dots, whatever the coach card has', async () => {
    seedCoachOnly();
    const rounds = FIELD_OF_FIVE;
    field.rounds.mockResolvedValue(rounds);
    db.tables.golf_rounds = { data: [{ round_date: '2026-10-05', total_score: 74, course_name: 'Hilltop' }], error: null };
    dive.coach.mockResolvedValue({ load: { status: 'ready', data: { list: [], cleared: [], rounds: 8, lastRound: '2026-10-05' } }, raw: new Map(), lens: [] });
    const load = await loadCoachPlayerFile({ scope: { ...scope, lastRound: '2026-10-05' } as unknown as ChCoachPlayerScope });
    if (load.status !== 'ready') throw new Error(`expected ready, got ${load.status}`);
    expect(load.data.cards.field?.dots).toEqual([4, 6, 8, TEAMMATE_SCORE]);
    expect(load.data.lens?.field?.dots).toBeNull();
  });

  it('a failed intent read is flagged, not drawn as empty', async () => {
    db.tables.golf_coach_player_intent = { data: null, error: { message: 'down' } };
    db.tables.golf_rounds = { data: [], error: null };
    db.tables.golf_coach_insights = { data: [], error: null };
    const load = await loadCoachPlayerFile({ scope });
    if (load.status !== 'ready') throw new Error(`expected ready, got ${load.status}`);
    expect(load.data.failed.intent).toBe(true);
    expect(load.data.cards.intent).toBeNull();
  });
});

describe('the player Your week (S-BOARD 6 to 8, W-LNS-15)', () => {
  it('never reads the coach-only tables, and its payload has no plan, track or dots', async () => {
    db.tables.golf_rounds = { data: [{ round_date: '2026-10-05', total_score: 74, course_name: 'Hilltop', total_penalties: 0 }], error: null };
    db.tables.golf_player_focus_areas = { data: [], error: null };
    field.rounds.mockResolvedValue(FIELD_OF_FIVE);
    const { load } = await loadPlayerYourWeek({ playerId: 'p1' });
    if (load.status !== 'ready') throw new Error(`expected ready, got ${load.status}`);
    const tables = db.calls.map((c) => c.table);
    expect(tables).not.toContain('golf_coach_player_intent');
    expect(tables).not.toContain('golf_coach_insights');
    expect(Object.keys(load.data.cards)).not.toContain('intent');
    expect(Object.keys(load.data.cards)).not.toContain('track');
    expect(load.data.cards.field?.dots).toBeNull();
  });

  it('F-0013 its own reads start beside the feed, not after it: the standings and the rounds are in flight while the feed is still loading', async () => {
    db.tables.golf_rounds = { data: [], error: null };
    vi.mocked(roundsToGo).mockClear();
    vi.mocked(readStandingRows).mockClear();
    let landed!: () => void;
    dive.player.mockImplementation(() => new Promise((resolve) => (landed = () => resolve({ load: ready, raw: new Map() }))));
    const pending = loadPlayerYourWeek({ playerId: 'p1' });
    // The gate answers first; then the feed is asked, and the reads that need only the player are sent with it.
    await vi.waitFor(() => expect(dive.player).toHaveBeenCalled());
    await vi.waitFor(() => expect(roundsToGo).toHaveBeenCalled());
    expect(readStandingRows).toHaveBeenCalledTimes(1);
    expect(db.calls.map((c) => c.table)).toContain('golf_rounds');
    // Nothing is drawn until the feed lands, and what the feed lands on is still the page.
    landed();
    const { load } = await pending;
    expect(load.status).toBe('ready');
  });

  it('F-0013 a feed that is not ready is that page, and the reads started beside it change nothing', async () => {
    dive.player.mockResolvedValue({ load: { status: 'failed' }, raw: new Map() });
    const { load } = await loadPlayerYourWeek({ playerId: 'p1' });
    expect(load).toEqual({ status: 'failed' });
  });

  it('with no coach name to hand the plan says Your coach', async () => {
    db.tables.golf_rounds = { data: [], error: null };
    const { load } = await loadPlayerYourWeek({ playerId: 'p1' });
    if (load.status !== 'ready') throw new Error(`expected ready, got ${load.status}`);
    expect(load.data.cards.plan?.coach).toBe('Your coach');
  });
});

describe('Where the strokes go reads the rounds, the one strokes-gained source', () => {
  // Rounds as `golf_rounds` holds them: hole by hole (the nines add up), with strokes gained.
  const sgRound = (player_id: string, i: number, sg: number) => ({
    id: `${player_id}-r${i}`,
    player_id,
    round_date: new Date(Date.now() - (i + 1) * 3 * 86_400_000).toISOString().slice(0, 10),
    round_type: 'tournament',
    status: 'completed',
    holes_played: 18,
    total_score: 74,
    score_to_par: 2,
    front_nine: 37,
    back_nine: 37,
    total_putts: 31,
    total_penalties: 0,
    course_name: 'Hilltop',
    strokes_gained_total: sg,
    strokes_gained_tee: sg / 4,
    strokes_gained_approach: sg / 4,
    strokes_gained_around_green: sg / 4,
    strokes_gained_putting: sg / 4,
  });
  const MATES = ['mate-1', 'mate-2', 'mate-3', 'mate-4'];
  const all = ['p1', ...MATES].flatMap((id, n) => Array.from({ length: 4 }, (_, i) => sgRound(id, i, id === 'p1' ? -2 : -4 - n)));

  it('a player’s own page asks for their own rounds only, and carries no team figure', async () => {
    // Even if the database handed back teammates’ rounds, none is asked for and none is drawn.
    db.tables.golf_rounds = { data: all.filter((r) => r.player_id === 'p1'), error: null };
    db.tables.golf_team_members = { data: MATES.map((player_id) => ({ player_id })), error: null };
    const { load } = await loadPlayerYourWeek({ playerId: 'p1' });
    if (load.status !== 'ready') throw new Error(`expected ready, got ${load.status}`);
    expect(db.calls.some((c) => c.table === 'golf_team_members')).toBe(false);
    for (const c of db.calls.filter((x) => x.table === 'golf_rounds')) for (const [op, col, v] of c.filters) if (op === 'in' && col === 'player_id') expect(v).toEqual(['p1']);
    const sg = load.data.cards.sg;
    expect(sg?.rows.map((r) => r.figure)).toEqual(['−0.5', '−0.5', '−0.5', '−0.5']);
    expect(sg?.rows.every((r) => r.team == null)).toBe(true);
    expect(sg?.hasTeam).toBe(false);
    expect(sg?.source).toBe('Last 4 rounds · strokes per round');
    expect(load.data.failed.sg).toBeUndefined();
    // No shot rows for these rounds: their strokes gained was estimated from the scorecard, and the card carries that.
    expect(sg?.mix).toEqual({ measured: 0, estimated: 4, estimatedCounted: true });
    // The shots asked about are the player's own rounds, never a teammate's.
    for (const c of db.calls.filter((x) => x.table === 'golf_shots')) for (const [op, col, v] of c.filters) if (op === 'in' && col === 'round_id') expect((v as string[]).every((id) => id.startsWith('p1-'))).toBe(true);
  });

  it('the card carries how many of the player’s rounds were shot-tracked, on the coach’s file and on the lens alike', async () => {
    db.tables.golf_rounds = { data: all, error: null };
    db.tables.golf_team_members = { data: MATES.map((player_id) => ({ player_id })), error: null };
    // Three of the player's four rounds have a usable shot.
    db.tables.golf_shots = { data: ['p1-r0', 'p1-r1', 'p1-r2'].map((round_id) => ({ round_id, distance_to_hole_after: 100, putt_made: null, result: null })), error: null };
    const load = await loadCoachPlayerFile({ scope });
    if (load.status !== 'ready') throw new Error(`expected ready, got ${load.status}`);
    expect(load.data.cards.sg?.mix).toEqual({ measured: 3, estimated: 1, estimatedCounted: true });
    expect(load.data.lens?.sg?.mix).toEqual({ measured: 3, estimated: 1, estimatedCounted: true });
    // The figures themselves are untouched: every round still counts.
    expect(load.data.cards.sg?.rows[0]?.strokes).toBeCloseTo(-0.5, 9);
    delete db.tables.golf_shots;
  });

  it('a coach’s file reads the active roster for the team’s tick; the lens, the player’s page, has none', async () => {
    db.tables.golf_rounds = { data: all, error: null };
    db.tables.golf_team_members = { data: MATES.map((player_id) => ({ player_id })), error: null };
    const load = await loadCoachPlayerFile({ scope });
    if (load.status !== 'ready') throw new Error(`expected ready, got ${load.status}`);
    const roster = db.calls.find((c) => c.table === 'golf_team_members');
    expect(roster?.filters).toEqual(expect.arrayContaining([['eq', 'team_id', 'team-1'], ['eq', 'status', 'active']]));
    const sg = load.data.cards.sg;
    expect(sg?.rows[0]?.strokes).toBeCloseTo(-0.5, 9);
    // The team’s tick is the roster’s rounds pooled (Team stats’ figure): (−2 −5 −6 −7 −8) / 5 a round, a quarter of it a leg.
    expect(sg?.rows[0]?.team).toBeCloseTo(-1.4, 9);
    expect(sg?.hasTeam).toBe(true);
    expect(load.data.lens?.sg?.rows.every((r) => r.team == null)).toBe(true);
    expect(load.data.lens?.sg?.rows.map((r) => r.strokes)).toEqual(sg?.rows.map((r) => r.strokes));
  });

  it('a failed rounds read is a failed card, never an empty one', async () => {
    db.tables.golf_rounds = { data: null, error: { message: 'down' } };
    const { load } = await loadPlayerYourWeek({ playerId: 'p1' });
    if (load.status !== 'ready') throw new Error(`expected ready, got ${load.status}`);
    expect(load.data.cards.sg).toBeNull();
    expect(load.data.failed.sg).toBe(true);
  });
});
