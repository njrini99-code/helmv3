// Throwaway: seed a known coach login for local UI testing.
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const URL = 'http://127.0.0.1:54321';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const EMAIL = 'bridge.coach@example.com';
const PASSWORD = 'BridgeCoach!2026';

const db = new pg.Client(DB);
await db.connect();
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

// Clean any prior run.
const existing = (await db.query(`select id from auth.users where email=$1`, [EMAIL])).rows[0];
if (existing) {
  await db.query(`delete from golf_events where created_by in (select id from golf_coaches where user_id=$1)`, [existing.id]);
  await db.query(`delete from golf_team_coach_staff where coach_id in (select id from golf_coaches where user_id=$1)`, [existing.id]);
  await db.query(`delete from golf_coaches where user_id=$1`, [existing.id]);
  await admin.auth.admin.deleteUser(existing.id);
}

const { data: created, error } = await admin.auth.admin.createUser({
  email: EMAIL, password: PASSWORD, email_confirm: true,
});
if (error) throw error;
const userId = created.user.id;

await db.query(
  `insert into users (id, email, role) values ($1,$2,'coach')
   on conflict (id) do update set role='coach'`,
  [userId, EMAIL],
);
await db.query(
  `update profiles set first_name='Bridge', last_name='Coach' where id=$1`, [userId],
).catch((e) => console.log('profiles update skipped:', e.message));

const teamId = '752db14d-5d11-476b-8a92-2fc0bfbc2d48'; // Demo University Golf
const coachId = (await db.query(
  `insert into golf_coaches (user_id, team_id) values ($1,$2) returning id`, [userId, teamId],
).catch(() => db.query(`insert into golf_coaches (user_id) values ($1) returning id`, [userId]))).rows[0].id;

await db.query(
  `insert into golf_team_coach_staff (team_id, coach_id, role) values ($1,$2,'head_coach')
   on conflict do nothing`,
  [teamId, coachId],
);

console.log(JSON.stringify({ EMAIL, PASSWORD, userId, coachId, teamId }, null, 2));
await db.end();
