/**
 * seed-baseball-demo.ts — Phase-1 BaseballHelm demo seed.
 *
 * Seeds ONE demo team ("Demo University Baseball") across the Phase-1 tables so
 * the BaseballHelm surfaces (timeline, acknowledgements, imports, practice
 * planner, announcements, travel, documents, Lift Lab progression, postgame
 * action review, coach insights with source attribution) all render real,
 * internally-consistent data for a demo login.
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
 *     if missing — never deleted. The two synthetic CI identities (demo-coach@
 *     / demo-player@baseballhelmdemo.com) have their password force-set on
 *     every run (non-destructive — same DEMO_PASSWORD every time) to prevent
 *     credential drift from bricking CI logins; all other seeded identities
 *     keep the "never password-reset" rule.
 *   - Scoped strictly to the demo org/team ids below. Touches nothing else.
 *
 * DO NOT run automatically. This is a user-run script.
 *
 * SAFE BY DEFAULT
 *   - With no flags it does a DRY RUN: it prints exactly what it WOULD seed
 *     (every table + row count) and writes NOTHING to the database or auth.
 *   - It only writes when you pass --confirm explicitly.
 *   - PRODUCTION IS REFUSED even with --confirm. It additionally requires
 *     --allow-prod, the same escape hatch scripts/seed-baseball-stats.mjs and
 *     seed-baseball-box-scores.mjs use for the same project. Any other remote
 *     project must be named back to the script. See assertWriteTargetAllowed().
 *
 * Run (later, by the user):
 *   # 1. Dry run (default — prints the plan, touches nothing):
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-baseball-demo.ts
 *   # 2. Seed a LOCAL stack (the intended target — `supabase start` first):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 npx tsx scripts/seed-baseball-demo.ts --confirm
 *   # 3. Seed production (deliberate, loud, rarely correct):
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-baseball-demo.ts --confirm --allow-prod
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * WHAT IT SEEDS (only tables that exist and are LIVE — see the graveyard note):
 *   organizations · baseball_teams · baseball_coaches · baseball_players ·
 *   baseball_team_members · baseball_events · baseball_event_acknowledgements ·
 *   baseball_import_runs · baseball_player_external_ids · baseball_practices ·
 *   baseball_practice_blocks · baseball_practice_attendance · baseball_exercises ·
 *   baseball_announcements · baseball_announcement_recipients ·
 *   baseball_announcement_acknowledgements · baseball_travel_itineraries ·
 *   baseball_travel_expenses · baseball_documents · baseball_document_versions ·
 *   baseball_games · baseball_box_score_batting · baseball_box_score_pitching ·
 *   baseball_postgame_reviews · baseball_postgame_review_items ·
 *   helm_lifting_athletes · helm_lifting_exercises · helm_lifting_maxes ·
 *   helm_lifting_bodyweight_entries ·
 *   baseball_coach_insights · baseball_player_timeline_events
 *
 * GRAVEYARDED TABLES THIS SCRIPT USED TO WRITE (removed 2026-07-29):
 *   baseball_lift_assignments · baseball_lift_results · baseball_readiness_checkins
 *   were moved out of `public` into the `graveyard` schema by
 *   supabase/migrations/20260704070000_graveyard_dead_liftlab_tables_phase2.sql.
 *   `graveyard` is not in PostgREST's exposed schemas, so those upserts could
 *   only ever fail — and the failure text ("could not find the table ... in the
 *   schema cache") matched this script's own schema-skip filter, so the rows
 *   were dropped from the summary and the run still reported success. The
 *   live successors are the helm_lifting_* family, and the sessions/set-results/
 *   readiness half of it is already seeded in full by Phase 2
 *   (scripts/seed-baseball-lifting-demo.ts) — so those three writes are simply
 *   GONE here rather than repointed. What Phase 2 does NOT cover, and what this
 *   script now owns, is the progression layer: helm_lifting_maxes and
 *   helm_lifting_bodyweight_entries (see section 7).
 *
 * Demo login it assumes / creates (parallels golfhelmdemo.com):
 *   COACH  : demo-coach@baseballhelmdemo.com  / BaseballDemo2026
 *   PLAYER : demo-player@baseballhelmdemo.com / BaseballDemo2026
 *   (the 7 bench players also get deterministic auth users — see below — because
 *    baseball_players.user_id is NOT NULL + UNIQUE + FK to public.users.)
 *
 * SCHEMA GAPS / NOTES (things this seed deliberately does NOT touch):
 *   - Exactly ONE game and its box score, seeded only because a postgame
 *     action review is FK-bound to a game and is meaningless without the
 *     lines it cites (see section 11). This is NOT the stats seeder: no
 *     baseball_player_stats / baseball_player_aggregates /
 *     baseball_player_season_stats rows are written here, so a Phase-1-only
 *     database still shows an honestly-empty Stats Center. The stats seeders
 *     are scripts/seed-baseball-stats.mjs (#379) and Phase 4
 *     (scripts/seed-baseball-demo-program.ts), which recalculates season
 *     stats through the same RPC the app uses and will pick this game up.
 *   - No recruiting data of any kind. The recruiting module is SUNSET
 *     (src/lib/baseball/product-modules.ts, enabled: false) — the product
 *     being sold is team operations + player development + Lift Lab.
 *   - baseball_coaches.email column is set; if your prod copy lacks it the row
 *     still inserts (extra keys are rejected by PostgREST, so keep this in sync
 *     with the live schema if you see a column error).
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createRetryingFetch, describeFetchError } from './lib/retrying-fetch';
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

// ---------------------------------------------------------------------------
// PRODUCTION-TARGET GUARD — now shared, see scripts/lib/seed-target-guard.ts.
//
// The rules and the reasoning behind them (production is a DENY, not an ALLOW;
// `.local` is not a loopback suffix; a foreign project must be named back) live
// in that module's header. It was extracted from this file because
// scripts/seed-baseball-e2e.ts had NO target guard at all while CI ran it
// against production on every push — a safety rule only one of its callers
// enforces is not a safety rule. Extracting it also made the rules executable:
// scripts/lib/__tests__/seed-target-guard.test.ts now asserts them by calling
// them instead of grepping this file for the string "HELM_PROD_PROJECT_REF".
// ---------------------------------------------------------------------------
import {
  assertWriteTargetAllowed,
  describeSeedTarget,
} from './lib/seed-target-guard';

const DESTRUCTIVE_WARNING = [
  'This script creates a fake "Demo University" org and 10 auth users,',
  'force-resets two passwords, and deletes login_attempts rows.',
].join('\n');

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
import type { BaseballExerciseInsert } from '../src/lib/types/baseball-lifting';
import type { BaseballInsightSourceRef } from '../src/lib/types/baseball-coachhelm';
import type {
  BaseballPostgameReviewInsert,
  BaseballPostgameReviewItemInsert,
} from '../src/lib/types/baseball-postgame';
// The demo's postgame review is generated by the SAME pure builder the product
// runs (src/lib/baseball/postgame/build-review.ts), fed the exact box-score
// rows seeded below — so every sentence and every source_ref in the demo is a
// real generator output over real rows, not hand-written marketing prose. If
// the builder's thresholds change, the seeded review changes with them.
import {
  buildPostgameReview,
  type PostgameBattingLine,
  type PostgameGameInput,
  type PostgamePitchingLine,
} from '../src/lib/baseball/postgame/build-review';

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
// Namespace-parameterised so this script can also re-derive ANOTHER phase's ids
// byte-for-byte (see the cross-phase convergence note in section 7b) — the same
// `detIdIn` shape scripts/seed-baseball-demo-program.ts uses.
function detIdIn(namespace: string, key: string): string {
  const h = createHash('sha1').update(`${namespace}:${key}`).digest('hex');
  // Format as a v5 uuid (set version nibble + variant).
  const b = h.slice(0, 32).split('');
  b[12] = '5';
  b[16] = ((parseInt(b[16], 16) & 0x3) | 0x8).toString(16);
  const s = b.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

const detId = (key: string) => detIdIn(NS, key);

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
// Sub-day offsets. isoDaysAgo() cannot express these: setUTCDate() truncates a
// fractional argument to an integer, so isoDaysAgo(2.5) is silently isoDaysAgo(2).
function isoHoursAgo(hours: number): string {
  const d = new Date(NOW);
  d.setUTCHours(d.getUTCHours() - hours);
  return d.toISOString();
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
// Never deletes.
//
// PASSWORD DRIFT (2026-07-03 CI forensics): for every OTHER seeded identity
// (the 7 bench players) an existing user's password is left untouched, same
// as always. But for the two synthetic CI identities — DEMO_COACH_EMAIL /
// DEMO_PLAYER_EMAIL, the ones playwright/baseball-auth.setup.ts logs in
// as — an existing row whose actual auth password has drifted from
// DEMO_PASSWORD (e.g. someone rotated E2E_BASEBALL_*_PASSWORD without
// updating the live user, or a manual password reset) turns every CI run
// into a failed login. Playwright's retry logic (up to 3x) then hammers
// that login 3 times per run, and login_attempts (10 failures -> 30min
// lock) turns the FIRST bad run into a self-sustaining lockout for every
// run after it, even after the credential mismatch is fixed. Force-setting
// the password on every run for just these two accounts makes the seed the
// single source of truth for their credentials, closing that loop.
// ---------------------------------------------------------------------------
const FORCE_PASSWORD_RESET_EMAILS = new Set(
  [DEMO_COACH_EMAIL, DEMO_PLAYER_EMAIL].map((e) => e.toLowerCase()),
);

// ---------------------------------------------------------------------------
// Transient-failure resilience
// ---------------------------------------------------------------------------
// Every Supabase request this script makes goes through `retryingFetch` (wired
// into the client in main()). See scripts/lib/retrying-fetch.ts for the full
// rationale — in short, this seed gates a REQUIRED CI check, so one unretried
// request turns a ten-second Supabase blip into a repo-wide merge freeze.
const retryingFetch = createRetryingFetch();

async function ensureAuthUser(email: string): Promise<{ userId: string | null; created: boolean }> {
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  const forcePassword = FORCE_PASSWORD_RESET_EMAILS.has(email.toLowerCase());

  if (existing) {
    if (forcePassword && !DRY) {
      const { error: resetErr } = await supabase.auth.admin.updateUserById(existing.id as string, {
        password: DEMO_PASSWORD,
      });
      if (resetErr) {
        // Don't fail the whole seed over this — but surface it loudly, since
        // a silent failure here is exactly the "self-sustaining lockout"
        // this guard exists to prevent.
        console.warn(`  ⚠ password force-reset failed for ${email}: ${resetErr.message}`);
      }
    }
    return { userId: existing.id as string, created: false };
  }
  if (DRY) return { userId: null, created: false };
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (error || !data?.user) {
    // `createUser` is a POST, and retryingFetch above may replay it. A 522
    // fails the RESPONSE, not necessarily the write — so the origin can have
    // created the user and then timed out answering. The replay then comes
    // back "already registered", which for a SEED is success wearing a
    // failure's clothes: the row we wanted exists. Re-resolve and carry on
    // rather than failing a required check over our own retry.
    const message = describeFetchError(error);
    if (/already (been )?registered|already exists|duplicate key/i.test(message)) {
      const { data: found } = await supabase
        .from('users')
        .select('id')
        .ilike('email', email)
        .maybeSingle();
      if (found?.id) return { userId: found.id as string, created: false };
    }
    throw new Error(`createUser failed for ${email}: ${message}`);
  }
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

  // Resolve and PRINT the target before creating the client, so the operator
  // sees which database is about to be touched in both modes — a dry run whose
  // plan looks right but whose target is wrong is the exact failure this
  // banner exists to catch. The write gate runs before the first write.
  const target = describeSeedTarget(url);
  console.log(
    `Target Supabase: ${target.host}${target.isLocal ? ' (local stack)' : ` (project ${target.ref || 'unresolvable'})`}`,
  );
  if (!DRY) {
    assertWriteTargetAllowed({
      url,
      destructiveWarning: DESTRUCTIVE_WARNING,
      scriptPath: 'scripts/seed-baseball-demo.ts',
    });
  }

  // `global.fetch` carries the transient-retry wrapper, so EVERY request this
  // client makes — auth admin, PostgREST, storage — survives a Supabase blip
  // instead of red-lining a required CI check. See retryingFetch above.
  supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: retryingFetch },
  });

  if (DRY) {
    console.log('[DRY RUN] No flag passed — printing the seed plan, writing NOTHING.');
    console.log('[DRY RUN] Re-run with --confirm to actually seed.\n');
  }
  console.log(`${DRY ? '[DRY RUN] ' : ''}Seeding BaseballHelm Phase-1 demo (team ${TEAM_ID.slice(0, 8)})`);

  // --- -1. Lift any account lockout carried over from earlier failed CI runs,
  // BEFORE anything else. login_attempts is per-email and persists across
  // runs (cap 10 -> 30min lock), so one misconfigured-secret or password-
  // drift run can brick every later E2E run even after the root cause is
  // fixed (2026-07-02 forensics: both demo accounts at 10/10). Cleared at
  // seed start, ahead of the auth calls below, so this run's own login
  // attempts (in the Playwright smoke that follows) never inherit a stale
  // lock. Rows repopulate benignly on real failures.
  if (!DRY) {
    const { error: lockErr } = await supabase
      .from('login_attempts')
      .delete()
      .in('email', [DEMO_COACH_EMAIL, DEMO_PLAYER_EMAIL]);
    if (lockErr) console.warn(`login_attempts clear skipped: ${lockErr.message}`);
  }

  // --- 0. Auth logins (coach + demo player) -------------------------------
  const coachUser = await ensureAuthUser(DEMO_COACH_EMAIL);
  const playerUser = await ensureAuthUser(DEMO_PLAYER_EMAIL);

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

  /**
   * Resolve a ROSTER key to its seeded player id, or fail loudly.
   *
   * `playerIdByKey[key]` is `string` by the index signature but `undefined` at
   * runtime for a key that is not on the roster — and TypeScript with
   * noUncheckedIndexedAccess says so. Writing that `undefined` into a
   * `player_id` column produces a row that either violates NOT NULL or, worse,
   * silently attaches a box-score line to nobody. A typo in a key is a bug in
   * this file, so it should stop the seed here rather than surface as a demo
   * screen that renders a blank name.
   */
  const playerId = (key: string | undefined): string => {
    const id = key === undefined ? undefined : playerIdByKey[key];
    if (!id) {
      throw new Error(
        `seed-baseball-demo: no seeded player for roster key "${key ?? '(undefined)'}" — check ROSTER.`,
      );
    }
    return id;
  };
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

  // --- 7. Lifting ---------------------------------------------------------
  // baseball_exercises is still LIVE (it survived all three 2026-07-04
  // graveyard phases) and Phase 4 reuses these rows, so it stays. The
  // assignment/result/readiness writes that used to follow it did not survive:
  // see the GRAVEYARDED TABLES note in the file header. The live progression
  // layer is seeded further down (helm_lifting_maxes / bodyweight).
  const exercises: (BaseballExerciseInsert & { id: string })[] = [
    { id: detId('ex:squat'), team_id: TEAM_ID, name: 'Back Squat', category: 'lower', description: 'Barbell back squat', created_by_coach_id: COACH_ID, is_global: false },
    { id: detId('ex:bench'), team_id: TEAM_ID, name: 'Bench Press', category: 'upper', description: 'Flat barbell bench', created_by_coach_id: COACH_ID, is_global: false },
    { id: detId('ex:dl'), team_id: TEAM_ID, name: 'Trap Bar Deadlift', category: 'lower', description: 'Hex-bar deadlift', created_by_coach_id: COACH_ID, is_global: false },
    { id: detId('ex:med'), name: 'Med Ball Rotational Throw', category: 'power', description: 'Rotational power', is_global: true },
  ];
  await upsert('baseball_exercises', exercises);

  // --- 7b. Lift Lab progression: maxes + bodyweight ------------------------
  //
  // Phase 2 (scripts/seed-baseball-lifting-demo.ts) seeds the PROGRAMMING half
  // of Helm Lift Lab (programs -> weeks -> days -> prescriptions -> sessions ->
  // set results -> readiness). It never seeds the PROGRESSION half, so
  // helm_lifting_maxes and helm_lifting_bodyweight_entries were empty in every
  // demo: a strength coach opening Lift Lab saw prescriptions computed off
  // percentages with no 1RM behind them, and a bodyweight chart with no points.
  // This section closes that, and it lives here (Phase 1) rather than Phase 2
  // because Phase 1 is the layer that owns "the roster exists".
  //
  // CROSS-PHASE ID CONVERGENCE (load-bearing): helm_lifting_athletes is UNIQUE
  // on (organization_id, sport, sport_player_id) and helm_lifting_exercises on
  // (organization_id, sport, lower(name)). If this script minted its OWN ids
  // for those rows, Phase 2's upsert-by-id would hit those unique indexes with
  // a different primary key and abort the whole Phase-2 run with a 23505 that
  // its schema-skip filter does not catch. So both scripts derive the SAME ids
  // from the SAME namespace + keys, and upserting in either order converges on
  // one row. `liftDetId` MUST stay byte-identical to Phase 2's `detId`.
  const liftDetId = (key: string) => detIdIn('baseballhelm-demo-lifting-v1', key);
  const athleteIdFor = (rosterKey: string) => liftDetId(`athlete:${rosterKey}`);
  const HELM_EX_SQUAT = liftDetId('ex:back_squat');
  const HELM_EX_BENCH = liftDetId('ex:bench_press');

  // Column sets are deliberately NARROWER than Phase 2's. PostgREST's upsert
  // only writes the keys present in the payload, so omitting user_id /
  // created_by_coach_id / instructions / coaching_cues means a Phase-1 re-run
  // after Phase 2 can never blank the richer values Phase 2 wrote.
  await upsert(
    'helm_lifting_athletes',
    ROSTER.map((p) => ({
      id: athleteIdFor(p.key),
      organization_id: ORG_ID,
      sport: 'baseball',
      sport_player_id: playerIdByKey[p.key],
      team_id: TEAM_ID,
      first_name: p.first,
      last_name: p.last,
      position: p.pos,
      is_active: true,
    })),
  );

  await upsert('helm_lifting_exercises', [
    {
      id: HELM_EX_SQUAT,
      organization_id: ORG_ID,
      sport: 'baseball',
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
      is_global: false,
      is_active: true,
    },
    {
      id: HELM_EX_BENCH,
      organization_id: ORG_ID,
      sport: 'baseball',
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
      is_global: false,
      is_active: true,
    },
  ]);

  // Two TESTED maxes per lift (a winter test day and a spring re-test) plus the
  // TRAINING max the program actually prescribes off (90% of the latest test,
  // rounded to the nearest 5 lb — the plate maths a coach would recognise).
  // Squat moves +15 lb for everyone; bench moves for odd-indexed players and is
  // deliberately FLAT for the even ones, so the demo contains a real, visible
  // stall for the coach to find (and for the insight in section 8 to cite).
  const TEST_DAYS_AGO_EARLY = 56;
  const TEST_DAYS_AGO_LATEST = 21;
  const roundTo5 = (n: number) => Math.round(n / 5) * 5;

  const maxRows: Record<string, unknown>[] = [];
  const bodyweightRows: Record<string, unknown>[] = [];

  for (const [i, p] of ROSTER.entries()) {
    const athleteId = athleteIdFor(p.key);
    const squatEarly = 300 + i * 10;
    const squatLatest = squatEarly + 15;
    const benchEarly = 205 + i * 5;
    const benchLatest = benchEarly + (i % 2 === 0 ? 0 : 10);

    for (const m of [
      { key: 'squat:early', exId: HELM_EX_SQUAT, value: squatEarly, days: TEST_DAYS_AGO_EARLY, type: 'tested_1rm' },
      { key: 'squat:latest', exId: HELM_EX_SQUAT, value: squatLatest, days: TEST_DAYS_AGO_LATEST, type: 'tested_1rm' },
      { key: 'bench:early', exId: HELM_EX_BENCH, value: benchEarly, days: TEST_DAYS_AGO_EARLY, type: 'tested_1rm' },
      { key: 'bench:latest', exId: HELM_EX_BENCH, value: benchLatest, days: TEST_DAYS_AGO_LATEST, type: 'tested_1rm' },
      { key: 'squat:training', exId: HELM_EX_SQUAT, value: roundTo5(squatLatest * 0.9), days: TEST_DAYS_AGO_LATEST, type: 'training_max' },
      { key: 'bench:training', exId: HELM_EX_BENCH, value: roundTo5(benchLatest * 0.9), days: TEST_DAYS_AGO_LATEST, type: 'training_max' },
    ]) {
      maxRows.push({
        id: liftDetId(`max:${m.key}:${p.key}`),
        organization_id: ORG_ID,
        sport: 'baseball',
        athlete_id: athleteId,
        exercise_id: m.exId,
        max_type: m.type,
        value: m.value,
        unit: 'lb',
        test_date: dateDaysAgo(m.days),
        // A tested max was watched by a coach; a training max is arithmetic off
        // it. Neither is a guess, so both carry a high but not perfect
        // confidence, and the source says which is which.
        source: m.type === 'tested_1rm' ? 'coach_test' : 'calculated',
        confidence: m.type === 'tested_1rm' ? 0.95 : 0.9,
      });
    }

    // Five weekly weigh-ins ending TODAY at the player's roster weight, so the
    // chart and the roster card can never disagree. Even-indexed players are
    // gaining, odd-indexed are cutting — a squad is never all one direction.
    const currentWeight = 185 + (p.jersey % 25);
    const weeklyDelta = i % 2 === 0 ? 1 : -0.5;
    for (let w = 0; w < 5; w++) {
      bodyweightRows.push({
        id: liftDetId(`bw:${p.key}:${w}`),
        organization_id: ORG_ID,
        sport: 'baseball',
        athlete_id: athleteId,
        entry_date: dateDaysAgo((4 - w) * 7),
        weight_lbs: currentWeight - (4 - w) * weeklyDelta,
        source: 'player',
      });
    }
  }
  await upsert('helm_lifting_maxes', maxRows);
  await upsert('helm_lifting_bodyweight_entries', bodyweightRows);

  // --- 8. Announcements: board + targeting + read receipts ----------------
  // Three announcements, because one is not a board. The urgent one is
  // RECIPIENT-SCOPED to the two pitchers: baseball_announcement_recipients
  // narrows RLS visibility (baseball_announcement_has_recipients /
  // _is_recipient), so seeding one targeted post is the only way the demo can
  // show that targeting exists at all — and it correctly does NOT appear for
  // the demo player login (a shortstop), which is the feature working.
  const announcementTeamTravelId = detId('announcement:travel');
  const announcementStudyHallId = detId('announcement:study-hall');
  const announcementArmCareId = detId('announcement:arm-care');

  await upsert('baseball_announcements', [
    {
      id: announcementTeamTravelId,
      team_id: TEAM_ID,
      created_by_id: COACH_ID,
      title: 'Conference series: bus now leaves 1:30pm Friday',
      content:
        'Departure moved up an hour — the athletic department needs the bus back ' +
        'Sunday night. Be dressed and loaded by 1:15pm. Travel roster is posted in ' +
        'Documents; if you are not on it, report to normal lift at 2:00pm.',
      urgency: 'high',
      is_pinned: true,
      published_at: isoDaysAgo(2),
    },
    {
      id: announcementStudyHallId,
      team_id: TEAM_ID,
      created_by_id: COACH_ID,
      title: 'Study hall hours extended through finals',
      content:
        'Academic center is open until 10pm every night for the next two weeks. ' +
        'Anyone under a 2.7 is required for six hours a week; everyone else is ' +
        'welcome. Bring your own laptop — the lab machines are booked for exams.',
      urgency: 'normal',
      is_pinned: false,
      published_at: isoDaysAgo(6),
    },
    {
      id: announcementArmCareId,
      team_id: TEAM_ID,
      created_by_id: COACH_ID,
      title: 'Arm care is mandatory before Friday bullpens',
      content:
        'Full band series and sleeper stretch before you touch a ball. Trainer signs ' +
        'off. No sign-off, no bullpen — this is not negotiable after last week.',
      urgency: 'urgent',
      is_pinned: false,
      published_at: isoDaysAgo(1),
    },
  ]);

  const pitcherKeys = ROSTER.filter((p) => p.pos === 'P').map((p) => p.key);
  await upsert(
    'baseball_announcement_recipients',
    pitcherKeys.map((k) => ({
      id: detId(`announcement-recipient:arm-care:${k}`),
      announcement_id: announcementArmCareId,
      player_id: playerIdByKey[k],
    })),
  );

  // Read receipts: 6 of 8 on the travel post (a partially-filled meter is the
  // honest state of any real team) and 1 of the 2 pitchers on the arm-care one.
  const ackRowsAnnouncements = [
    ...ROSTER.slice(0, 6).map((p, i) => ({
      id: detId(`announcement-ack:travel:${p.key}`),
      announcement_id: announcementTeamTravelId,
      player_id: playerIdByKey[p.key],
      // Staggered so the "who has seen this" list reads like people, not a
      // batch job: hours after publication, not all on the same second.
      acknowledged_at: isoHoursAgo(46 - i * 3),
    })),
    {
      id: detId('announcement-ack:arm-care:p4'),
      announcement_id: announcementArmCareId,
      player_id: playerId(pitcherKeys[0]),
      acknowledged_at: isoHoursAgo(20),
    },
  ];
  await upsert('baseball_announcement_acknowledgements', ackRowsAnnouncements);

  // --- 9. Travel: one completed trip with a settled budget, one upcoming ---
  const itineraryPastId = detId('itinerary:past-series');
  const itineraryUpcomingId = detId('itinerary:upcoming-series');

  await upsert('baseball_travel_itineraries', [
    {
      id: itineraryPastId,
      team_id: TEAM_ID,
      created_by: COACH_ID,
      event_name: 'Conference series at Ridgeline State',
      departure_date: dateDaysAgo(12),
      return_date: dateDaysAgo(10),
      location: 'Ridgeline, NC',
      accommodation: 'Ridgeline Inn & Suites — 12 doubles, breakfast included',
      transportation: 'Charter coach (52 seat), departs Demo Field lot',
      notes: 'Three-game series. Weight room access arranged at the host facility Saturday AM.',
    },
    {
      id: itineraryUpcomingId,
      team_id: TEAM_ID,
      created_by: COACH_ID,
      event_name: 'Conference series at Northgate',
      departure_date: dateDaysAgo(-5),
      return_date: dateDaysAgo(-7),
      location: 'Northgate, SC',
      accommodation: 'Northgate Garden Hotel — rooming list due Wednesday',
      transportation: 'Charter coach (52 seat), 1:30pm departure',
      notes: 'Travel roster of 27. Academic center will proctor two exams on the road.',
    },
  ]);

  // Expenses hang off the COMPLETED trip only — an upcoming trip with actuals
  // already logged would be a lie the demo tells about its own timeline.
  await upsert('baseball_travel_expenses', [
    {
      id: detId('expense:past:coach'),
      itinerary_id: itineraryPastId,
      team_id: TEAM_ID,
      category: 'transport',
      amount: 2850.0,
      description: 'Charter coach, round trip, 2 nights driver lodging',
      vendor_name: 'Piedmont Coach Lines',
      paid_by: 'team',
      expense_date: dateDaysAgo(12),
      created_by: coachUser.userId,
    },
    {
      id: detId('expense:past:hotel'),
      itinerary_id: itineraryPastId,
      team_id: TEAM_ID,
      category: 'lodging',
      amount: 4120.0,
      description: '12 doubles x 2 nights, tax included',
      vendor_name: 'Ridgeline Inn & Suites',
      paid_by: 'team',
      expense_date: dateDaysAgo(11),
      created_by: coachUser.userId,
    },
    {
      id: detId('expense:past:meals'),
      itinerary_id: itineraryPastId,
      team_id: TEAM_ID,
      category: 'meals',
      amount: 1340.5,
      description: 'Per diem, 27 travelers x 2 days',
      vendor_name: 'Team per diem',
      paid_by: 'team',
      expense_date: dateDaysAgo(10),
      created_by: coachUser.userId,
    },
    {
      id: detId('expense:past:equipment'),
      itinerary_id: itineraryPastId,
      team_id: TEAM_ID,
      category: 'equipment',
      amount: 210.75,
      description: 'Replacement game balls + rosin after rain delay',
      vendor_name: 'Ridgeline Athletics',
      paid_by: 'pending_reimbursement',
      expense_date: dateDaysAgo(11),
      created_by: coachUser.userId,
    },
  ]);

  // --- 10. Documents: real files in storage, not dangling rows ------------
  // A baseball_documents row whose object does not exist in the `documents`
  // bucket renders in the list and 404s on click. So the bytes go up FIRST and
  // the rows are only written if the upload succeeded — an empty Documents tab
  // is a smaller lie than a shelf of files that cannot be opened, and the
  // verifier will name the gap either way.
  const DOCUMENT_BUCKET = 'documents';
  const documentSeeds = [
    {
      key: 'handbook',
      title: '2026 Team Handbook',
      description: 'Program standards, travel conduct, academic requirements, and the discipline ladder.',
      category: 'general',
      playerVisible: true,
      folder: 'Program',
      body: [
        '# Demo University Baseball — 2026 Team Handbook',
        '',
        '## 1. Standards',
        'On time is five minutes early. Uniform is uniform. You represent the program',
        'in the classroom, in the weight room, and on the road.',
        '',
        '## 2. Academics',
        'Six hours of study hall per week under a 2.7 GPA. Missed class is a missed',
        'lift, and a missed lift is a missed start.',
        '',
        '## 3. Travel conduct',
        'Travel roster is posted 48 hours before departure. Bus times are hard times.',
        '',
        '## 4. Discipline ladder',
        'Conversation, then conditioning, then playing time, then the head coach.',
      ].join('\n'),
    },
    {
      key: 'lift-safety',
      title: 'Weight Room Safety & Spotting Policy',
      description: 'Required reading before any barbell work. Covers spotting, bar path, and the injury-report chain.',
      category: 'conditioning',
      playerVisible: true,
      folder: 'Performance',
      body: [
        '# Weight Room Safety & Spotting Policy',
        '',
        '## Spotting',
        'Every bench and back squat set above 70% gets a spotter. No exceptions, no',
        'headphones, no phones on the platform.',
        '',
        '## Testing days',
        'Tested 1RMs are recorded by a coach, not self-reported. Your training max is',
        '90% of your most recent tested max and is what every percentage on your',
        'program is calculated from.',
        '',
        '## Injury reporting',
        'Anything you would describe as sharp goes to the trainer the same day.',
      ].join('\n'),
    },
    {
      key: 'per-diem',
      title: 'Travel Per Diem & Reimbursement Policy',
      description: 'Staff-only: per diem rates, receipt requirements, and the reimbursement window.',
      category: 'administrative',
      playerVisible: false,
      folder: 'Operations',
      body: [
        '# Travel Per Diem & Reimbursement Policy (Staff)',
        '',
        '## Rates',
        'Breakfast $12, lunch $16, dinner $24. Rates are set by the athletic',
        'department and are renegotiated each fiscal year.',
        '',
        '## Receipts',
        'Itemized receipts within 10 business days of return. Card statements are not',
        'receipts. Anything logged as pending_reimbursement in Travel stays open on',
        'the trip budget until the receipt lands.',
      ].join('\n'),
    },
  ] as const;

  const documentRows: Record<string, unknown>[] = [];
  const documentVersionRows: Record<string, unknown>[] = [];
  for (const doc of documentSeeds) {
    const documentId = detId(`document:${doc.key}`);
    // Path convention is set by the app's own upload path
    // (src/app/baseball/actions/documents.ts): baseball-documents/{team}/{uuid}.{ext}
    const storagePath = `baseball-documents/${TEAM_ID}/${documentId}.md`;
    const bytes = Buffer.from(`${doc.body}\n`, 'utf8');

    if (!DRY) {
      const { error: uploadErr } = await supabase.storage
        .from(DOCUMENT_BUCKET)
        .upload(storagePath, bytes, { contentType: 'text/markdown', upsert: true });
      if (uploadErr) {
        skipped.push(`baseball_documents/${doc.key} — storage upload failed: ${uploadErr.message}`);
        console.warn(
          `  ⚠ skipped document "${doc.title}" — could not upload to bucket "${DOCUMENT_BUCKET}": ${uploadErr.message}`,
        );
        continue;
      }
    }

    documentRows.push({
      id: documentId,
      team_id: TEAM_ID,
      title: doc.title,
      description: doc.description,
      // The read path re-signs from the latest version's storage_path and
      // overwrites file_url, so the stored value is the path itself rather than
      // a signed URL that would be expired before anyone ever loaded the page.
      file_url: storagePath,
      file_type: 'text/markdown',
      file_size: bytes.byteLength,
      category: doc.category,
      is_player_visible: doc.playerVisible,
      uploaded_by: coachUser.userId,
      version_count: 1,
      folder: doc.folder,
    });
    documentVersionRows.push({
      id: detId(`document-version:${doc.key}:1`),
      document_id: documentId,
      version_number: 1,
      file_name: `${doc.title}.md`,
      file_size: bytes.byteLength,
      mime_type: 'text/markdown',
      storage_path: storagePath,
      file_url: storagePath,
      change_notes: 'Initial upload',
      uploaded_by: coachUser.userId,
    });
  }
  if (documentRows.length) {
    await upsert('baseball_documents', documentRows);
    await upsert('baseball_document_versions', documentVersionRows);
  }

  // --- 11. One completed game -> box score -> postgame action review -------
  //
  // Postgame is the only surface that CANNOT be seeded standalone: a review is
  // FK-bound to a game and is worthless without the box-score lines it cites.
  // Phase 4 (seed-baseball-demo-program.ts) seeds a whole season, but Phase 1
  // must not depend on Phase 4 — the documented run order puts Phase 1 first —
  // so Phase 1 owns exactly ONE recent game, dated after Phase 4's Feb–May
  // schedule so it sorts to the top of the postgame game picker either way.
  //
  // The lines below are hand-authored and internally consistent: batting runs
  // sum to our_score (6), pitching runs allowed sum to opponent_score (4), and
  // innings sum to 9. Nothing here is random, so the same demo tells the same
  // story every time it is rebuilt.
  const gameEventId = detId('event:game-1');
  const gameId = detId('game:1');
  const gameDate = dateDaysAgo(3);

  await upsert('baseball_events', [
    {
      id: gameEventId,
      team_id: TEAM_ID,
      created_by: COACH_ID,
      title: 'vs Ridgeline State',
      description: 'Conference game. Final: 6-4.',
      event_type: 'game',
      location: 'Demo Field',
      start_time: isoDaysAgo(3),
      end_time: isoDaysAgo(3),
      is_mandatory: true,
    },
  ]);

  await upsert('baseball_games', [
    {
      id: gameId,
      team_id: TEAM_ID,
      event_id: gameEventId,
      game_date: gameDate,
      game_type: 'game',
      opponent_name: 'Ridgeline State',
      location: 'Demo Field',
      home_away: 'home',
      our_score: 6,
      opponent_score: 4,
      innings_played: 9,
      status: 'completed',
      created_by: COACH_ID,
    },
  ]);

  // key, order, ab, r, h, 2b, 3b, hr, rbi, bb, k
  const battingLines = [
    { key: 'p1', order: 1, ab: 4, r: 1, h: 2, doubles: 1, triples: 0, hr: 0, rbi: 1, bb: 1, k: 1 },
    { key: 'p6', order: 2, ab: 3, r: 1, h: 1, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 1, k: 1 },
    { key: 'p3', order: 3, ab: 4, r: 2, h: 3, doubles: 1, triples: 0, hr: 1, rbi: 3, bb: 0, k: 0 },
    { key: 'p2', order: 4, ab: 4, r: 1, h: 1, doubles: 0, triples: 0, hr: 0, rbi: 1, bb: 0, k: 2 },
    { key: 'p5', order: 5, ab: 4, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, k: 3 },
    { key: 'p8', order: 6, ab: 4, r: 1, h: 1, doubles: 1, triples: 0, hr: 0, rbi: 1, bb: 0, k: 1 },
  ] as const;

  // key, ip, h, r, er, bb, k, hr, pitches, result
  const pitchingLines = [
    { key: 'p4', ip: 6, h: 5, r: 3, er: 3, bb: 2, k: 7, hr: 0, pitches: 98, result: 'W', gs: 1 },
    // 'S', not 'SV'. baseball_box_score_pitching.result has a CHECK allowing
    // only W|L|S|H|BS|ND (20260527000000_prod_public_baseline.sql:7443), which
    // both app validators agree with (imports.ts:1625, games.ts:1246). 'SV'
    // exists in src/ only as a DISPLAY label for the aggregate save count.
    // Writing it violated the constraint, and the seed's own skip filter
    // swallowed the violation — so BOTH pitching lines vanished from a batch
    // upsert that reported success, and the postgame review's workload and
    // practice-focus items cited rows that did not exist.
    { key: 'p7', ip: 3, h: 2, r: 1, er: 1, bb: 3, k: 4, hr: 0, pitches: 52, result: 'S', gs: 0 },
  ] as const;

  await upsert(
    'baseball_box_score_batting',
    battingLines.map((l) => ({
      id: detId(`bat:${gameId}:${l.key}`),
      game_id: gameId,
      team_id: TEAM_ID,
      player_id: playerIdByKey[l.key],
      batting_order: l.order,
      ab: l.ab,
      r: l.r,
      h: l.h,
      doubles: l.doubles,
      triples: l.triples,
      hr: l.hr,
      rbi: l.rbi,
      bb: l.bb,
      k: l.k,
      sb: 0,
      cs: 0,
      hbp: 0,
      sac: 0,
      sf: 0,
      def_position: ROSTER.find((p) => p.key === l.key)?.pos ?? null,
    })),
    'game_id,player_id',
  );

  await upsert(
    'baseball_box_score_pitching',
    pitchingLines.map((l) => ({
      id: detId(`pit:${gameId}:${l.key}`),
      game_id: gameId,
      team_id: TEAM_ID,
      player_id: playerIdByKey[l.key],
      ip: l.ip,
      h: l.h,
      r: l.r,
      er: l.er,
      bb: l.bb,
      k: l.k,
      hr: l.hr,
      pitch_count: l.pitches,
      result: l.result,
      gs: l.gs,
      gf: l.gs === 1 ? 0 : 1,
    })),
    'game_id,player_id',
  );

  const nameFor = (key: string) => {
    const p = ROSTER.find((r) => r.key === key);
    return p ? `${p.first} ${p.last}` : null;
  };

  const postgameGame: PostgameGameInput = {
    id: gameId,
    game_date: gameDate,
    opponent_name: 'Ridgeline State',
    game_type: 'game',
    our_score: 6,
    opponent_score: 4,
    batting_lines_n: battingLines.length,
    pitching_lines_n: pitchingLines.length,
    source_status: 'official',
    import_warnings: [],
  };
  const postgameBatting: PostgameBattingLine[] = battingLines.map((l) => ({
    player_id: playerId(l.key),
    player_name: nameFor(l.key),
    at_bats: l.ab,
    hits: l.h,
    doubles: l.doubles,
    triples: l.triples,
    home_runs: l.hr,
    walks: l.bb,
    strikeouts: l.k,
    rbis: l.rbi,
  }));
  const postgamePitching: PostgamePitchingLine[] = pitchingLines.map((l) => ({
    player_id: playerId(l.key),
    player_name: nameFor(l.key),
    innings_pitched: l.ip,
    earned_runs: l.er,
    walks_allowed: l.bb,
    strikeouts_thrown: l.k,
    pitches_thrown: l.pitches,
    hits_allowed: l.h,
  }));

  // Baselines are deliberately EMPTY. Phase 1 seeds exactly one game, so there
  // is no season norm to compare against — and the builder is honest about that
  // ("No season baseline yet — a single line, not a trend") rather than
  // inventing a delta. Once Phase 4's season exists, hitting Regenerate on the
  // page re-runs this same builder WITH baselines and the copy sharpens; that
  // difference is a demo beat, not a defect.
  const built = buildPostgameReview({
    game: postgameGame,
    batting: postgameBatting,
    pitching: postgamePitching,
    baselines: {},
  });

  const postgameReviewId = detId('postgame:review:1');
  const postgameReview: BaseballPostgameReviewInsert & { id: string } = {
    id: postgameReviewId,
    team_id: TEAM_ID,
    game_id: gameId,
    coach_id: COACH_ID,
    source_status: 'official',
    batting_lines_n: battingLines.length,
    pitching_lines_n: pitchingLines.length,
    import_warnings: [],
    title: built.title,
    summary: built.summary,
    confidence: built.confidence,
    visibility: built.visibility,
    disposition: 'new',
    // Stamped with the builder that actually produced it, so the provenance
    // drawer does not claim a model was involved when none was.
    generated_by_model: 'baseball-postgame-builder@1',
    generated_at: isoDaysAgo(3),
  };
  await upsert('baseball_postgame_reviews', [postgameReview]);

  const postgameItems: (BaseballPostgameReviewItemInsert & { id: string })[] = built.items.map(
    (c) => ({
      id: detId(`postgame:item:${c.dedupeKey}`),
      team_id: TEAM_ID,
      review_id: postgameReviewId,
      player_id: c.playerId,
      item_kind: c.itemKind,
      signal_source: c.signalSource,
      title: c.title,
      detail: c.detail,
      action_label: c.actionLabel,
      action_type: c.actionType,
      owner_role: c.ownerRole,
      priority: c.priority,
      confidence: c.confidence,
      visibility: c.visibility,
      player_visible: c.playerVisible,
      source_refs: c.sourceRefs,
      disposition: 'new',
      dedupe_key: c.dedupeKey,
    }),
  );
  await upsert('baseball_postgame_review_items', postgameItems);

  // --- 12. Coach insights WITH source attribution --------------------------
  // Demonstrates the Phase-1 attribution columns (source_refs / confidence /
  // lifecycle_state / player_visible / generated_by / dedupe_key) pointing at
  // the lineage + progression rows seeded above.
  //
  // Every cited table is one THIS script writes. The previous version of this
  // insight cited baseball_readiness_checkins and baseball_lift_results, both
  // graveyarded 2026-07-04 — a demo insight whose "evidence" drawer resolved to
  // nothing. The claim below is arithmetic over the rows in section 7b: for the
  // demo player (roster index 0) bench tested 1RM is identical at both test
  // dates while bodyweight climbed 4 lb.
  const demoPid = playerIdByKey[DEMO_PLAYER_KEY];
  const srcRefsProgression: BaseballInsightSourceRef[] = [
    { table: 'helm_lifting_maxes', column: 'value', sample_n: 4, confidence: 0.95, label: 'Bench + squat tested 1RM, two test days', visibility: 'staff_only' },
    { table: 'helm_lifting_bodyweight_entries', column: 'weight_lbs', sample_n: 5, confidence: 0.9, label: 'Five weekly weigh-ins', visibility: 'team' },
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
      insight_type: 'strength',
      title: 'Bench flat across two test days while bodyweight climbed',
      body:
        'Tested bench 1RM is unchanged between the two most recent test days, ' +
        'while bodyweight is up 4 lb over the last five weigh-ins. Squat moved ' +
        '+15 lb over the same window, so this is upper-body specific, not a ' +
        'general recovery problem. Worth a pressing-volume review before the ' +
        'next test day.',
      priority: 'medium',
      // Command Center's risk feed filters status IN ('active','acknowledged')
      // (src/lib/baseball/read-models/command-center.ts). The seed used to write
      // 'open', which is not in that set, so both demo insights existed in the
      // table and were invisible on the only surface that shows them.
      status: 'active',
      // Phase-1 attribution columns:
      source_refs: srcRefsProgression,
      confidence: 0.74,
      lifecycle_state: 'detected',
      player_visible: true,
      generated_by: 'demo_seed.strength_progression',
      dedupe_key: `${TEAM_ID}:strength_progression:${demoPid}`,
      last_generated_at: isoDaysAgo(0),
      metadata: { evidence: { source_refs: srcRefsProgression } },
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
      status: 'active',
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

  // --- 13. Player timeline events (with source refs back to the data) ------
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
      // Was source_type 'baseball_lift_results' pointing at a row this script
      // no longer writes (graveyarded 2026-07-04) — a timeline entry whose
      // "view source" led nowhere. It now cites the Lift Lab max this script
      // does seed, which is also the more interesting event for a player.
      id: detId('timeline:lift'),
      player_id: demoPid,
      team_id: TEAM_ID,
      event_type: 'lift_logged',
      title: 'Bench 1RM re-tested',
      body: 'Tested bench max recorded on the spring test day; training max updated to 90% of it.',
      source_type: 'helm_lifting_maxes',
      source_id: liftDetId(`max:bench:latest:${DEMO_PLAYER_KEY}`),
      occurred_at: isoDaysAgo(TEST_DAYS_AGO_LATEST),
      created_by: coachUser.userId,
      visibility: 'player_only',
    },
    {
      id: detId('timeline:insight'),
      player_id: demoPid,
      team_id: TEAM_ID,
      event_type: 'coach_insight',
      title: 'Coach flagged a stalled bench',
      body: 'Staff-only note from the strength-progression insight.',
      source_type: 'baseball_coach_insights',
      source_id: detId('insight:readiness'),
      confidence: 0.74,
      occurred_at: isoDaysAgo(0),
      created_by: coachUser.userId,
      visibility: 'staff_only',
    },
    {
      // The postgame review is the demo's strongest "source -> signal ->
      // action" beat, so the player timeline links straight into it.
      id: detId('timeline:postgame'),
      player_id: demoPid,
      team_id: TEAM_ID,
      event_type: 'coach_insight',
      title: 'Postgame review published',
      body: 'Action review generated from the Ridgeline State box score.',
      source_type: 'baseball_postgame_reviews',
      source_id: postgameReviewId,
      occurred_at: isoDaysAgo(3),
      created_by: coachUser.userId,
      visibility: 'staff_only',
    },
  ];
  await upsert('baseball_player_timeline_events', timelineRows);

  // --- Report -------------------------------------------------------------
  console.log(`\n${DRY ? '[DRY RUN] would seed' : 'Seeded'} rows:`);
  for (const [t, n] of Object.entries(counts)) console.log(`  ${t.padEnd(34)} ${n}`);
  // `skipped` was collected but never printed, which is half of why three
  // writes to graveyarded tables went unnoticed for weeks: the rows vanished
  // from `counts`, nothing replaced them in the output, and the run still ended
  // with a success banner. A skip is now a first-class part of the report.
  if (skipped.length) {
    console.log(`\nSKIPPED — these tables/columns were NOT seeded:`);
    for (const s of skipped) console.log(`  ⚠ ${s}`);
    console.log(
      '  A skip means the surface backed by that table will be EMPTY in the demo.\n' +
      '  Run scripts/verify-baseball-demo-coverage.ts to see which routes that affects.',
    );
  }
  console.log(`\nDemo logins (password: ${DEMO_PASSWORD}):`);
  console.log(`  COACH : ${DEMO_COACH_EMAIL}${coachUser.created ? ' (created)' : ' (existing)'}`);
  console.log(`  PLAYER: ${DEMO_PLAYER_EMAIL}${playerUser.created ? ' (created)' : ' (existing)'}`);
  console.log(`  Team  : Demo University Baseball (${TEAM_ID})`);

  // A skip is a FAILURE, not a footnote. Printing it while still exiting 0
  // left `npm run seed:baseball:ci` green with tables missing — the same
  // silence, one layer up: the operator now had the information and the
  // machine still said everything was fine. A demo surface that will render
  // empty is not a successful seed.
  //
  // Document-upload skips are exempt: they depend on a storage bucket that is
  // legitimately absent on a fresh local stack, and failing the whole seed for
  // it would make the local path unusable for the thing it is for.
  const fatalSkips = skipped.filter((s) => !s.startsWith('baseball_documents/'));
  if (fatalSkips.length) {
    console.error(
      `\n${fatalSkips.length} table(s) could not be seeded. Exiting non-zero — the demo is incomplete.`,
    );
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
