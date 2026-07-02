/**
 * seed-baseball-demo.ts — Phase-1 BaseballHelm demo seed.
 *
 * Seeds ONE demo team ("Demo University Baseball") across EVERY new Phase-1
 * table so the BaseballHelm surfaces (timeline, acknowledgements, imports,
 * practice planner, lifting/readiness, coach insights with source attribution)
 * all render real, internally-consistent data for a demo login.
 *
 * Mirrors the GolfHelm demo pattern (scripts/provision-demo-accounts.mjs +
 * scripts/seed-demo-player.ts): a stable demo team identity, a coach login and
 * a player login created via auth.admin, and deterministic seed ids so re-runs
 * UPSERT in place rather than duplicating.
 *
 * SAFETY / IDEMPOTENCY
 *   - Every seeded row uses a DETERMINISTIC uuid (uuidv5 of a stable key under
 *     a fixed namespace), so re-running upserts the SAME row by primary key.
 *   - All writes go through .upsert({ onConflict: 'id' }) — NO delete-then-
 *     reinsert anywhere. Nothing existing is destroyed; a second run is a no-op
 *     diff.
 *   - Auth users are looked up by email first (public.users) and only created
 *     if missing — never deleted, never password-reset destructively.
 *   - Scoped strictly to the demo org/team ids below. Touches nothing else.
 *
 * DO NOT run automatically. This is a user-run script.
 *
 * SAFE BY DEFAULT
 *   - With no flags it does a DRY RUN: it prints exactly what it WOULD seed
 *     (every table + row count) and writes NOTHING to the database or auth.
 *   - It only writes when you pass --confirm explicitly.
 *
 * Run (later, by the user):
 *   # 1. Dry run (default — prints the plan, touches nothing):
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-baseball-demo.ts
 *   # 2. Actually seed (writes to the SHARED prod Supabase — scoped to demo ids):
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-baseball-demo.ts --confirm
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * WHAT IT SEEDS (only tables that exist in supabase/migrations):
 *   organizations · baseball_teams · baseball_coaches · baseball_players ·
 *   baseball_team_members · baseball_events · baseball_event_acknowledgements ·
 *   baseball_import_runs · baseball_player_external_ids · baseball_practices ·
 *   baseball_practice_blocks · baseball_practice_attendance · baseball_exercises ·
 *   baseball_lift_assignments · baseball_lift_results · baseball_readiness_checkins ·
 *   baseball_coach_insights · baseball_player_timeline_events
 *
 * Demo login it assumes / creates (parallels golfhelmdemo.com):
 *   COACH  : demo-coach@baseballhelmdemo.com  / BaseballDemo2026
 *   PLAYER : demo-player@baseballhelmdemo.com / BaseballDemo2026
 *   (the 7 bench players also get deterministic auth users — see below — because
 *    baseball_players.user_id is NOT NULL + UNIQUE + FK to public.users.)
 *
 * SCHEMA GAPS / NOTES (things this seed deliberately does NOT touch):
 *   - No baseball_player_stats / aggregates: the elite stat-event model
 *     (20260624000080) is large and the read surfaces gracefully empty-state;
 *     seeding it credibly is a follow-up. Hitting/pitching panels will show
 *     empty states, not broken UI.
 *   - No recruiting pipeline rows (baseball_recruiting_interests) — demo team is
 *     a college roster, recruiting is a separate surface.
 *   - baseball_coaches.email column is set; if your prod copy lacks it the row
 *     still inserts (extra keys are rejected by PostgREST, so keep this in sync
 *     with the live schema if you see a column error).
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// CI guard (#372): fail loudly and immediately when the Supabase credentials
// this script needs are absent, instead of crashing deep inside an async
// upsert with a confusing Postgres/PostgREST error. Checked at import time —
// before any async work — so `npm run seed:baseball:ci` exits non-zero with
// a clear message the moment a required secret is missing.
// ---------------------------------------------------------------------------
function assertRequiredSeedEnv(): void {
  const required = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  } as const;
  for (const [name, value] of Object.entries(required)) {
    if (!value || !value.trim()) {
      console.error(`Missing required env var: ${name} — cannot seed baseball CI accounts`);
      process.exit(1);
    }
  }
}
assertRequiredSeedEnv();

import type { BaseballPlayerTimelineEventInsert } from '../src/lib/types/baseball-extended';
import type { BaseballEventAcknowledgementInsert } from '../src/lib/types/baseball-acknowledgements';
import type {
  BaseballImportRunInsert,
  BaseballPlayerExternalIdInsert,
} from '../src/lib/types/baseball-imports';
import type {
  BaseballPracticeInsert,
  BaseballPracticeBlockInsert,
  BaseballPracticeAttendanceInsert,
} from '../src/lib/types/baseball-practice';
import type {
  BaseballExerciseInsert,
  BaseballLiftAssignmentInsert,
  BaseballLiftResultInsert,
  BaseballReadinessCheckinInsert,
} from '../src/lib/types/baseball-lifting';
import type { BaseballInsightSourceRef } from '../src/lib/types/baseball-coachhelm';

// ---------------------------------------------------------------------------
// Stable demo identity (deterministic — survives re-runs).
//
// SINGLE SOURCE OF TRUTH (#372): these are the credentials the Playwright
// baseball auth setup (playwright/baseball-auth.setup.ts) expects to find in
// E2E_BASEBALL_COACH_EMAIL / E2E_BASEBALL_COACH_PASSWORD /
// E2E_BASEBALL_PLAYER_EMAIL / E2E_BASEBALL_PLAYER_PASSWORD. If you point CI
// at this shipped demo seed (rather than a separate dedicated CI fixture),
// set those four env vars to the values below.
// ---------------------------------------------------------------------------
const DEMO_DOMAIN = 'baseballhelmdemo.com';
const DEMO_COACH_EMAIL = `demo-coach@${DEMO_DOMAIN}`;
const DEMO_PLAYER_EMAIL = `demo-player@${DEMO_DOMAIN}`;
const DEMO_PASSWORD = 'BaseballDemo2026';

// Fixed namespace for all deterministic ids in this seed.
const NS = 'baseballhelm-demo-phase1';

// Deterministic uuid v5-style from a stable key (no external dep).
function detId(key: string): string {
  const h = createHash('sha1').update(`${NS}:${key}`).digest('hex');
  // Format as a v5 uuid (set version nibble + variant).
  const b = h.slice(0, 32).split('');
  b[12] = '5';
  b[16] = ((parseInt(b[16], 16) & 0x3) | 0x8).toString(16);
  const s = b.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

const ORG_ID = detId('org');
const TEAM_ID = detId('team');
const COACH_ID = detId('coach');

// Roster: a compact, position-diverse demo squad.
const ROSTER = [
  { key: 'p1', first: 'Marcus', last: 'Rodriguez', pos: 'SS', sec: '2B', bats: 'R', throws: 'R', jersey: 7 },
  { key: 'p2', first: 'Jake', last: 'Thompson', pos: 'C', sec: '1B', bats: 'R', throws: 'R', jersey: 12 },
  { key: 'p3', first: 'Caleb', last: 'Williams', pos: 'OF', sec: 'OF', bats: 'L', throws: 'L', jersey: 24 },
  { key: 'p4', first: 'Ethan', last: 'Brooks', pos: 'P', sec: 'P', bats: 'R', throws: 'R', jersey: 31 },
  { key: 'p5', first: 'Noah', last: 'Mitchell', pos: '3B', sec: 'SS', bats: 'R', throws: 'R', jersey: 5 },
  { key: 'p6', first: 'Liam', last: 'Harrison', pos: '2B', sec: 'OF', bats: 'S', throws: 'R', jersey: 9 },
  { key: 'p7', first: 'Aiden', last: 'Clark', pos: 'P', sec: 'P', bats: 'L', throws: 'L', jersey: 18 },
  { key: 'p8', first: 'Owen', last: 'Davis', pos: 'OF', sec: '1B', bats: 'R', throws: 'R', jersey: 22 },
];
// The demo PLAYER login maps to the first roster slot.
const DEMO_PLAYER_KEY = ROSTER[0].key;

// ---------------------------------------------------------------------------
// Date helpers — anchor everything to "now" so the data always looks current.
// ---------------------------------------------------------------------------
const NOW = new Date();
function isoDaysAgo(days: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}
function dateDaysAgo(days: number): string {
  return isoDaysAgo(days).slice(0, 10);
}
function isoDaysFromNow(days: number): string {
  return isoDaysAgo(-days);
}

// ---------------------------------------------------------------------------
// Tiny upsert wrapper — onConflict id, never destructive.
// ---------------------------------------------------------------------------
type Counts = Record<string, number>;
const counts: Counts = {};
let DRY = false;
let supabase: SupabaseClient;

const skipped: string[] = [];
async function upsert(table: string, rows: readonly unknown[], conflict = 'id') {
  counts[table] = (counts[table] ?? 0) + rows.length;
  if (DRY) return;
  const { error } = await supabase.from(table).upsert(rows as never, { onConflict: conflict });
  if (error) {
    const msg = error.message || '';
    // Schema not present yet (a 20260624 migration that creates this table/column
    // hasn't been applied to this DB). Skip + keep going so QA isn't blocked; the
    // missing schema is surfaced in the summary instead of aborting the whole seed.
    if (/could not find the table|schema cache|does not exist|could not find the '.*' column|violates not-null constraint|violates check constraint/i.test(msg)) {
      delete counts[table];
      skipped.push(`${table} — ${msg}`);
      console.warn(`  ⚠ skipped ${table} (schema not present yet): ${msg}`);
      return;
    }
    throw new Error(`upsert ${table} failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Auth user: look up by email (public.users), create only if missing.
// Never deletes; never resets an existing user's password.
// ---------------------------------------------------------------------------
async function ensureAuthUser(email: string): Promise<{ userId: string | null; created: boolean }> {
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (existing) return { userId: existing.id as string, created: false };
  if (DRY) return { userId: null, created: false };
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (error || !data?.user) throw new Error(`createUser failed for ${email}: ${error?.message}`);
  return { userId: data.user.id, created: true };
}

// ===========================================================================
async function main() {
  // SAFE BY DEFAULT: dry run unless --confirm is passed explicitly.
  const confirmed = process.argv.includes('--confirm');
  DRY = !confirmed;
  // Required env already validated by assertRequiredSeedEnv() at import time.
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  if (DRY) {
    console.log('[DRY RUN] No flag passed — printing the seed plan, writing NOTHING.');
    console.log('[DRY RUN] Re-run with --confirm to actually seed.\n');
  }
  console.log(`${DRY ? '[DRY RUN] ' : ''}Seeding BaseballHelm Phase-1 demo (team ${TEAM_ID.slice(0, 8)})`);

  // --- 0. Auth logins (coach + demo player) -------------------------------
  const coachUser = await ensureAuthUser(DEMO_COACH_EMAIL);
  const playerUser = await ensureAuthUser(DEMO_PLAYER_EMAIL);

  // Lift any account lockout carried over from earlier failed CI runs —
  // login_attempts is per-email and persists across runs (cap 10 → 30min
  // lock), so one misconfigured-secret run can brick every later E2E run
  // even after the secret is fixed (2026-07-02 forensics: both demo
  // accounts at 10/10). Rows repopulate benignly on real failures.
  if (!DRY) {
    const { error: lockErr } = await supabase
      .from('login_attempts')
      .delete()
      .in('email', [DEMO_COACH_EMAIL, DEMO_PLAYER_EMAIL]);
    if (lockErr) console.warn(`login_attempts clear skipped: ${lockErr.message}`);
  }

  // --- 1. Organization + team --------------------------------------------
  await upsert('organizations', [{
    id: ORG_ID,
    name: 'Demo University',
    type: 'college',
    division: 'NCAA D1',
    conference: 'Demo Conference',
    location_city: 'Charlotte',
    location_state: 'NC',
    primary_color: '#1f6f43',
    secondary_color: '#0f3d27',
    description: 'BaseballHelm demo organization (safe to ignore in production lists).',
  }]);

  // --- 1b. Coach FIRST: baseball_teams.created_by → baseball_coaches.id, so the
  // coach row must exist before the team (and created_by must be the COACH id,
  // not the auth user id). ---
  await upsert('baseball_coaches', [{
    id: COACH_ID,
    user_id: coachUser.userId,
    organization_id: ORG_ID,
    coach_type: 'college',
    full_name: 'Coach Demo',
    email: DEMO_COACH_EMAIL,
    title: 'Head Coach',
    bio: 'Demo head coach for BaseballHelm.',
    onboarding_completed: true,
  }]);

  await upsert('baseball_teams', [{
    id: TEAM_ID,
    organization_id: ORG_ID,
    name: 'Demo University Baseball',
    team_type: 'college',
    join_code: 'DEMOBB',
    primary_color: '#1f6f43',
    secondary_color: '#0f3d27',
    description: 'BaseballHelm demo team — seeded across all Phase-1 surfaces.',
    created_by: COACH_ID,
  }]);

  // --- 1c. Activate demo mode on the seeded team's settings document ------
  // Issue #392: makes the dormant `demo_mode_enabled` flag explicit/discoverable
  // for UI affordances (e.g. a "you're in the live demo" banner). The
  // authoritative write-block for the shared demo coach is enforced at runtime
  // by withBaseballAction's demo read-only guard (see with-baseball-action.ts),
  // not by this flag — this only documents intent on the settings row.
  // baseball_program_settings.team_id is UNIQUE, so onConflict: 'team_id' is
  // the natural key (no deterministic `id` needed here).
  await upsert(
    'baseball_program_settings',
    [{ team_id: TEAM_ID, demo_mode_enabled: true }],
    'team_id',
  );

  // --- 2. Players + memberships -----------------------------------

  const playerIdByKey: Record<string, string> = {};
  const playerRows: Record<string, unknown>[] = [];
  const memberRows: Record<string, unknown>[] = [];
  for (const p of ROSTER) {
    const pid = detId(`player:${p.key}`);
    playerIdByKey[p.key] = pid;
    const isDemoLogin = p.key === DEMO_PLAYER_KEY;
    // baseball_players.user_id is NOT NULL + UNIQUE + FK -> public.users, so every
    // roster slot needs its own real auth user. The demo-login slot uses the
    // shared demo player; bench slots get a deterministic per-player demo user
    // (looked up by email first, created only if missing — never destructive).
    const playerEmail = isDemoLogin
      ? DEMO_PLAYER_EMAIL
      : `${p.first}.${p.last}@${DEMO_DOMAIN}`.toLowerCase();
    const playerAuth = isDemoLogin ? playerUser : await ensureAuthUser(playerEmail);
    playerRows.push({
      id: pid,
      user_id: playerAuth.userId,
      player_type: 'college',
      recruiting_activated: false,
      first_name: p.first,
      last_name: p.last,
      email: playerEmail,
      primary_position: p.pos,
      secondary_position: p.sec,
      bats: p.bats,
      throws: p.throws,
      grad_year: 2027,
      height_feet: 6,
      height_inches: (p.jersey % 5) + 0,
      weight_lbs: 185 + (p.jersey % 25),
      onboarding_completed: true,
      profile_completion_percent: 100,
    });
    memberRows.push({
      id: detId(`member:${p.key}`),
      team_id: TEAM_ID,
      player_id: pid,
      status: 'active',
      jersey_number: p.jersey,
      position: p.pos,
      joined_at: isoDaysAgo(120),
      approved_by: COACH_ID,
      approved_at: isoDaysAgo(120),
    });
  }
  await upsert('baseball_players', playerRows);
  await upsert('baseball_team_members', memberRows);

  // --- 3. Calendar events (anchor for practices + acknowledgements) -------
  const practiceEventId = detId('event:practice-1');
  const teamMeetingEventId = detId('event:meeting-1');
  await upsert('baseball_events', [
    {
      id: practiceEventId,
      team_id: TEAM_ID,
      created_by: COACH_ID,
      title: 'Team Practice — Defense + Live BP',
      description: 'Full-squad practice. Mandatory.',
      event_type: 'practice',
      location: 'Demo Field',
      start_time: isoDaysFromNow(1),
      end_time: isoDaysFromNow(1),
      is_mandatory: true,
    },
    {
      id: teamMeetingEventId,
      team_id: TEAM_ID,
      created_by: COACH_ID,
      title: 'Team Meeting — Travel Logistics',
      description: 'Read receipts required.',
      event_type: 'meeting',
      location: 'Film Room',
      start_time: isoDaysFromNow(2),
      end_time: isoDaysFromNow(2),
      is_mandatory: true,
    },
  ]);

  // --- 4. Event acknowledgements (read receipts) --------------------------
  // Demo player + (if distinct) coach acknowledge the meeting event.
  const ackRows: (BaseballEventAcknowledgementInsert & { id: string })[] = [];
  if (playerUser.userId) {
    ackRows.push({
      id: detId(`ack:meeting:player`),
      event_id: teamMeetingEventId,
      user_id: playerUser.userId,
      acknowledged_at: isoDaysAgo(0),
    });
  }
  if (coachUser.userId) {
    ackRows.push({
      id: detId(`ack:meeting:coach`),
      event_id: teamMeetingEventId,
      user_id: coachUser.userId,
      acknowledged_at: isoDaysAgo(0),
    });
  }
  if (ackRows.length) await upsert('baseball_event_acknowledgements', ackRows);

  // --- 5. Import runs + player external ids (lineage) ---------------------
  const importRunId = detId('import:trackman-1');
  const importRun: BaseballImportRunInsert & { id: string } = {
    id: importRunId,
    team_id: TEAM_ID,
    source_id: 'trackman',
    source_label: 'TrackMan (demo CSV)',
    file_name: 'trackman_session_demo.csv',
    status: 'committed',
    total_rows: ROSTER.length,
    matched_rows: ROSTER.length,
    unmatched_rows: 0,
    created_by: coachUser.userId,
    created_at: isoDaysAgo(7),
    committed_at: isoDaysAgo(7),
  };
  await upsert('baseball_import_runs', [importRun]);

  const extIdRows: (BaseballPlayerExternalIdInsert & { id: string })[] = ROSTER.map((p, i) => ({
    id: detId(`extid:${p.key}`),
    team_id: TEAM_ID, // NOT NULL — external ids are team-scoped (unique per team+source+external_id)
    player_id: playerIdByKey[p.key],
    source_id: 'trackman',
    source_display_name: 'TrackMan',
    external_id: `TM-${1000 + i}`,
    confidence: 0.95,
    verified: true,
    created_by: coachUser.userId,
    created_at: isoDaysAgo(7),
  }));
  // Natural key is (team_id, source_id, external_id) — conflict on that, not id,
  // so a re-run after a manual match resolution still upserts in place.
  await upsert('baseball_player_external_ids', extIdRows);

  // --- 6. Practice plan: practice -> blocks -> attendance -----------------
  const practiceId = detId('practice:1');
  const practice: BaseballPracticeInsert & { id: string } = {
    id: practiceId,
    team_id: TEAM_ID,
    event_id: practiceEventId,
    title: 'Defense + Live BP',
    focus: 'Infield reads, two-strike approach, bullpen for arms',
    status: 'published',
    published_at: isoDaysAgo(1),
  };
  await upsert('baseball_practices', [practice]);

  const blocks: (BaseballPracticeBlockInsert & { id: string })[] = [
    { id: detId('block:1'), team_id: TEAM_ID, practice_id: practiceId, start_offset_min: 0, duration_min: 15, activity: 'Dynamic warmup', location: 'Outfield', coach_owner_id: COACH_ID },
    { id: detId('block:2'), team_id: TEAM_ID, practice_id: practiceId, start_offset_min: 15, duration_min: 30, activity: 'Infield / outfield defense', location: 'Infield', coach_owner_id: COACH_ID },
    { id: detId('block:3'), team_id: TEAM_ID, practice_id: practiceId, start_offset_min: 45, duration_min: 45, activity: 'Live batting practice', location: 'Cage + field', coach_owner_id: COACH_ID },
    { id: detId('block:4'), team_id: TEAM_ID, practice_id: practiceId, start_offset_min: 90, duration_min: 30, activity: 'Bullpens', location: 'Pen', coach_owner_id: COACH_ID },
  ];
  await upsert('baseball_practice_blocks', blocks);

  const attendanceStatuses = ['present', 'present', 'present', 'limited', 'present', 'excused', 'present', 'absent'] as const;
  const attendance: (BaseballPracticeAttendanceInsert & { id: string })[] = ROSTER.map((p, i) => ({
    id: detId(`attend:${p.key}`),
    team_id: TEAM_ID,
    practice_id: practiceId,
    player_id: playerIdByKey[p.key],
    status: attendanceStatuses[i % attendanceStatuses.length],
    reason:
      attendanceStatuses[i % attendanceStatuses.length] === 'excused' ? 'Class conflict'
      : attendanceStatuses[i % attendanceStatuses.length] === 'absent' ? 'Illness'
      : null,
  }));
  await upsert('baseball_practice_attendance', attendance);

  // --- 7. Lifting: exercises -> assignments -> results + readiness --------
  const exercises: (BaseballExerciseInsert & { id: string })[] = [
    { id: detId('ex:squat'), team_id: TEAM_ID, name: 'Back Squat', category: 'lower', description: 'Barbell back squat', created_by_coach_id: COACH_ID, is_global: false },
    { id: detId('ex:bench'), team_id: TEAM_ID, name: 'Bench Press', category: 'upper', description: 'Flat barbell bench', created_by_coach_id: COACH_ID, is_global: false },
    { id: detId('ex:dl'), team_id: TEAM_ID, name: 'Trap Bar Deadlift', category: 'lower', description: 'Hex-bar deadlift', created_by_coach_id: COACH_ID, is_global: false },
    { id: detId('ex:med'), name: 'Med Ball Rotational Throw', category: 'power', description: 'Rotational power', is_global: true },
  ];
  await upsert('baseball_exercises', exercises);

  const squatId = detId('ex:squat');
  const benchId = detId('ex:bench');
  const assignmentRows: (BaseballLiftAssignmentInsert & { id: string })[] = [];
  const resultRows: (BaseballLiftResultInsert & { id: string })[] = [];
  const readinessRows: (BaseballReadinessCheckinInsert & { id: string })[] = [];
  const armStatuses = ['fresh', 'normal', 'tight', 'normal', 'sore', 'fresh', 'normal', 'tight'] as const;

  for (const [i, p] of ROSTER.entries()) {
    const pid = playerIdByKey[p.key];
    // One per-player squat assignment (assigned) + a completed one.
    const aId = detId(`assign:squat:${p.key}`);
    assignmentRows.push({
      id: aId,
      team_id: TEAM_ID,
      player_id: pid,
      assigned_by_coach_id: COACH_ID,
      exercise_id: squatId,
      title: 'Lower-body strength',
      due_date: dateDaysAgo(-3),
      prescription: { sets: 4, reps: 5, intensity_pct: 80, rest_seconds: 150 },
      status: 'assigned',
    });
    // A completed bench assignment with a logged result.
    const aBench = detId(`assign:bench:${p.key}`);
    assignmentRows.push({
      id: aBench,
      team_id: TEAM_ID,
      player_id: pid,
      assigned_by_coach_id: COACH_ID,
      exercise_id: benchId,
      title: 'Upper-body strength',
      due_date: dateDaysAgo(2),
      prescription: { sets: 3, reps: 8, intensity_pct: 70 },
      status: 'completed',
    });
    resultRows.push({
      id: detId(`result:bench:${p.key}`),
      team_id: TEAM_ID,
      player_id: pid,
      assignment_id: aBench,
      exercise_id: benchId,
      performed_at: isoDaysAgo(2),
      sets: 3,
      reps: 8,
      weight: 155 + i * 5,
      rpe: 7.5,
      notes: 'Felt strong.',
      source: 'manual',
    });
    // A readiness check-in today.
    readinessRows.push({
      id: detId(`readiness:${p.key}`),
      team_id: TEAM_ID,
      player_id: pid,
      check_date: dateDaysAgo(0),
      sleep_hours: 7 + (i % 3),
      energy_level: 3 + (i % 3),
      soreness_level: 1 + (i % 4),
      arm_status: armStatuses[i % armStatuses.length],
      mood: i % 2 === 0 ? 'locked in' : 'a little tired',
      notes: null,
    });
  }
  await upsert('baseball_lift_assignments', assignmentRows);
  await upsert('baseball_lift_results', resultRows);
  await upsert('baseball_readiness_checkins', readinessRows);

  // --- 8. Coach insights WITH source attribution --------------------------
  // Demonstrates the Phase-1 attribution columns (source_refs / confidence /
  // lifecycle_state / player_visible / generated_by / dedupe_key) pointing at
  // the lineage + lifting/readiness rows seeded above.
  const demoPid = playerIdByKey[DEMO_PLAYER_KEY];
  const srcRefsReadiness: BaseballInsightSourceRef[] = [
    { table: 'baseball_readiness_checkins', column: 'arm_status', sample_n: 7, confidence: 0.8, label: 'Last 7 readiness check-ins', visibility: 'staff_only' },
    { table: 'baseball_lift_results', column: 'rpe', sample_n: ROSTER.length, confidence: 0.7, label: 'Recent bench RPE', visibility: 'team' },
  ];
  const srcRefsImport: BaseballInsightSourceRef[] = [
    { table: 'baseball_import_runs', id: importRunId, sample_n: ROSTER.length, confidence: 0.95, label: 'TrackMan demo import', visibility: 'staff_only' },
  ];
  await upsert('baseball_coach_insights', [
    {
      id: detId('insight:readiness'),
      team_id: TEAM_ID,
      coach_id: COACH_ID,
      player_id: demoPid,
      insight_type: 'readiness',
      title: 'Arm fatigue trending up',
      body: 'Reported arm status has drifted toward "tight/sore" while bench RPE held high. Consider a lighter throwing day.',
      priority: 'medium',
      status: 'open',
      // Phase-1 attribution columns:
      source_refs: srcRefsReadiness,
      confidence: 0.74,
      lifecycle_state: 'detected',
      player_visible: true,
      generated_by: 'demo_seed.readiness_trend',
      dedupe_key: `${TEAM_ID}:readiness_trend:${demoPid}`,
      last_generated_at: isoDaysAgo(0),
      metadata: { evidence: { source_refs: srcRefsReadiness } },
    },
    {
      id: detId('insight:import'),
      team_id: TEAM_ID,
      coach_id: COACH_ID,
      player_id: null,
      insight_type: 'data_quality',
      title: 'All TrackMan rows matched',
      body: 'The latest TrackMan import matched 100% of rows to roster players via external ids.',
      priority: 'low',
      status: 'open',
      source_refs: srcRefsImport,
      confidence: 0.95,
      lifecycle_state: 'detected',
      player_visible: false,
      generated_by: 'demo_seed.import_quality',
      dedupe_key: `${TEAM_ID}:import_quality`,
      last_generated_at: isoDaysAgo(7),
      metadata: { evidence: { source_refs: srcRefsImport } },
    },
  ]);

  // --- 9. Player timeline events (with source refs back to the data) ------
  const timelineRows: (BaseballPlayerTimelineEventInsert & { id: string })[] = [
    {
      id: detId('timeline:import'),
      player_id: demoPid,
      team_id: TEAM_ID,
      event_type: 'data_import',
      title: 'TrackMan data imported',
      body: 'Pitch/exit metrics matched from the latest TrackMan session.',
      source_type: 'baseball_import_runs',
      source_id: importRunId,
      confidence: 0.95,
      occurred_at: isoDaysAgo(7),
      created_by: coachUser.userId,
      visibility: 'team',
    },
    {
      id: detId('timeline:lift'),
      player_id: demoPid,
      team_id: TEAM_ID,
      event_type: 'lift_logged',
      title: 'Bench press logged',
      body: 'Completed assigned bench session at RPE 7.5.',
      source_type: 'baseball_lift_results',
      source_id: detId(`result:bench:${DEMO_PLAYER_KEY}`),
      occurred_at: isoDaysAgo(2),
      created_by: coachUser.userId,
      visibility: 'player_only',
    },
    {
      id: detId('timeline:insight'),
      player_id: demoPid,
      team_id: TEAM_ID,
      event_type: 'coach_insight',
      title: 'Coach flagged arm fatigue',
      body: 'Staff-only note from the readiness insight engine.',
      source_type: 'baseball_coach_insights',
      source_id: detId('insight:readiness'),
      confidence: 0.74,
      occurred_at: isoDaysAgo(0),
      created_by: coachUser.userId,
      visibility: 'staff_only',
    },
  ];
  await upsert('baseball_player_timeline_events', timelineRows);

  // --- Report -------------------------------------------------------------
  console.log(`\n${DRY ? '[DRY RUN] would seed' : 'Seeded'} rows:`);
  for (const [t, n] of Object.entries(counts)) console.log(`  ${t.padEnd(34)} ${n}`);
  console.log(`\nDemo logins (password: ${DEMO_PASSWORD}):`);
  console.log(`  COACH : ${DEMO_COACH_EMAIL}${coachUser.created ? ' (created)' : ' (existing)'}`);
  console.log(`  PLAYER: ${DEMO_PLAYER_EMAIL}${playerUser.created ? ' (created)' : ' (existing)'}`);
  console.log(`  Team  : Demo University Baseball (${TEAM_ID})`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
