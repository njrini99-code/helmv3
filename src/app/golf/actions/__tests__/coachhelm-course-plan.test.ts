/**
 * Course plan actions (Slice 7c): flag off reads nothing, only a coach of the
 * player's team gets an answer, and the plan is built from the player's own
 * rounds on that course. Synthetic ids only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PLAYER = '11111111-1111-4111-8111-111111111111';
const COURSE = '22222222-2222-4222-8222-222222222222';
const OTHER_COURSE = '33333333-3333-4333-8333-333333333333';

const state = vi.hoisted(() => ({
  flagOn: true,
  user: { id: 'user-1' } as { id: string } | null,
  coach: { id: 'coach-1' } as { id: string } | null,
  player: { id: '11111111-1111-4111-8111-111111111111' } as { id: string } | null,
  playerError: null as { code: string; message: string } | null,
  eqFilters: [] as Array<{ table: string; column: string; value: unknown }>,
  staffTeams: ['team-1'] as string[],
  memberTeams: ['team-1'] as string[],
  rounds: [] as Array<Record<string, unknown>>,
  roundsError: null as { code: string; message: string } | null,
  holes: [] as Array<Record<string, unknown>>,
  shots: [] as Array<Record<string, unknown>>,
  tables: [] as string[],
  inFilters: {} as Record<string, unknown[]>,
  logServerError: vi.fn(async (..._args: unknown[]) => undefined),
  wrapped: [] as Array<{ name: string; meta: Record<string, unknown> }>,
}));

vi.mock('@/lib/flags/is-enabled', () => ({
  isFlagEnabled: (id: string) => id === 'coachhelm_course_plan_v1' && state.flagOn,
}));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (name: string, meta: Record<string, unknown>, fn: unknown) => {
    state.wrapped.push({ name, meta });
    return fn;
  },
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: state.logServerError }));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: () => undefined }));

function respond(table: string, range: [number, number] | null): { data: unknown; error: unknown } {
  const page = <T,>(rows: T[]) => (range ? rows.slice(range[0], range[1] + 1) : rows);
  switch (table) {
    case 'golf_coaches':
      return { data: state.coach, error: null };
    case 'golf_players':
      return state.playerError ? { data: null, error: state.playerError } : { data: state.player, error: null };
    case 'golf_team_members':
      return { data: state.memberTeams.map((team_id) => ({ team_id })), error: null };
    case 'golf_team_coach_staff':
      return { data: state.staffTeams.map((team_id) => ({ team_id })), error: null };
    case 'golf_rounds':
      return state.roundsError ? { data: null, error: state.roundsError } : { data: [...state.rounds].sort((a, b) => String(b.round_date).localeCompare(String(a.round_date))), error: null };
    case 'golf_holes':
      return { data: page(state.holes.filter((h) => (state.inFilters.golf_holes ?? []).includes(h.round_id))), error: null };
    case 'golf_shots':
      return { data: page(state.shots.filter((s) => (state.inFilters.golf_shots ?? []).includes(s.round_id))), error: null };
    default:
      throw new Error(`unexpected table ${table}`);
  }
}

function builder(table: string) {
  state.tables.push(table);
  let range: [number, number] | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: () => b,
    eq: (column: string, value: unknown) => {
      state.eqFilters.push({ table, column, value });
      return b;
    },
    order: () => b,
    limit: () => b,
    in: (_k: string, v: unknown[]) => {
      state.inFilters[table] = v;
      return b;
    },
    range: (from: number, to: number) => {
      range = [from, to];
      return b;
    },
    maybeSingle: () => Promise.resolve(respond(table, null)),
    then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(respond(table, range)).then(ok, bad),
  };
  return b;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (t: string) => builder(t),
  }),
}));

const { listCoursePlanCourses, getCoursePlan, listMyCoursePlanCourses, getMyCoursePlan } = await import('../coachhelm-course-plan');

function addRound(id: string, courseId: string | null, date: string, over: Record<number, number> = {}) {
  state.rounds.push({ id, course_id: courseId, course_name: courseId === COURSE ? 'Pine Hollow' : 'Elsewhere', round_date: date, holes_played: 18, total_score: 72, front_nine: 36, back_nine: 36, total_putts: 36 });
  for (let n = 1; n <= 18; n++) {
    state.holes.push({ id: `${id}-h${n}`, round_id: id, hole_number: n, par: 4, score: 4 + (over[n] ?? 0), putts: 2, penalty_strokes: 0, yardage: 380 });
    state.shots.push({ id: `${id}-s${n}`, round_id: id, hole_number: n, shot_number: 1, shot_type: 'tee', club_type: 'driver', miss_direction: over[n] ? 'right' : null, result: over[n] ? 'rough' : 'fairway', penalty_type: null, distance_to_hole_before: 380, distance_unit_before: 'yards' });
  }
}

beforeEach(() => {
  state.flagOn = true;
  state.user = { id: 'user-1' };
  state.coach = { id: 'coach-1' };
  state.player = { id: PLAYER };
  state.playerError = null;
  state.eqFilters = [];
  state.staffTeams = ['team-1'];
  state.memberTeams = ['team-1'];
  state.rounds = [];
  state.roundsError = null;
  state.holes = [];
  state.shots = [];
  state.tables = [];
  state.inFilters = {};
  state.logServerError.mockClear();
});

describe('course plan actions', () => {
  it('wraps both reads without the demo write guard, so the shared demo coach can open a plan', async () => {
    await import('../coachhelm-course-plan');
    expect(state.wrapped.map((w) => w.name).sort()).toEqual(['getCoursePlan', 'getMyCoursePlan', 'listCoursePlanCourses', 'listMyCoursePlanCourses']);
    for (const w of state.wrapped) expect(w.meta.demoSafe).toBeUndefined();
  });

  it('reads nothing with the flag off', async () => {
    state.flagOn = false;
    expect(await listCoursePlanCourses(PLAYER)).toEqual({ status: 'not_available' });
    expect(await getCoursePlan(PLAYER, COURSE)).toEqual({ status: 'not_available' });
    expect(state.tables).toEqual([]);
  });

  it('refuses a caller who does not coach the player, and a malformed id', async () => {
    state.staffTeams = ['team-9'];
    expect(await listCoursePlanCourses(PLAYER)).toEqual({ status: 'forbidden' });
    expect(state.tables).not.toContain('golf_rounds');
    state.staffTeams = ['team-1'];
    expect(await getCoursePlan(PLAYER, 'not-a-uuid')).toEqual({ status: 'forbidden' });
    expect(await listCoursePlanCourses('nope')).toEqual({ status: 'forbidden' });
    state.user = null;
    expect(await listCoursePlanCourses(PLAYER)).toEqual({ status: 'forbidden' });
  });

  it('lists only courses with three or more countable rounds', async () => {
    addRound('r1', COURSE, '2026-09-01');
    addRound('r2', COURSE, '2026-09-08');
    addRound('r3', COURSE, '2026-09-15');
    addRound('r4', OTHER_COURSE, '2026-09-20');
    addRound('r5', null, '2026-09-21');
    expect(await listCoursePlanCourses(PLAYER)).toEqual({ status: 'ok', courses: [{ courseId: COURSE, name: 'Pine Hollow', rounds: 3, lastPlayed: '2026-09-15' }] });
  });

  it('says failed, and logs, when the rounds read fails', async () => {
    state.roundsError = { code: '500', message: 'boom' };
    expect(await listCoursePlanCourses(PLAYER)).toEqual({ status: 'failed' });
    expect(state.logServerError).toHaveBeenCalledTimes(1);
  });

  it('builds the plan from the rounds on that course only, with shots read for those rounds', async () => {
    addRound('r1', COURSE, '2026-09-01', { 4: 1, 11: 2 });
    addRound('r2', COURSE, '2026-09-08', { 4: 2, 11: 1 });
    addRound('r3', COURSE, '2026-09-15', { 4: 1, 11: 1 });
    addRound('r4', OTHER_COURSE, '2026-09-20', { 4: 3, 11: 3 });
    const res = await getCoursePlan(PLAYER, COURSE);
    expect(state.inFilters.golf_shots).toEqual(['r3', 'r2', 'r1']);
    expect(state.inFilters.golf_holes).toEqual(['r3', 'r2', 'r1', 'r4']);
    if (res.status !== 'ok' || res.plan.status !== 'plan') throw new Error('expected a plan');
    expect(res.plan.rounds).toBe(3);
    expect(res.plan.coach.lines[0]).toBe('Holes 4 and 11: all 6 tee shots missed right, driver on 6 of 6. Plan: favour the left half off the tee. 2.7 over par a round on those two.');
  });

  it('answers too_few for a course the player has not played', async () => {
    addRound('r1', OTHER_COURSE, '2026-09-01');
    expect(await getCoursePlan(PLAYER, COURSE)).toEqual({ status: 'ok', plan: { status: 'too_few', courseName: 'This course', rounds: 0 } });
  });
});

describe("the player's own course plan (chs-21)", () => {
  const SOMEONE_ELSE = '44444444-4444-4444-8444-444444444444';

  it('reads nothing with the flag off', async () => {
    state.flagOn = false;
    expect(await listMyCoursePlanCourses()).toEqual({ status: 'not_available' });
    expect(await getMyCoursePlan(COURSE)).toEqual({ status: 'not_available' });
    expect(state.tables).toEqual([]);
  });

  it('takes the player from the session, never from the caller, and reads only their rounds', async () => {
    state.player = { id: SOMEONE_ELSE };
    addRound('r1', COURSE, '2026-09-01');
    addRound('r2', COURSE, '2026-09-08');
    addRound('r3', COURSE, '2026-09-15');
    await listMyCoursePlanCourses();
    expect(state.eqFilters).toContainEqual({ table: 'golf_players', column: 'user_id', value: 'user-1' });
    const roundFilters = state.eqFilters.filter((f) => f.table === 'golf_rounds' && f.column === 'player_id');
    expect(roundFilters.map((f) => f.value)).toEqual([SOMEONE_ELSE]);
    // The coach check is never the way in for a player.
    expect(state.tables).not.toContain('golf_team_coach_staff');
    // The actions take no player id at all: an extra argument cannot point them at another player.
    expect(listMyCoursePlanCourses.length).toBe(0);
    expect(getMyCoursePlan.length).toBe(1);
  });

  it('refuses a signed-out caller and a user with no player row (a coach), and says failed when the lookup fails', async () => {
    state.user = null;
    expect(await listMyCoursePlanCourses()).toEqual({ status: 'forbidden' });
    state.user = { id: 'user-1' };
    state.player = null;
    expect(await listMyCoursePlanCourses()).toEqual({ status: 'forbidden' });
    expect(await getMyCoursePlan(COURSE)).toEqual({ status: 'forbidden' });
    expect(state.tables).not.toContain('golf_rounds');
    state.playerError = { code: '500', message: 'boom' };
    expect(await listMyCoursePlanCourses()).toEqual({ status: 'failed' });
    expect(state.logServerError).toHaveBeenCalledTimes(1);
  });

  it("answers the player's lines in their voice, with the thin line, and none of the coach's copy", async () => {
    addRound('r1', COURSE, '2026-09-01', { 4: 1, 11: 2 });
    addRound('r2', COURSE, '2026-09-08', { 4: 2, 11: 1 });
    addRound('r3', COURSE, '2026-09-15', { 4: 1, 11: 1 });
    const res = await getMyCoursePlan(COURSE);
    if (res.status !== 'ok' || res.plan.status !== 'plan') throw new Error('expected a plan');
    expect(res.plan.title).toBe('At Pine Hollow');
    expect(res.plan.lines[0]).toBe('4 and 11: aim at the left half off the tee. All 6 tee shots there missed right.');
    expect(res.plan.thinLine).toBe('From your 3 rounds here, so take it as a reminder, not a read.');
    expect(res.plan).not.toHaveProperty('coach');
    expect(JSON.stringify(res)).not.toMatch(/Plan:|Course plan:/);
    expect(await getMyCoursePlan('not-a-uuid')).toEqual({ status: 'forbidden' });
  });
});
