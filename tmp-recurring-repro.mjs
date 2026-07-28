// Throwaway: reproduce the editRecurringEvent series-UPDATE PostgrestError.
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const URL = 'http://127.0.0.1:54321';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const db = new pg.Client(DB);
await db.connect();

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

// --- coach user -----------------------------------------------------------
const email = `repro-coach-${Date.now()}@example.com`;
const password = 'Repro!Passw0rd';
const { data: created, error: cErr } = await admin.auth.admin.createUser({
  email, password, email_confirm: true,
});
if (cErr) throw cErr;
const userId = created.user.id;

const teamId = (await db.query(`select id from golf_teams limit 1`)).rows[0].id;

await db.query(
  `insert into users (id, email, role) values ($1,$2,'coach')
   on conflict (id) do update set role='coach'`,
  [userId, email],
).catch(() => {});

const coachId = (await db.query(
  `insert into golf_coaches (user_id) values ($1) returning id`, [userId],
)).rows[0].id;
await db.query(
  `insert into golf_team_coach_staff (team_id, coach_id, role) values ($1,$2,'head_coach')`,
  [teamId, coachId],
).catch(async (e) => {
  console.log('staff insert variant needed:', e.message);
  await db.query(`insert into golf_team_coach_staff (team_id, coach_id) values ($1,$2)`, [teamId, coachId]);
});

// --- a 52-occurrence series, exactly like the failing one ------------------
const rootId = (await db.query(
  `insert into golf_events (team_id, created_by, title, event_type, start_time, end_time, recurring, recurrence_rule)
   values ($1,$2,'Momentic Recurring 302807','practice', now(), now() + interval '2 hours', true, 'FREQ=WEEKLY;COUNT=52')
   returning id`,
  [teamId, coachId],
)).rows[0].id;

for (let i = 1; i < 52; i++) {
  await db.query(
    `insert into golf_events (team_id, created_by, title, event_type, start_time, end_time, parent_event_id)
     values ($1,$2,'Momentic Recurring 302807','practice', now() + ($3 || ' weeks')::interval, now() + ($3 || ' weeks')::interval + interval '2 hours', $4)`,
    [teamId, coachId, String(i), rootId],
  );
}
console.log(`seeded series root=${rootId} (52 rows) team=${teamId} coach=${coachId}`);

// --- sign in as the coach and run the EXACT query the action runs ----------
const sb = createClient(URL, ANON, { auth: { persistSession: false } });
const { error: sErr } = await sb.auth.signInWithPassword({ email, password });
if (sErr) throw sErr;

const literalUpdates = { title: 'Momentic Recurring 302807 EDITED' };

console.log('\n--- shipped shape: .update().eq(team_id).or(parent.eq,id.eq).select(id) ---');
{
  const { data, error } = await sb
    .from('golf_events')
    .update(literalUpdates)
    .eq('team_id', teamId)
    .or(`parent_event_id.eq.${rootId},id.eq.${rootId}`)
    .select('id');
  console.log('error:', error ? JSON.stringify(error) : 'none', '| rows:', data?.length ?? 0);
}

console.log('\n--- control: same but WITHOUT .or() (plain parent_event_id filter) ---');
{
  const { data, error } = await sb
    .from('golf_events')
    .update({ title: 'ctrl' })
    .eq('team_id', teamId)
    .eq('parent_event_id', rootId)
    .select('id');
  console.log('error:', error ? JSON.stringify(error) : 'none', '| rows:', data?.length ?? 0);
}

console.log('\n--- control: .or() WITHOUT .select() (no RETURNING) ---');
{
  const { error } = await sb
    .from('golf_events')
    .update({ title: 'ctrl2' })
    .eq('team_id', teamId)
    .or(`parent_event_id.eq.${rootId},id.eq.${rootId}`);
  console.log('error:', error ? JSON.stringify(error) : 'none');
}

await db.query(`delete from golf_events where id=$1 or parent_event_id=$1`, [rootId]);
await db.query(`delete from golf_team_coach_staff where coach_id=$1`, [coachId]);
await db.query(`delete from golf_coaches where id=$1`, [coachId]);
await admin.auth.admin.deleteUser(userId);
await db.end();
