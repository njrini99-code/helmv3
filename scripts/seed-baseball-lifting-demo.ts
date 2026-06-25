/**
 * seed-baseball-lifting-demo.ts — Helm Lifting Lab demo data helper.
 *
 * Extends the Phase-1 demo seed (scripts/seed-baseball-demo.ts) with:
 *
 *   (a) A LIFTING-COACH auth user (demo-lift-coach@baseballhelmdemo.com /
 *       BaseballDemo2026) wired into:
 *         * baseball_coaches          (coach profile, same org as demo team)
 *         * baseball_team_coach_staff (role='strength_coach', can_manage_lifting=true,
 *                                      can_view_readiness=true, visible_to_players=true)
 *         * helm_lifting_coaches      (cross-sport lifting identity, org-scoped)
 *         * helm_lifting_coach_assignments (baseball / demo team coverage)
 *
 *   (b) helm_lifting_* demo rows for the demo team's 8 players so
 *       /baseball/dashboard/performance renders populated content:
 *         * helm_lifting_athletes          (1 per player, 8 rows)
 *         * helm_lifting_exercises         (4 exercises — Squat, Bench, Deadlift, Med Ball)
 *         * helm_lifting_programs          (1 active in-season program)
 *           └─ helm_lifting_weeks         (2 weeks)
 *              └─ helm_lifting_days       (2 days per week = 4 days)
 *                 └─ helm_lifting_sections (1 section per day = 4 sections)
 *                    └─ helm_lifting_prescriptions (1–2 per section)
 *         * helm_lifting_program_assignments (4 assignments: 2 completed + 2 upcoming)
 *         * helm_lifting_sessions          (8 players × 4 assignments = up to 32, but
 *                                           we only materialize 2 past + 1 today + 1
 *                                           future per player = 32 sessions)
 *         * helm_lifting_session_exercises (2 exercises per session = 64 rows)
 *         * helm_lifting_set_results       (3 sets per completed exercise = ~96 rows
 *                                           for the 2 completed assignments)
 *         * helm_lifting_readiness_checkins (8 rows, one per player, last 7 days)
 *
 * SAFETY / IDEMPOTENCY (identical guarantees to seed-baseball-demo.ts):
 *   - All ids are deterministic (sha1 under a fixed namespace).
 *   - All writes use .upsert({ onConflict: 'id' }) — never delete-then-insert.
 *   - Auth users are looked up first; only created when missing.
 *   - Scoped strictly to the demo org/team/player ids already seeded by Phase-1.
 *     Phase-1 MUST have run first (this script depends on ORG_ID / TEAM_ID /
 *     COACH_ID / ROSTER player ids that it created).
 *
 * SAFE BY DEFAULT — dry run unless --confirm is passed.
 *
 * Run:
 *   # Dry run (prints plan, touches nothing):
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-baseball-lifting-demo.ts
 *   # Actually seed:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-baseball-lifting-demo.ts --confirm
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * TABLES SEEDED (helm_lifting_* and bridging baseball_* rows):
 *   baseball_coaches              (1 — lifting coach profile)
 *   baseball_team_coach_staff     (1 — lifting capability grant)
 *   helm_lifting_coaches          (1 — cross-sport identity)
 *   helm_lifting_coach_assignments(1 — baseball / demo team coverage)
 *   helm_lifting_athletes         (8 — one per demo roster player)
 *   helm_lifting_exercises        (4)
 *   helm_lifting_programs         (1)
 *   helm_lifting_weeks            (2)
 *   helm_lifting_days             (4)
 *   helm_lifting_sections         (4)
 *   helm_lifting_prescriptions    (7)
 *   helm_lifting_program_assignments (4)
 *   helm_lifting_sessions         (32)
 *   helm_lifting_session_exercises(64)
 *   helm_lifting_set_results      (96 — completed sessions only)
 *   helm_lifting_readiness_checkins (8)
 */

import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Shared identity (MUST match scripts/seed-baseball-demo.ts exactly).
// ---------------------------------------------------------------------------
const DEMO_DOMAIN = 'baseballhelmdemo.com';
const DEMO_PASSWORD = 'BaseballDemo2026';
const LIFT_COACH_EMAIL = `demo-lift-coach@${DEMO_DOMAIN}`;

// The Phase-1 seed uses 'baseballhelm-demo-phase1' as its namespace.
const NS_P1 = 'baseballhelm-demo-phase1';
// This helper uses a distinct namespace so its ids never collide with Phase-1.
const NS = 'baseballhelm-demo-lifting-v1';

function detId(key: string): string {
  const h = createHash('sha1').update(`${NS}:${key}`).digest('hex');
  const b = h.slice(0, 32).split('');
  b[12] = '5';
  b[16] = ((parseInt(b[16], 16) & 0x3) | 0x8).toString(16);
  const s = b.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/** Resolve a Phase-1 id — same algorithm, different namespace. */
function p1Id(key: string): string {
  const h = createHash('sha1').update(`${NS_P1}:${key}`).digest('hex');
  const b = h.slice(0, 32).split('');
  b[12] = '5';
  b[16] = ((parseInt(b[16], 16) & 0x3) | 0x8).toString(16);
  const s = b.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

// Phase-1 stable ids (mirrored from seed-baseball-demo.ts).
const ORG_ID = p1Id('org');
const TEAM_ID = p1Id('team');
const COACH_ID = p1Id('coach'); // existing head coach

// Phase-1 roster (same order as ROSTER in seed-baseball-demo.ts).
const ROSTER_KEYS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'] as const;
const ROSTER = [
  { key: 'p1', first: 'Marcus', last: 'Rodriguez', pos: 'SS' },
  { key: 'p2', first: 'Jake', last: 'Thompson', pos: 'C' },
  { key: 'p3', first: 'Caleb', last: 'Williams', pos: 'OF' },
  { key: 'p4', first: 'Ethan', last: 'Brooks', pos: 'P' },
  { key: 'p5', first: 'Noah', last: 'Mitchell', pos: '3B' },
  { key: 'p6', first: 'Liam', last: 'Harrison', pos: '2B' },
  { key: 'p7', first: 'Aiden', last: 'Clark', pos: 'P' },
  { key: 'p8', first: 'Owen', last: 'Davis', pos: 'OF' },
] as const;

// ---------------------------------------------------------------------------
// Date helpers.
// ---------------------------------------------------------------------------
const NOW = new Date();
function dateDaysAgo(days: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function dateDaysFromNow(days: number): string {
  return dateDaysAgo(-days);
}

// ---------------------------------------------------------------------------
// Upsert wrapper + counters.
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
    const msg = error.message ?? '';
    if (
      /could not find the table|schema cache|does not exist|could not find the '.*' column/i.test(
        msg,
      )
    ) {
      delete counts[table];
      skipped.push(`${table} — ${msg}`);
      console.warn(`  ⚠ skipped ${table} (schema not present): ${msg}`);
      return;
    }
    throw new Error(`upsert ${table} failed: ${msg}`);
  }
}

async function ensureAuthUser(
  email: string,
): Promise<{ userId: string | null; created: boolean }> {
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
  if (error ?? !data?.user) throw new Error(`createUser failed for ${email}: ${error?.message}`);
  return { userId: data.user.id, created: true };
}

// ===========================================================================
async function main() {
  const confirmed = process.argv.includes('--confirm');
  DRY = !confirmed;

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  if (DRY) {
    console.log('[DRY RUN] No --confirm flag — printing plan, writing NOTHING.');
    console.log('[DRY RUN] Re-run with --confirm to actually seed.\n');
  }
  console.log(`${DRY ? '[DRY RUN] ' : ''}Seeding Helm Lifting Lab demo data (org ${ORG_ID.slice(0, 8)} / team ${TEAM_ID.slice(0, 8)})`);

  // -------------------------------------------------------------------------
  // 0. Lifting-coach auth user
  // -------------------------------------------------------------------------
  const liftCoachUser = await ensureAuthUser(LIFT_COACH_EMAIL);
  const liftCoachUserId = liftCoachUser.userId ?? 'dry-run-lift-coach-user-id';

  // -------------------------------------------------------------------------
  // 1. baseball_coaches row for the lifting coach
  //    (required so baseball_team_coach_staff.coach_id FK is satisfied)
  // -------------------------------------------------------------------------
  const LIFT_COACH_BASEBALL_ID = detId('baseball_coach:lift');
  await upsert('baseball_coaches', [
    {
      id: LIFT_COACH_BASEBALL_ID,
      user_id: liftCoachUserId,
      organization_id: ORG_ID,
      coach_type: 'college',
      full_name: 'Demo Strength Coach',
      email: LIFT_COACH_EMAIL,
      title: 'Director of Strength & Conditioning',
      bio: 'Helm Lifting Lab demo strength coach. Manages all weight-room programming for the demo team.',
      onboarding_completed: true,
    },
  ]);

  // -------------------------------------------------------------------------
  // 2. baseball_team_coach_staff — lifting capability grant + player visibility
  //    Columns added by 20260625000040 (bio, phone, visible_to_players,
  //    scope_player_ids, scope_group_ids) plus the V11 capability flags
  //    (can_manage_lifting, can_view_readiness, etc.).
  //    The uq constraint is (team_id, coach_id) so conflict target is that pair.
  // -------------------------------------------------------------------------
  await upsert(
    'baseball_team_coach_staff',
    [
      {
        id: detId('staff:lift'),
        team_id: TEAM_ID,
        coach_id: LIFT_COACH_BASEBALL_ID,
        role: 'strength_coach',
        is_primary: false,
        // V11 capability flags — only the ones a strength/conditioning coach holds.
        can_manage_lifting: true,
        can_view_readiness: true,
        can_modify_availability: true,
        can_manage_roster: false,
        can_manage_practice: false,
        can_manage_lineups: false,
        can_view_academics: false,
        can_manage_imports: false,
        can_manage_stats: false,
        can_invite_staff: false,
        can_manage_settings: false,
        can_view_medical: false,
        can_view_private_notes: false,
        can_message_players: true,
        can_export_reports: true,
        can_manage_calendar: false,
        is_head_coach: false,
        // 20260625000040 columns:
        bio: 'Strength & conditioning coach for Demo University Baseball. Helm Lifting Lab demo account.',
        visible_to_players: true,
        scope_player_ids: null,
        scope_group_ids: null,
      },
    ],
    'team_id, coach_id',
  );

  // -------------------------------------------------------------------------
  // 3. helm_lifting_coaches — cross-sport lifting identity
  // -------------------------------------------------------------------------
  const HELM_LIFT_COACH_ID = detId('helm_lift_coach');
  await upsert('helm_lifting_coaches', [
    {
      id: HELM_LIFT_COACH_ID,
      user_id: liftCoachUserId,
      organization_id: ORG_ID,
      full_name: 'Demo Strength Coach',
      title: 'Director of Strength & Conditioning',
      email: LIFT_COACH_EMAIL,
      status: 'active',
      onboarding_completed: true,
    },
  ]);

  // -------------------------------------------------------------------------
  // 4. helm_lifting_coach_assignments — baseball / demo team coverage
  // -------------------------------------------------------------------------
  await upsert('helm_lifting_coach_assignments', [
    {
      id: detId('helm_lift_assign'),
      coach_id: HELM_LIFT_COACH_ID,
      organization_id: ORG_ID,
      sport: 'baseball',
      team_id: TEAM_ID,
      team_name_snapshot: 'Demo University Baseball',
      is_active: true,
      assigned_by_user_id: liftCoachUserId,
    },
  ]);

  // -------------------------------------------------------------------------
  // 5. helm_lifting_athletes — one per demo roster player
  //    sport_player_id → the player's deterministic id from Phase-1 seed.
  //    The unique constraint is (organization_id, sport, sport_player_id).
  // -------------------------------------------------------------------------
  const athleteRows = ROSTER.map((p) => ({
    id: detId(`athlete:${p.key}`),
    organization_id: ORG_ID,
    sport: 'baseball',
    sport_player_id: p1Id(`player:${p.key}`),
    user_id: null as string | null, // user_id is a SOFT ref; player logins from Phase-1 don't auto-link here
    team_id: TEAM_ID,
    first_name: p.first,
    last_name: p.last,
    position: p.pos,
    is_active: true,
  }));
  // Override user_id for the demo player login (p1 = demo-player@baseballhelmdemo.com)
  // We can't know it without a DB lookup, but the athlete row is still usable without it.
  await upsert('helm_lifting_athletes', athleteRows);

  // Build a local map: roster key → athlete id.
  const athleteIdByKey = Object.fromEntries(
    ROSTER_KEYS.map((k) => [k, detId(`athlete:${k}`)]),
  );

  // -------------------------------------------------------------------------
  // 6. helm_lifting_exercises — 4 exercises used by the demo program.
  //    The unique constraint is (organization_id, sport, lower(name)).
  //    All are org-scoped (is_global=false) and owned by the lifting coach.
  // -------------------------------------------------------------------------
  const EX_SQUAT = detId('ex:back_squat');
  const EX_BENCH = detId('ex:bench_press');
  const EX_DEADLIFT = detId('ex:trap_bar_dl');
  const EX_MEDBALL = detId('ex:medball_rot');

  await upsert('helm_lifting_exercises', [
    {
      id: EX_SQUAT,
      organization_id: ORG_ID,
      sport: 'baseball',
      created_by_coach_id: HELM_LIFT_COACH_ID,
      name: 'Back Squat',
      category: 'strength',
      primary_pattern: 'squat',
      body_region: 'lower',
      equipment: 'barbell',
      default_unit: 'lb',
      track_load: true,
      track_reps: true,
      track_sets: true,
      track_rpe: true,
      instructions: 'Barbell back squat to parallel. Drive knees out.',
      coaching_cues: ['Brace your core', 'Drive through your heels', 'Chest up'],
      is_global: false,
      is_active: true,
    },
    {
      id: EX_BENCH,
      organization_id: ORG_ID,
      sport: 'baseball',
      created_by_coach_id: HELM_LIFT_COACH_ID,
      name: 'Bench Press',
      category: 'strength',
      primary_pattern: 'push',
      body_region: 'upper',
      equipment: 'barbell',
      default_unit: 'lb',
      track_load: true,
      track_reps: true,
      track_sets: true,
      track_rpe: true,
      instructions: 'Flat barbell bench. Control the descent.',
      coaching_cues: ['Retract your scapula', 'Slight arch', 'Drive feet into the floor'],
      is_global: false,
      is_active: true,
    },
    {
      id: EX_DEADLIFT,
      organization_id: ORG_ID,
      sport: 'baseball',
      created_by_coach_id: HELM_LIFT_COACH_ID,
      name: 'Trap Bar Deadlift',
      category: 'strength',
      primary_pattern: 'hinge',
      body_region: 'lower',
      equipment: 'hex bar',
      default_unit: 'lb',
      track_load: true,
      track_reps: true,
      track_sets: true,
      track_rpe: true,
      instructions: 'Hex-bar deadlift. Hinge at the hips, keep spine neutral.',
      coaching_cues: ['Proud chest', 'Push the floor away', 'Lock out at the top'],
      is_global: false,
      is_active: true,
    },
    {
      id: EX_MEDBALL,
      organization_id: ORG_ID,
      sport: 'baseball',
      created_by_coach_id: HELM_LIFT_COACH_ID,
      name: 'Med Ball Rotational Throw',
      category: 'power',
      primary_pattern: 'rotate',
      body_region: 'trunk',
      equipment: 'medicine ball',
      default_unit: 'reps',
      track_load: false,
      track_reps: true,
      track_sets: true,
      track_rpe: false,
      instructions: 'Rotational hip-to-shoulder power — wall or partner.',
      coaching_cues: ['Load the hip', 'Sequential link', 'Full follow-through'],
      is_global: false,
      is_active: true,
    },
  ]);

  // -------------------------------------------------------------------------
  // 7. helm_lifting_programs — one active in-season program.
  // -------------------------------------------------------------------------
  const PROGRAM_ID = detId('prog:inseason_2026');
  await upsert('helm_lifting_programs', [
    {
      id: PROGRAM_ID,
      organization_id: ORG_ID,
      sport: 'baseball',
      team_id: TEAM_ID,
      name: 'In-Season Strength Maintenance — Demo',
      description: 'Two-day upper/lower split designed to maintain strength gains during the competitive season.',
      phase: 'in_season',
      goal: 'maintenance',
      created_by_coach_id: HELM_LIFT_COACH_ID,
      visibility: 'assigned_players',
      status: 'active',
      is_template: false,
      start_date: dateDaysAgo(14),
      end_date: dateDaysFromNow(28),
    },
  ]);

  // -------------------------------------------------------------------------
  // 8. helm_lifting_weeks — 2 weeks.
  // -------------------------------------------------------------------------
  const WEEK1_ID = detId('week:1');
  const WEEK2_ID = detId('week:2');
  await upsert('helm_lifting_weeks', [
    {
      id: WEEK1_ID,
      program_id: PROGRAM_ID,
      week_number: 1,
      name: 'Week 1 — Base Load',
      theme: 'Establish baseline; moderate intensity.',
      deload: false,
    },
    {
      id: WEEK2_ID,
      program_id: PROGRAM_ID,
      week_number: 2,
      name: 'Week 2 — Progress',
      theme: 'Add 5% load to main lifts.',
      deload: false,
    },
  ]);

  // -------------------------------------------------------------------------
  // 9. helm_lifting_days — 2 per week = 4 total.
  //    Day 1 = lower body, Day 2 = upper body.
  // -------------------------------------------------------------------------
  const DAY_W1D1 = detId('day:w1:lower');
  const DAY_W1D2 = detId('day:w1:upper');
  const DAY_W2D1 = detId('day:w2:lower');
  const DAY_W2D2 = detId('day:w2:upper');

  await upsert('helm_lifting_days', [
    { id: DAY_W1D1, week_id: WEEK1_ID, day_number: 1, name: 'W1 Lower', day_type: 'lower', sport_context: 'post_game_recovery', estimated_minutes: 45 },
    { id: DAY_W1D2, week_id: WEEK1_ID, day_number: 2, name: 'W1 Upper', day_type: 'upper', sport_context: 'off_day', estimated_minutes: 45 },
    { id: DAY_W2D1, week_id: WEEK2_ID, day_number: 1, name: 'W2 Lower', day_type: 'lower', sport_context: 'post_game_recovery', estimated_minutes: 50 },
    { id: DAY_W2D2, week_id: WEEK2_ID, day_number: 2, name: 'W2 Upper', day_type: 'upper', sport_context: 'off_day', estimated_minutes: 50 },
  ]);

  // -------------------------------------------------------------------------
  // 10. helm_lifting_sections — 1 main_strength section per day.
  // -------------------------------------------------------------------------
  const SEC_W1D1 = detId('sec:w1:lower');
  const SEC_W1D2 = detId('sec:w1:upper');
  const SEC_W2D1 = detId('sec:w2:lower');
  const SEC_W2D2 = detId('sec:w2:upper');

  await upsert('helm_lifting_sections', [
    { id: SEC_W1D1, lift_day_id: DAY_W1D1, section_order: 0, name: 'Main Strength — Lower', section_type: 'main_strength' },
    { id: SEC_W1D2, lift_day_id: DAY_W1D2, section_order: 0, name: 'Main Strength — Upper', section_type: 'main_strength' },
    { id: SEC_W2D1, lift_day_id: DAY_W2D1, section_order: 0, name: 'Main Strength — Lower', section_type: 'main_strength' },
    { id: SEC_W2D2, lift_day_id: DAY_W2D2, section_order: 0, name: 'Main Strength — Upper', section_type: 'main_strength' },
  ]);

  // -------------------------------------------------------------------------
  // 11. helm_lifting_prescriptions.
  //    Lower days: Squat (4×5 @80%) + Med Ball (3×6 @bodyweight).
  //    Upper days: Bench (3×8 @70%) + Deadlift (3×5 @75%).
  // -------------------------------------------------------------------------
  await upsert('helm_lifting_prescriptions', [
    // W1 lower
    { id: detId('pr:w1:lower:squat'), section_id: SEC_W1D1, exercise_id: EX_SQUAT, order_index: 0, prescription_type: 'percent_1rm', sets: 4, reps: 5, percent_1rm: 80, rest_seconds: 150, coaching_note: 'Control the eccentric; 2-count down.' },
    { id: detId('pr:w1:lower:med'), section_id: SEC_W1D1, exercise_id: EX_MEDBALL, order_index: 1, prescription_type: 'fixed', sets: 3, reps: 6, coaching_note: 'Max intent on every rep.' },
    // W1 upper
    { id: detId('pr:w1:upper:bench'), section_id: SEC_W1D2, exercise_id: EX_BENCH, order_index: 0, prescription_type: 'percent_1rm', sets: 3, reps: 8, percent_1rm: 70, rest_seconds: 120, coaching_note: 'Touch-and-go; no bouncing.' },
    { id: detId('pr:w1:upper:dl'), section_id: SEC_W1D2, exercise_id: EX_DEADLIFT, order_index: 1, prescription_type: 'percent_1rm', sets: 3, reps: 5, percent_1rm: 75, rest_seconds: 150 },
    // W2 lower
    { id: detId('pr:w2:lower:squat'), section_id: SEC_W2D1, exercise_id: EX_SQUAT, order_index: 0, prescription_type: 'percent_1rm', sets: 4, reps: 5, percent_1rm: 85, rest_seconds: 180, coaching_note: 'Intensity up 5% from Week 1.' },
    { id: detId('pr:w2:lower:med'), section_id: SEC_W2D1, exercise_id: EX_MEDBALL, order_index: 1, prescription_type: 'fixed', sets: 3, reps: 8 },
    // W2 upper
    { id: detId('pr:w2:upper:bench'), section_id: SEC_W2D2, exercise_id: EX_BENCH, order_index: 0, prescription_type: 'percent_1rm', sets: 4, reps: 6, percent_1rm: 75, rest_seconds: 120 },
  ]);

  // -------------------------------------------------------------------------
  // 12. helm_lifting_program_assignments.
  //    4 team-scoped assignments:
  //      PA1: W1 lower — 10 days ago (completed)
  //      PA2: W1 upper — 7 days ago  (completed)
  //      PA3: W2 lower — today        (in progress / assigned)
  //      PA4: W2 upper — 3 days from now (upcoming)
  // -------------------------------------------------------------------------
  const PA1 = detId('pa:w1:lower');
  const PA2 = detId('pa:w1:upper');
  const PA3 = detId('pa:w2:lower');
  const PA4 = detId('pa:w2:upper');

  await upsert('helm_lifting_program_assignments', [
    {
      id: PA1,
      organization_id: ORG_ID,
      sport: 'baseball',
      team_id: TEAM_ID,
      program_id: PROGRAM_ID,
      lift_day_id: DAY_W1D1,
      assigned_by_coach_id: HELM_LIFT_COACH_ID,
      assignment_type: 'team',
      scheduled_date: dateDaysAgo(10),
      status: 'published',
      player_visible_at: new Date(Date.now() - 10 * 86400000 - 3600000).toISOString(),
    },
    {
      id: PA2,
      organization_id: ORG_ID,
      sport: 'baseball',
      team_id: TEAM_ID,
      program_id: PROGRAM_ID,
      lift_day_id: DAY_W1D2,
      assigned_by_coach_id: HELM_LIFT_COACH_ID,
      assignment_type: 'team',
      scheduled_date: dateDaysAgo(7),
      status: 'published',
      player_visible_at: new Date(Date.now() - 7 * 86400000 - 3600000).toISOString(),
    },
    {
      id: PA3,
      organization_id: ORG_ID,
      sport: 'baseball',
      team_id: TEAM_ID,
      program_id: PROGRAM_ID,
      lift_day_id: DAY_W2D1,
      assigned_by_coach_id: HELM_LIFT_COACH_ID,
      assignment_type: 'team',
      scheduled_date: dateDaysAgo(0),
      status: 'published',
      player_visible_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: PA4,
      organization_id: ORG_ID,
      sport: 'baseball',
      team_id: TEAM_ID,
      program_id: PROGRAM_ID,
      lift_day_id: DAY_W2D2,
      assigned_by_coach_id: HELM_LIFT_COACH_ID,
      assignment_type: 'team',
      scheduled_date: dateDaysFromNow(3),
      status: 'published',
      player_visible_at: new Date(Date.now() + 86400000).toISOString(),
    },
  ]);

  // -------------------------------------------------------------------------
  // 13. helm_lifting_sessions + 14. helm_lifting_session_exercises
  //     + 15. helm_lifting_set_results.
  //
  //     One session per athlete per program_assignment (4 assignments × 8 players
  //     = 32 sessions).
  //
  //     The unique constraint on helm_lifting_sessions is
  //       (program_assignment_id, athlete_id)
  //     so upsert by id is safe (no collision on NULL program_assignment_id rows).
  //
  //     Completed assignments (PA1, PA2): status='completed', set_results seeded.
  //     Today (PA3): status='assigned' (no set_results yet).
  //     Future (PA4): status='assigned' (no set_results).
  //
  //     Session exercises: 2 per session (the prescriptions for that day).
  //     Set results: 3 sets per completed exercise (3 × 2 exercises = 6 per
  //     player per completed assignment = 6 × 8 × 2 = 96 rows total).
  // -------------------------------------------------------------------------
  const sessionRows: Record<string, unknown>[] = [];
  const sessionExRows: Record<string, unknown>[] = [];
  const setResultRows: Record<string, unknown>[] = [];

  // Exercise/prescription pairings per assignment:
  const PA_DAY_MAP: Record<
    string,
    { dayId: string; exercises: { prescId: string; exId: string; name: string; sType: string }[] }
  > = {
    [PA1]: {
      dayId: DAY_W1D1,
      exercises: [
        { prescId: detId('pr:w1:lower:squat'), exId: EX_SQUAT, name: 'Back Squat', sType: 'main_strength' },
        { prescId: detId('pr:w1:lower:med'), exId: EX_MEDBALL, name: 'Med Ball Rotational Throw', sType: 'main_strength' },
      ],
    },
    [PA2]: {
      dayId: DAY_W1D2,
      exercises: [
        { prescId: detId('pr:w1:upper:bench'), exId: EX_BENCH, name: 'Bench Press', sType: 'main_strength' },
        { prescId: detId('pr:w1:upper:dl'), exId: EX_DEADLIFT, name: 'Trap Bar Deadlift', sType: 'main_strength' },
      ],
    },
    [PA3]: {
      dayId: DAY_W2D1,
      exercises: [
        { prescId: detId('pr:w2:lower:squat'), exId: EX_SQUAT, name: 'Back Squat', sType: 'main_strength' },
        { prescId: detId('pr:w2:lower:med'), exId: EX_MEDBALL, name: 'Med Ball Rotational Throw', sType: 'main_strength' },
      ],
    },
    [PA4]: {
      dayId: DAY_W2D2,
      exercises: [
        { prescId: detId('pr:w2:upper:bench'), exId: EX_BENCH, name: 'Bench Press', sType: 'main_strength' },
      ],
    },
  };

  const PA_DATE_MAP: Record<string, string> = {
    [PA1]: dateDaysAgo(10),
    [PA2]: dateDaysAgo(7),
    [PA3]: dateDaysAgo(0),
    [PA4]: dateDaysFromNow(3),
  };

  // Vary loads slightly per player to look realistic.
  const LOAD_BASE: Record<string, number> = {
    [EX_SQUAT]: 225,
    [EX_BENCH]: 155,
    [EX_DEADLIFT]: 285,
    [EX_MEDBALL]: 0,
  };
  const LOAD_STEP: Record<string, number> = {
    [EX_SQUAT]: 10,
    [EX_BENCH]: 5,
    [EX_DEADLIFT]: 15,
    [EX_MEDBALL]: 0,
  };

  const paKeys = [PA1, PA2, PA3, PA4];
  for (const [pi, paId] of paKeys.entries()) {
    const paDate = PA_DATE_MAP[paId];
    const isCompleted = pi < 2; // PA1, PA2 are completed
    const dayMap = PA_DAY_MAP[paId];

    for (const [ri, p] of ROSTER.entries()) {
      const athId = athleteIdByKey[p.key];
      const sessId = detId(`sess:${paId.slice(0, 8)}:${p.key}`);

      sessionRows.push({
        id: sessId,
        program_assignment_id: paId,
        organization_id: ORG_ID,
        sport: 'baseball',
        team_id: TEAM_ID,
        athlete_id: athId,
        title: isCompleted
          ? `${dayMap.exercises[0].name} day — ${paDate}`
          : pi === 2
            ? `Today\'s lift — ${dayMap.exercises[0].name} day`
            : `Upcoming — ${dayMap.exercises[0].name} day (${paDate})`,
        day_type: pi % 2 === 0 ? 'lower' : 'upper',
        scheduled_date: paDate,
        estimated_minutes: 45 + (pi > 1 ? 5 : 0),
        status: isCompleted ? 'completed' : 'assigned',
        started_at: isCompleted
          ? new Date(Date.now() - (pi === 0 ? 10 : 7) * 86400000 - 5400000).toISOString()
          : null,
        completed_at: isCompleted
          ? new Date(Date.now() - (pi === 0 ? 10 : 7) * 86400000).toISOString()
          : null,
        coach_review_status: isCompleted ? 'reviewed' : 'none',
        player_note: isCompleted && ri % 3 === 0 ? 'Felt strong today.' : null,
        coach_note: isCompleted && ri === 0 ? 'Great intensity — keep it up.' : null,
      });

      for (const [ei, ex] of dayMap.exercises.entries()) {
        const seId = detId(`se:${paId.slice(0, 8)}:${p.key}:${ei}`);
        sessionExRows.push({
          id: seId,
          session_id: sessId,
          prescription_id: ex.prescId,
          exercise_id: ex.exId,
          exercise_name_snapshot: ex.name,
          section_name_snapshot: 'Main Strength',
          section_type_snapshot: ex.sType,
          order_index: ei,
          prescribed_sets: 3 + (pi === 0 && ei === 0 ? 1 : 0), // W1 lower squat = 4 sets
          prescribed_reps: ex.exId === EX_SQUAT || ex.exId === EX_DEADLIFT ? 5 : ex.exId === EX_MEDBALL ? 6 : 8,
          prescribed_load: LOAD_BASE[ex.exId] > 0 ? LOAD_BASE[ex.exId] + ri * LOAD_STEP[ex.exId] : null,
          prescribed_load_unit: LOAD_BASE[ex.exId] > 0 ? 'lb' : null,
          status: isCompleted ? 'completed' : 'assigned',
        });

        // Set results only for completed sessions.
        if (isCompleted) {
          const numSets = 3 + (pi === 0 && ei === 0 ? 1 : 0);
          const baseLoad = LOAD_BASE[ex.exId] + ri * LOAD_STEP[ex.exId];
          const actualLoad = LOAD_BASE[ex.exId] > 0 ? baseLoad + (ri % 2 === 0 ? 5 : 0) : null;
          for (let s = 1; s <= numSets; s++) {
            setResultRows.push({
              id: detId(`sr:${paId.slice(0, 8)}:${p.key}:${ei}:${s}`),
              session_exercise_id: seId,
              organization_id: ORG_ID,
              sport: 'baseball',
              athlete_id: athId,
              set_number: s,
              prescribed_reps: ex.exId === EX_SQUAT || ex.exId === EX_DEADLIFT ? 5 : ex.exId === EX_MEDBALL ? 6 : 8,
              actual_reps: ex.exId === EX_SQUAT || ex.exId === EX_DEADLIFT ? 5 : ex.exId === EX_MEDBALL ? 6 : 8,
              prescribed_load: actualLoad,
              actual_load: actualLoad,
              load_unit: actualLoad !== null ? 'lb' : null,
              rpe: 6.5 + (s === numSets ? 0.5 : 0) + (ri % 3 === 0 ? 0.5 : 0),
              completed_at: new Date(Date.now() - (pi === 0 ? 10 : 7) * 86400000 - (numSets - s) * 180000).toISOString(),
              coach_observed: ri === 0 && s === numSets,
            });
          }
        }
      }
    }
  }

  await upsert('helm_lifting_sessions', sessionRows);
  await upsert('helm_lifting_session_exercises', sessionExRows);
  if (setResultRows.length) await upsert('helm_lifting_set_results', setResultRows);

  // -------------------------------------------------------------------------
  // 16. helm_lifting_readiness_checkins — one per player, last 1–5 days.
  //     Uses the helm_lifting_* schema columns (checkin_date, sleep_quality,
  //     energy_level, soreness_overall, stress_level, lower_body_status,
  //     illness_flag, mood, readiness_score, readiness_band) — NOT the
  //     baseball_readiness_checkins columns (which have different names).
  //     Unique constraint: (athlete_id, checkin_date).
  // -------------------------------------------------------------------------
  const bands = ['green', 'green', 'yellow', 'green', 'orange_lower', 'green', 'yellow', 'green'] as const;
  const checkinRows = ROSTER.map((p, i) => {
    const athId = athleteIdByKey[p.key];
    const daysAgo = (i % 3) + 1; // 1, 2, or 3 days ago — avoids today's date colliding if run twice on same day
    const sleepQ = 3 + (i % 3);   // 3–5
    const energyLvl = 2 + (i % 4); // 2–5
    const soreness = (i % 7);       // 0–6
    const stress = 2 + (i % 3);    // 2–4
    const lowerBody = 3 + (i % 3); // 3–5
    const moodScore = 3 + (i % 3); // 3–5
    // Simple transparent readiness score: average of 1–5 dimensions, scaled 0–10.
    const rawScore = ((sleepQ + energyLvl + (5 - Math.round(soreness / 2)) + (6 - stress) + lowerBody) / 5);
    const readinessScore = Math.round(rawScore * 10) / 10;
    return {
      id: detId(`checkin:${p.key}`),
      organization_id: ORG_ID,
      sport: 'baseball',
      athlete_id: athId,
      checkin_date: dateDaysAgo(daysAgo),
      sleep_quality: sleepQ,
      energy_level: energyLvl,
      soreness_overall: soreness,
      stress_level: stress,
      lower_body_status: lowerBody,
      illness_flag: false,
      mood: moodScore,
      notes: i === 3 ? 'Hamstring a bit tight from yesterday\'s game.' : null,
      readiness_score: readinessScore,
      readiness_band: bands[i],
      visibility: 'performance_staff',
    };
  });
  await upsert('helm_lifting_readiness_checkins', checkinRows);

  // -------------------------------------------------------------------------
  // Report.
  // -------------------------------------------------------------------------
  console.log(`\n${DRY ? '[DRY RUN] would seed' : 'Seeded'} rows:`);
  for (const [t, n] of Object.entries(counts)) {
    console.log(`  ${t.padEnd(38)} ${n}`);
  }
  if (skipped.length) {
    console.log('\nSkipped (schema not present):');
    for (const s of skipped) console.log(`  ⚠ ${s}`);
  }
  console.log(`\nDemo logins (password: ${DEMO_PASSWORD}):`);
  console.log(`  LIFT-COACH: ${LIFT_COACH_EMAIL}${liftCoachUser.created ? ' (created)' : ' (existing)'}`);
  console.log(`\nhelm_lifting_* tables seeded:`);
  console.log(`  helm_lifting_coaches            1 (lifting-coach cross-sport identity)`);
  console.log(`  helm_lifting_coach_assignments  1 (baseball / demo team)`);
  console.log(`  helm_lifting_athletes           8 (one per roster player)`);
  console.log(`  helm_lifting_exercises          4 (Squat, Bench, Deadlift, Med Ball)`);
  console.log(`  helm_lifting_programs           1 (In-Season Maintenance)`);
  console.log(`  helm_lifting_weeks              2`);
  console.log(`  helm_lifting_days               4`);
  console.log(`  helm_lifting_sections           4`);
  console.log(`  helm_lifting_prescriptions      7`);
  console.log(`  helm_lifting_program_assignments 4 (2 past / 1 today / 1 future)`);
  console.log(`  helm_lifting_sessions           ${sessionRows.length} (8 players × 4 assignments)`);
  console.log(`  helm_lifting_session_exercises  ${sessionExRows.length}`);
  console.log(`  helm_lifting_set_results        ${setResultRows.length} (completed only)`);
  console.log(`  helm_lifting_readiness_checkins 8`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
