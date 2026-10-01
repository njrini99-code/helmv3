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

export function localSupabase(): { url: string; serviceKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? '';
  if (!url || !serviceKey) return null;
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  return host === '127.0.0.1' || host === 'localhost' ? { url, serviceKey } : null;
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
  if (!localSupabase()) throw new Error('clubhouse-local-seed: refusing a Supabase that is not local');
  const dbUrl = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const dbHost = new URL(dbUrl).hostname;
  if (dbHost !== '127.0.0.1' && dbHost !== 'localhost') throw new Error('clubhouse-local-seed: refusing a database that is not local');
  const db = new pg.Client({ connectionString: dbUrl });
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
