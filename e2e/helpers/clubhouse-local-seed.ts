/**
 * Seeds (and removes) a throwaway golf player for the Clubhouse round e2e, on a LOCAL Supabase only.
 *
 * Swap audit F-06: `golf-round.spec.ts` writes to whatever project its env points at, which has been production
 * (37 stray rounds, 2026-08-20). This helper refuses any Supabase URL that is not 127.0.0.1 or localhost, creates its
 * own user, team, membership and course through the local service role, and `removeSeed` deletes all of it (rounds
 * included), so a run leaves nothing behind.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';
import { tryGetSecretKey } from '../../src/lib/supabase/keys.mjs';
import { PAR_LAYOUTS, genRound, makeRng, yardsFor, type GenRound, type RoundShape } from './clubhouse-team-data';

export function localSupabase(): { url: string; serviceKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  // The repo's one reader of the secret key (Review Gate: no direct env read outside it).
  const serviceKey = tryGetSecretKey().key ?? '';
  if (!url || !serviceKey) return null;
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  return host === '127.0.0.1' || host === 'localhost' ? { url, serviceKey } : null;
}

/** The local database's connection string; refuses a host that is not 127.0.0.1 or localhost. `SUPABASE_DB_URL` overrides the stack's default. */
function localDbUrl(): string {
  if (!localSupabase()) throw new Error('clubhouse-local-seed: refusing a Supabase that is not local');
  const dbUrl = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const dbHost = new URL(dbUrl).hostname;
  if (dbHost !== '127.0.0.1' && dbHost !== 'localhost') throw new Error('clubhouse-local-seed: refusing a database that is not local');
  return dbUrl;
}

function adminClient(): SupabaseClient {
  const local = localSupabase();
  if (!local) throw new Error('clubhouse-local-seed: refusing a Supabase that is not local');
  return createClient(local.url, local.serviceKey, { auth: { persistSession: false } });
}

export interface SeedIds {
  email: string;
  password: string;
  userId: string;
  playerId: string;
  teamId: string;
  courseId: string;
  teeId: string;
}

export interface SeededPlayer extends SeedIds {
  courseName: string;
}

async function must<T>(label: string, p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`seed ${label}: ${JSON.stringify(error)}`);
  return data;
}

/** The seeded player's rounds, newest first, read with the service role. */
export async function seededRounds(playerId: string): Promise<Array<{ id: string; status: string; total_score: number | null }>> {
  return must(
    'rounds',
    adminClient().from('golf_rounds').select('id, status, total_score').eq('player_id', playerId).order('created_at', { ascending: false }),
  ) as Promise<Array<{ id: string; status: string; total_score: number | null }>>;
}

/** Scored holes of one round. */
export async function scoredHoles(roundId: string): Promise<number> {
  const rows = (await must('holes', adminClient().from('golf_holes').select('hole_number, score').eq('round_id', roundId))) as Array<{ score: number | null }>;
  return rows.filter((h) => h.score != null).length;
}

/**
 * Deletes everything a seed created, rounds included, and throws if anything is left. Safe to call twice.
 * It goes through a direct connection to the LOCAL database with triggers off: a completed round's holes and shots
 * are locked by the lifecycle guards (as they should be for any app caller), and deleting a hole recomputes the round
 * as its player. `SUPABASE_DB_URL` overrides the local default.
 */
export async function removeSeed(ids: SeedIds): Promise<void> {
  const db = new pg.Client({ connectionString: localDbUrl() });
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local session_replication_role = 'replica'");
    const rounds = 'select id from golf_rounds where player_id = $1';
    await db.query(`delete from golf_shots where round_id in (${rounds})`, [ids.playerId]);
    await db.query(`delete from golf_holes where round_id in (${rounds})`, [ids.playerId]);
    await db.query('delete from golf_rounds where player_id = $1', [ids.playerId]);
    await db.query('delete from golf_team_members where player_id = $1', [ids.playerId]);
    await db.query('delete from golf_players where id = $1', [ids.playerId]);
    await db.query('delete from golf_teams where id = $1', [ids.teamId]);
    await db.query('delete from golf_course_tee_holes where tee_id = $1', [ids.teeId]);
    await db.query('delete from golf_course_tees where id = $1', [ids.teeId]);
    await db.query('delete from golf_courses where id = $1', [ids.courseId]);
    await db.query('delete from auth.users where id = $1', [ids.userId]);
    // Replica mode skips the cascade from auth.users, which left a public.users row behind on every run.
    await db.query('delete from public.users where id = $1', [ids.userId]);
    await db.query('commit');
    const left = await db.query('select count(*)::int as n from golf_players where id = $1', [ids.playerId]);
    if (left.rows[0].n !== 0) throw new Error('cleanup: the seeded player is still there');
  } catch (err) {
    await db.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    await db.end();
  }
}

export async function seedClubhousePlayer(): Promise<SeededPlayer> {
  const admin = adminClient();
  const tag = randomBytes(4).toString('hex');
  const email = `e2e-ch-round-${tag}@example.test`;
  const password = `E2e-${randomBytes(12).toString('base64url')}`;
  const courseName = `E2E Clubhouse Links ${tag}`;

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'player', sport: 'golf', first_name: 'Eddie', last_name: 'Tester' },
  });
  if (created.error || !created.data.user) throw new Error(`seed user: ${created.error?.message}`);

  const ids: SeedIds = {
    email,
    password,
    userId: created.data.user.id,
    playerId: randomUUID(),
    teamId: randomUUID(),
    courseId: randomUUID(),
    teeId: randomUUID(),
  };

  try {
    await must('team', admin.from('golf_teams').insert({ id: ids.teamId, name: `E2E Team ${tag}`, join_code: `E2E${tag}`.toUpperCase() }));
    await must(
      'player',
      admin.from('golf_players').insert({ id: ids.playerId, user_id: ids.userId, first_name: 'Eddie', last_name: 'Tester', onboarding_completed: true }),
    );
    await must('membership', admin.from('golf_team_members').insert({ team_id: ids.teamId, player_id: ids.playerId, status: 'active' }));
    await must('course', admin.from('golf_courses').insert({ id: ids.courseId, name: courseName, city: 'Testville', state: 'NC' }));
    await must('tee', admin.from('golf_course_tees').insert({ id: ids.teeId, course_id: ids.courseId, tee_name: 'White', normalized_tee_name: 'white' }));
    await must(
      'holes',
      admin
        .from('golf_course_tee_holes')
        .insert(Array.from({ length: 18 }, (_, i) => ({ tee_id: ids.teeId, hole_number: i + 1, par: 4, yardage: 380 }))),
    );
  } catch (err) {
    await removeSeed(ids);
    throw err;
  }

  return { ...ids, courseName };
}

// ───────────────────────────── a whole team, for the Clubhouse perf harness ─────────────────────────────

export interface SeedTeamOptions {
  /** Players on the team. Default 8. */
  players?: number;
  /** Completed rounds per player; every third player has six more, so "vs. previous 10" has a previous 10 to read. Default 12. */
  roundsPerPlayer?: number;
  /** Rounds are spread over this many days back from today. Default 120 (it crosses the 1 August season start). */
  days?: number;
  /** PRNG seed: the same seed gives the same scores. Default 20261001. */
  seed?: number;
}

export interface SeededTeamPlayer {
  playerId: string;
  userId: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  rounds: number;
}

export interface SeededTeam {
  tag: string;
  teamId: string;
  teamName: string;
  orgId: string;
  coach: { userId: string; coachId: string; email: string; password: string };
  players: SeededTeamPlayer[];
  courseIds: string[];
  teeIds: string[];
  qualifierId: string;
  conversationId: string;
  eventIds: string[];
  roundIds: string[];
  /** Every auth user the seed made (the coach and the players). */
  userIds: string[];
  counts: { rounds: number; holes: number; shots: number; events: number };
}

const FIRST = ['Theo', 'Eli', 'Cole', 'Mason', 'Jonah', 'Owen', 'Reid', 'Grant', 'Nolan', 'Beck', 'Wade', 'Finn'];
const LAST = ['Marsh', 'Navarro', 'Hendry', 'Pruitt', 'Whitaker', 'Calloway', 'Dalton', 'Ellery', 'Voss', 'Larkin', 'Brandt', 'Ortega'];
const COURSES = ['Perf Pines GC', 'Perf Ridge CC', 'Perf Harbor Links'];
const TZ = 'America/New_York';

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's calendar date in the team's timezone, as the app computes it. */
function localToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return ymd(new Date(Date.UTC(y!, m! - 1, d! + n)));
}

async function bulk(db: pg.Client, table: string, cols: string[], rows: object[]): Promise<void> {
  if (!rows.length) return;
  const list = cols.join(', ');
  await db.query(`insert into ${table} (${list}) select ${list} from json_populate_recordset(null::${table}, $1::json)`, [JSON.stringify(rows)]);
}

/** The columns (and the ids to look for in them) the cleanup sweeps for; a seed's ids are random UUIDs, so a hit is always the seed's own row. */
function sweepColumns(ids: SeededTeam): Array<[string, string[]]> {
  return [
    ['round_id', ids.roundIds],
    ['player_id', ids.players.map((p) => p.playerId)],
    ['coach_id', [ids.coach.coachId]],
    ['team_id', [ids.teamId]],
    ['qualifier_id', [ids.qualifierId]],
    ['event_id', ids.eventIds],
    ['conversation_id', [ids.conversationId]],
    ['course_id', ids.courseIds],
    ['tee_id', ids.teeIds],
    ['user_id', ids.userIds],
  ];
}

/** The entity tables themselves, by `id`. */
function entityTables(ids: SeededTeam): Array<[string, string[]]> {
  return [
    ['golf_rounds', ids.roundIds],
    ['golf_players', ids.players.map((p) => p.playerId)],
    ['golf_coaches', [ids.coach.coachId]],
    ['golf_teams', [ids.teamId]],
    ['golf_qualifiers', [ids.qualifierId]],
    ['golf_events', ids.eventIds],
    ['golf_conversations', [ids.conversationId]],
    ['golf_course_tees', ids.teeIds],
    ['golf_courses', ids.courseIds],
    ['organizations', [ids.orgId]],
  ];
}

async function tablesWith(db: pg.Client, col: string): Promise<string[]> {
  const res = await db.query(
    `select c.table_name from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = $1 and t.table_type = 'BASE TABLE'`,
    [col],
  );
  return res.rows.map((r) => r.table_name as string);
}

/**
 * Deletes everything `seedClubhouseTeam` created and throws if anything is left. Safe to call twice, and with a partial seed.
 * Direct connection to the LOCAL database with triggers off (completed rounds are locked for every app caller), so it sweeps every
 * public table that carries one of the seed's ids instead of relying on cascades; then it removes the auth users with triggers on
 * (their cascade clears public.users and the identities) and checks that nothing refers to the seed any more.
 */
export async function removeTeamSeed(ids: SeededTeam): Promise<void> {
  const db = new pg.Client({ connectionString: localDbUrl() });
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local session_replication_role = 'replica'");
    for (const [col, list] of sweepColumns(ids)) {
      if (!list.length) continue;
      for (const table of await tablesWith(db, col)) await db.query(`delete from public."${table}" where "${col}" = any($1::uuid[])`, [list]);
    }
    for (const [table, list] of entityTables(ids)) if (list.length) await db.query(`delete from public.${table} where id = any($1::uuid[])`, [list]);
    await db.query('commit');

    const admin = adminClient();
    for (const id of ids.userIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error && !/not found/i.test(error.message)) throw new Error(`cleanup: deleting auth user ${id}: ${error.message}`);
    }
    await db.query('delete from public.users where id = any($1::uuid[])', [ids.userIds]);

    // Nothing may refer to the seed any more, in any table.
    const left: string[] = [];
    for (const [col, list] of sweepColumns(ids)) {
      if (!list.length) continue;
      for (const table of await tablesWith(db, col)) {
        const n = (await db.query(`select count(*)::int as n from public."${table}" where "${col}" = any($1::uuid[])`, [list])).rows[0].n as number;
        if (n) left.push(`${table}.${col}=${n}`);
      }
    }
    for (const [table, list] of entityTables(ids)) {
      if (!list.length) continue;
      const n = (await db.query(`select count(*)::int as n from public.${table} where id = any($1::uuid[])`, [list])).rows[0].n as number;
      if (n) left.push(`${table}.id=${n}`);
    }
    if (left.length) throw new Error(`cleanup: rows are still there: ${left.join(', ')}`);
  } catch (err) {
    await db.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    await db.end();
  }
}

/**
 * Seeds a coach, a team of players, and a season of completed rounds, on a LOCAL Supabase only: the data the Clubhouse perf harness
 * measures against (scripts/clubhouse/perf-measure.mjs; e2e/README.md).
 *
 *   - A head coach and `players` players, each with an auth user and a password; every player is active on the one team.
 *   - Three courses of par 72, a team chat, a qualifier with an entry for every player, and a week of events with replies.
 *   - `roundsPerPlayer` completed rounds per player (six more for every third), dated across `days` days back: mostly 18-hole
 *     practice, a tournament now and then, and each player's qualifier round. A nine-hole round, a round posted as a total only,
 *     and rounds without shots are in, so the coverage notes and the empty paths render. Two rounds in three carry every hole and
 *     every shot (and strokes gained, which is synthetic, scaled from the score); the cache rows come from the database's own
 *     trigger when each round is completed, with the holes already in.
 *
 * The scores are deterministic for a `seed`. Rounds, holes and shots are written through a direct connection to the local database
 * (a completed round cannot be inserted by an app caller), in one transaction, so a failed seed leaves no rows; the auth users made
 * first are removed again in that case.
 */
export async function seedClubhouseTeam(options: SeedTeamOptions = {}): Promise<SeededTeam> {
  const playerCount = Math.min(options.players ?? 8, FIRST.length);
  const perPlayer = options.roundsPerPlayer ?? 12;
  const days = options.days ?? 120;
  const rng = makeRng(options.seed ?? 20261001);
  const admin = adminClient();
  const url = localDbUrl();
  const tag = randomBytes(3).toString('hex');
  const pw = () => `E2e-${randomBytes(12).toString('base64url')}`;
  const now = new Date();
  const today = localToday(now);

  const coachEmail = `perf-coach-${tag}@example.test`;
  const coachPw = pw();
  const people = Array.from({ length: playerCount }, (_, i) => ({
    first: FIRST[i]!,
    last: LAST[i]!,
    email: `perf-${FIRST[i]!.toLowerCase()}-${tag}@example.test`,
    password: pw(),
  }));

  const userIds: string[] = [];
  const makeUser = async (email: string, password: string, role: 'coach' | 'player', first: string, last: string): Promise<string> => {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role, sport: 'golf', first_name: first, last_name: last } });
    if (created.error || !created.data.user) throw new Error(`seed user ${email}: ${created.error?.message}`);
    userIds.push(created.data.user.id);
    return created.data.user.id;
  };
  const dropUsers = async (): Promise<void> => {
    for (const id of userIds) await admin.auth.admin.deleteUser(id).catch(() => undefined);
    if (userIds.length) {
      const db = new pg.Client({ connectionString: url });
      await db.connect();
      await db.query('delete from public.users where id = any($1::uuid[])', [userIds]).catch(() => undefined);
      await db.end();
    }
  };

  let coachUserId: string;
  let playerUserIds: string[];
  try {
    const ids = await Promise.all([makeUser(coachEmail, coachPw, 'coach', 'Dana', 'Whitfield'), ...people.map((p) => makeUser(p.email, p.password, 'player', p.first, p.last))]);
    coachUserId = ids[0]!;
    playerUserIds = ids.slice(1);
  } catch (err) {
    await dropUsers();
    throw err;
  }

  const team: SeededTeam = {
    tag,
    teamId: randomUUID(),
    teamName: `Perf University Golf ${tag}`,
    orgId: randomUUID(),
    coach: { userId: coachUserId, coachId: randomUUID(), email: coachEmail, password: coachPw },
    players: people.map((p, i) => ({
      playerId: randomUUID(),
      userId: playerUserIds[i]!,
      email: p.email,
      password: p.password,
      firstName: p.first,
      lastName: p.last,
      rounds: perPlayer + (i % 3 === 0 ? 6 : 0),
    })),
    courseIds: COURSES.map(() => randomUUID()),
    teeIds: COURSES.map(() => randomUUID()),
    qualifierId: randomUUID(),
    conversationId: randomUUID(),
    eventIds: [],
    roundIds: [],
    userIds: [coachUserId, ...playerUserIds],
    counts: { rounds: 0, holes: 0, shots: 0, events: 0 },
  };

  const courseNames = COURSES.map((c) => `${c} ${tag}`);
  const yardsByCourse = PAR_LAYOUTS.map((layout, i) => yardsFor(layout, makeRng(1000 + i)));
  const qualifierDay = addDays(today, -35);

  // Every round, decided up front: who, when, which shape, which type, with or without shots.
  interface Plan {
    id: string;
    playerIdx: number;
    skill: number;
    date: string;
    course: number;
    shape: RoundShape;
    type: 'practice' | 'tournament' | 'qualifier';
    withShots: boolean;
    round?: GenRound;
  }
  const plans: Plan[] = [];
  team.players.forEach((p, playerIdx) => {
    const n = p.rounds;
    const skill = 0.2 + 0.72 * (playerIdx / Math.max(1, playerCount - 1)) + (rng() - 0.5) * 0.06;
    // Days back, newest first (recency rank k = 0 is the newest); one round a day at most.
    const used = new Set<number>();
    const offsets = Array.from({ length: n }, (_, k) => {
      let o = Math.max(1, Math.round(((days - 1) * (k + rng() * 0.8)) / n) + 1);
      while (used.has(o)) o += 1;
      used.add(o);
      return o;
    });
    // The qualifier round is the one dated nearest the qualifier's day, and takes that day.
    let qualifierK = 0;
    offsets.forEach((o, k) => {
      if (Math.abs(o - 35) < Math.abs(offsets[qualifierK]! - 35)) qualifierK = k;
    });
    offsets.forEach((o, k) => {
      const nine = (playerIdx === 3 && k === 4) || (playerIdx === 6 && k === 5);
      const totalOnly = playerIdx === 5 && k === 7;
      const type = k === qualifierK ? 'qualifier' : k % 6 === 2 ? 'tournament' : 'practice';
      plans.push({
        id: randomUUID(),
        playerIdx,
        skill,
        date: type === 'qualifier' ? qualifierDay : addDays(today, -o),
        course: (playerIdx + k) % COURSES.length,
        shape: totalOnly ? 'total' : nine ? 'nine' : 'full',
        type,
        withShots: !totalOnly && k % 3 !== 2,
      });
    });
  });
  for (const plan of plans) {
    plan.round = genRound(rng, {
      shape: plan.shape,
      skill: plan.skill,
      form: (rng() - 0.5) * 0.24,
      withShots: plan.withShots,
      layout: PAR_LAYOUTS[plan.course]!,
      yards: yardsByCourse[plan.course]!,
    });
    team.roundIds.push(plan.id);
  }

  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    await db.query('begin');

    // ── dimension rows, triggers on ──
    await bulk(db, 'organizations', ['id', 'name', 'type', 'location_city', 'location_state'], [
      { id: team.orgId, name: `Perf University ${tag}`, type: 'college', location_city: 'Testville', location_state: 'NC' },
    ]);
    await bulk(db, 'golf_courses', ['id', 'name', 'city', 'state', 'holes', 'par'], team.courseIds.map((id, i) => ({ id, name: courseNames[i], city: 'Testville', state: 'NC', holes: 18, par: 72 })));
    await bulk(
      db,
      'golf_course_tees',
      ['id', 'course_id', 'tee_name', 'normalized_tee_name', 'total_par', 'holes_count', 'course_rating', 'slope_rating'],
      team.teeIds.map((id, i) => ({ id, course_id: team.courseIds[i], tee_name: 'White', normalized_tee_name: 'white', total_par: 72, holes_count: 18, course_rating: 70.4 + i * 0.6, slope_rating: 126 + i * 2 })),
    );
    await bulk(
      db,
      'golf_course_tee_holes',
      ['tee_id', 'hole_number', 'par', 'yardage'],
      team.teeIds.flatMap((teeId, c) => PAR_LAYOUTS[c]!.map((par, h) => ({ tee_id: teeId, hole_number: h + 1, par, yardage: yardsByCourse[c]![h] }))),
    );
    await bulk(db, 'golf_coaches', ['id', 'user_id', 'organization_id', 'full_name', 'email', 'onboarding_completed'], [
      { id: team.coach.coachId, user_id: team.coach.userId, organization_id: team.orgId, full_name: 'Dana Whitfield', email: coachEmail, onboarding_completed: true },
    ]);
    await bulk(db, 'golf_teams', ['id', 'organization_id', 'name', 'join_code', 'season', 'created_by', 'timezone', 'gender', 'season_active'], [
      {
        id: team.teamId, organization_id: team.orgId, name: team.teamName, join_code: `PERF${tag}`.toUpperCase(), season: '2026-27', created_by: team.coach.coachId, timezone: TZ, gender: 'mens', season_active: true,
      },
    ]);
    await bulk(db, 'golf_team_coach_staff', ['team_id', 'coach_id', 'role', 'is_primary'], [{ team_id: team.teamId, coach_id: team.coach.coachId, role: 'head_coach', is_primary: true }]);
    await bulk(db, 'golf_team_settings', ['team_id', 'timezone'], [{ team_id: team.teamId, timezone: TZ }]);
    await bulk(
      db,
      'golf_players',
      ['id', 'user_id', 'first_name', 'last_name', 'email', 'hometown', 'state', 'handicap_index', 'graduation_year', 'onboarding_completed', 'profile_complete'],
      team.players.map((p, i) => ({
        id: p.playerId, user_id: p.userId, first_name: p.firstName, last_name: p.lastName, email: p.email, hometown: ['Raleigh', 'Atlanta', 'Austin', 'Tampa'][i % 4], state: ['NC', 'GA', 'TX', 'FL'][i % 4],
        handicap_index: Math.round((9 - i * 1.1) * 10) / 10, graduation_year: 2027 + (i % 4), onboarding_completed: true, profile_complete: true,
      })),
    );
    await bulk(
      db,
      'golf_team_members',
      ['team_id', 'player_id', 'status', 'jersey_number', 'joined_at', 'approved_at'],
      team.players.map((p, i) => ({
        team_id: team.teamId, player_id: p.playerId, status: 'active', jersey_number: i + 1, joined_at: new Date(now.getTime() - 200 * 86400000).toISOString(), approved_at: new Date(now.getTime() - 199 * 86400000).toISOString(),
      })),
    );
    await bulk(
      db,
      'golf_qualifiers',
      ['id', 'team_id', 'created_by', 'name', 'course_id', 'course_name', 'start_date', 'end_date', 'status', 'selection_slots_total', 'selection_slots_coach_pick', 'selection_state', 'num_rounds'],
      [
        {
          id: team.qualifierId, team_id: team.teamId, created_by: team.coach.coachId, name: 'Fall qualifier', course_id: team.courseIds[0], course_name: courseNames[0], start_date: qualifierDay, end_date: qualifierDay,
          status: 'completed', selection_slots_total: 5, selection_slots_coach_pick: 1, selection_state: 'closed', num_rounds: 1,
        },
      ],
    );
    await bulk(db, 'golf_qualifier_round_courses', ['qualifier_id', 'round_number', 'course_id', 'course_name', 'tee_id'], [
      { qualifier_id: team.qualifierId, round_number: 1, course_id: team.courseIds[0], course_name: courseNames[0], tee_id: team.teeIds[0] },
    ]);

    // ── rounds: written in progress, completed below once their holes are in ──
    const roundRows = plans.map((plan) => {
      const r = plan.round!;
      const p = team.players[plan.playerIdx]!;
      return {
        id: plan.id,
        player_id: p.playerId,
        team_id: team.teamId,
        course_id: team.courseIds[plan.course],
        course_name: courseNames[plan.course],
        tee_id: team.teeIds[plan.course],
        tees_played: 'White',
        course_rating: 70.4 + plan.course * 0.6,
        course_slope: 126 + plan.course * 2,
        round_date: plan.date,
        round_type: plan.type,
        qualifier_id: plan.type === 'qualifier' ? team.qualifierId : null,
        qualifier_round_number: plan.type === 'qualifier' ? 1 : null,
        status: 'in_progress',
        is_test: false,
        holes_played: r.holes_played,
        total_score: r.total_score,
        front_nine: r.front_nine,
        back_nine: r.back_nine,
        score_to_par: r.score_to_par,
        total_putts: r.total_putts,
        total_gir: r.total_gir,
        total_gir_possible: r.total_gir_possible,
        total_fairways_hit: r.total_fairways_hit,
        total_fairways: r.total_fairways,
        total_penalties: r.total_penalties,
        strokes_gained_total: r.strokes_gained_total,
        strokes_gained_tee: r.strokes_gained_tee,
        strokes_gained_approach: r.strokes_gained_approach,
        strokes_gained_around_green: r.strokes_gained_around_green,
        strokes_gained_putting: r.strokes_gained_putting,
        created_at: `${plan.date}T17:00:00Z`,
        updated_at: `${plan.date}T17:00:00Z`,
      };
    });
    await bulk(db, 'golf_rounds', Object.keys(roundRows[0]!), roundRows);

    // ── holes and shots, triggers off (the lifecycle guards and the per-hole recompute are for app callers; the figures are set above) ──
    await db.query("set local session_replication_role = 'replica'");
    const holeRows: object[] = [];
    const shotRows: object[] = [];
    for (const plan of plans) {
      for (const h of plan.round!.holes) {
        const holeId = randomUUID();
        holeRows.push({
          id: holeId, round_id: plan.id, hole_number: h.hole_number, par: h.par, yardage: h.yardage, score: h.score, putts: h.putts, fairway_hit: h.fairway_hit, gir: h.gir,
          up_and_down: h.up_and_down, sand_save: h.sand_save, penalty_strokes: h.penalty_strokes,
        });
        for (const s of h.shots) shotRows.push({ id: randomUUID(), round_id: plan.id, hole_id: holeId, hole_number: h.hole_number, ...s });
      }
    }
    const holeCols = ['id', 'round_id', 'hole_number', 'par', 'yardage', 'score', 'putts', 'fairway_hit', 'gir', 'up_and_down', 'sand_save', 'penalty_strokes'];
    for (let i = 0; i < holeRows.length; i += 2000) await bulk(db, 'golf_holes', holeCols, holeRows.slice(i, i + 2000));
    const shotCols = [
      'id', 'round_id', 'hole_id', 'hole_number', 'shot_number', 'shot_type', 'club_type', 'lie_before', 'lie_after', 'distance_to_hole_before', 'distance_unit_before', 'distance_to_hole_after',
      'distance_unit_after', 'shot_distance', 'result', 'is_penalty', 'penalty_type', 'miss_direction', 'putt_distance_feet', 'putt_made',
    ];
    for (let i = 0; i < shotRows.length; i += 2000) await bulk(db, 'golf_shots', shotCols, shotRows.slice(i, i + 2000));
    team.counts.holes = holeRows.length;
    team.counts.shots = shotRows.length;

    // Completed through the one write the lifecycle guard allows, so the database's own trigger builds each round's stats cache.
    await db.query("set local session_replication_role = 'origin'");
    await db.query("select set_config('helm.golf_lifecycle_write', 'atomic', true)");
    await db.query("update golf_rounds set status = 'completed' where id = any($1::uuid[])", [team.roundIds]);
    await db.query("select set_config('helm.golf_lifecycle_write', '', true)");
    const cached = (await db.query('select count(*)::int as n from golf_round_stats_cache where round_id = any($1::uuid[])', [team.roundIds])).rows[0].n as number;
    if (cached !== team.roundIds.length) throw new Error(`seed: ${cached} stats cache rows for ${team.roundIds.length} rounds`);
    team.counts.rounds = team.roundIds.length;

    // ── qualifier entries, ranked by score ──
    const entries = team.players.map((p, i) => {
      const plan = plans.find((x) => x.playerIdx === i && x.type === 'qualifier')!;
      return { player_id: p.playerId, plan, score: plan.round!.total_score };
    });
    const order = [...entries].sort((a, b) => a.score - b.score);
    await bulk(
      db,
      'golf_qualifier_entries',
      ['qualifier_id', 'player_id', 'round_id', 'status', 'score', 'position', 'total_score', 'total_to_par', 'rounds_completed', 'is_tied'],
      entries.map((e) => ({
        qualifier_id: team.qualifierId, player_id: e.player_id, round_id: e.plan.id, status: 'completed', score: e.score, position: order.indexOf(e) + 1, total_score: e.score,
        total_to_par: e.plan.round!.score_to_par, rounds_completed: 1, is_tied: order.filter((o) => o.score === e.score).length > 1,
      })),
    );

    // ── a week of events with replies, the team chat, a few messages and two focus areas ──
    const at = (date: string, hhmmZ: string) => `${date}T${hhmmZ}:00Z`;
    const evs = [
      { title: 'Short game practice', type: 'practice', day: 0, from: '19:30', to: '21:30', location: courseNames[0] },
      { title: 'Team practice', type: 'practice', day: 1, from: '20:00', to: '22:00', location: courseNames[1] },
      { title: 'Qualifier round 2', type: 'qualifier', day: 2, from: '13:00', to: '19:00', location: courseNames[0] },
      { title: 'Fall invitational', type: 'tournament', day: 3, from: null, to: null, location: courseNames[2] },
      { title: 'Team meeting', type: 'meeting', day: 4, from: '22:00', to: '23:00', location: 'Clubhouse' },
      { title: 'Travel to the spring opener', type: 'travel', day: 9, from: '12:00', to: '23:00', location: 'Charleston, SC' },
    ].map((e) => ({ ...e, id: randomUUID() }));
    team.eventIds = evs.map((e) => e.id);
    team.counts.events = evs.length;
    await bulk(
      db,
      'golf_events',
      ['id', 'team_id', 'created_by', 'title', 'event_type', 'location', 'start_time', 'end_time', 'all_day', 'status'],
      evs.map((e) => ({
        id: e.id, team_id: team.teamId, created_by: team.coach.coachId, title: e.title, event_type: e.type, location: e.location,
        start_time: e.from ? at(addDays(today, e.day), e.from) : at(addDays(today, e.day), '04:00'),
        end_time: e.to ? at(addDays(today, e.day), e.to) : at(addDays(today, e.day + 1), '03:59'),
        all_day: !e.from, status: 'scheduled',
      })),
    );
    const replies = ['accepted', 'accepted', 'accepted', 'pending', 'declined', 'accepted', 'tentative', 'accepted'];
    await bulk(
      db,
      'golf_event_attendance',
      ['event_id', 'player_id', 'status'],
      evs.flatMap((e, ei) => team.players.map((p, pi) => ({ event_id: e.id, player_id: p.playerId, status: replies[(pi + ei) % replies.length] }))),
    );
    await bulk(db, 'golf_conversations', ['id', 'team_id', 'is_team_chat', 'title', 'created_by'], [
      { id: team.conversationId, team_id: team.teamId, is_team_chat: true, title: `${team.teamName} chat`, created_by: team.coach.userId },
    ]);
    await bulk(db, 'golf_conversation_participants', ['conversation_id', 'user_id'], team.userIds.map((u) => ({ conversation_id: team.conversationId, user_id: u })));
    const lines = ['Range at 3:30 today, wedges first.', 'Qualifier tee times are posted.', 'Good rounds this week. Keep the putting work going.', 'Bus leaves at 6 on Friday.'];
    await bulk(
      db,
      'golf_messages',
      ['conversation_id', 'sender_id', 'content', 'created_at'],
      lines.map((content, i) => ({
        conversation_id: team.conversationId, sender_id: i % 2 === 0 ? team.coach.userId : team.players[i]!.userId, content, created_at: new Date(now.getTime() - (lines.length - i) * 3600_000).toISOString(),
      })),
    );
    await bulk(db, 'golf_player_focus_areas', ['player_id', 'team_id', 'coach_id', 'area_type', 'title', 'status', 'target_metric', 'current_value', 'target_value', 'baseline_value'], [
      {
        player_id: team.players[0]!.playerId, team_id: team.teamId, coach_id: team.coach.coachId, area_type: 'putting', title: 'Lag putting from 25 feet and out', status: 'active', target_metric: 'putts_per_round',
        current_value: 31.8, target_value: 30, baseline_value: 32.6,
      },
      {
        player_id: team.players[0]!.playerId, team_id: team.teamId, coach_id: team.coach.coachId, area_type: 'approach', title: 'Approach proximity from 125 to 175 yards', status: 'active', target_metric: 'gir_pct',
        current_value: 61, target_value: 68, baseline_value: 58,
      },
    ]);

    await db.query('commit');
  } catch (err) {
    await db.query('rollback').catch(() => undefined);
    await db.end();
    await dropUsers();
    throw err;
  }
  await db.end();
  return team;
}
