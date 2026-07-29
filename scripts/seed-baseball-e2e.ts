/**
 * seed-baseball-e2e.ts — Deterministic E2E seed for BaseballHelm Camps /
 * Pipeline / Box Score Playwright specs (issue #375).
 *
 * Provisions exactly the fixture graph the three rewritten specs need,
 * keyed to the SHARED `e2e/helpers/auth.ts` `TEST_USERS` accounts
 * (`testcoach@helm.test` / `testplayer@helm.test`) so `loginAsCoach` /
 * `loginAsPlayer` work against a real, seeded environment:
 *
 *   - one `organizations` row + one college `baseball_teams` row
 *   - the coach (college type) + a `baseball_team_coach_staff` row with full
 *     capabilities, so box-score / camp / pipeline writes are authorized
 *   - a 4-player roster (`baseball_players` + `baseball_team_members`),
 *     including the shared test-player login
 *   - one scheduled `baseball_games` row and one completed one, the
 *     completed game backed by `baseball_box_score_batting` /
 *     `baseball_box_score_pitching` rows + a `recalculate_baseball_season_stats`
 *     call so season rollups (team stats, player "My Stats") are non-empty
 *   - one recruiting pipeline candidate (`baseball_watchlists`, stage
 *     `watchlist`) plus the target `baseball_players` row the pipeline board
 *     renders
 *   - one open `baseball_camps` row + one `baseball_camp_registrations` row
 *     (a bench player), with the shared test-player intentionally left
 *     unregistered so register/unregister flows have a clean starting state
 *
 * SAFETY / IDEMPOTENCY
 *   - Every seeded row uses a DETERMINISTIC id (sha1-derived v5-style uuid
 *     under the fixed `baseballhelm-e2e` namespace below), so re-running
 *     UPSERTs in place rather than duplicating.
 *   - Mutable rows that the specs intentionally change at runtime (pipeline
 *     stage, watchlist notes, camp registration status) are restored to
 *     their seeded baseline on every run because the upsert always writes
 *     the full row, including those columns.
 *   - The one exception is the test-player's camp registration: the
 *     register/unregister flow inserts a registration with a NEW (random)
 *     id, which a by-id upsert cannot reset. We explicitly delete any
 *     registration for (seeded camp, test player) before reseeding so that
 *     player always starts unregistered — scoped to the deterministic camp
 *     id, never touching unrelated data.
 *   - Auth users are looked up by email first and only created if missing.
 *     The two shared `@helm.test` login accounts have their password
 *     enforced on every run (they exist solely to support automated login,
 *     unlike demo/production users) — bench/candidate accounts are
 *     create-only and never password-reset.
 *   - Scoped strictly to the `baseballhelm-e2e` namespace ids. Touches
 *     nothing else in the target database.
 *
 * DO NOT run automatically against a shared/production database casually.
 * This is intended for a dedicated E2E/test Supabase project, or CI, where
 * `PLAYWRIGHT_BASEBALL_SEEDED=1` gates the specs that depend on it.
 *
 * SAFE BY DEFAULT
 *   - With no flags it does a DRY RUN: it prints exactly what it WOULD seed
 *     (every table + row count) and writes NOTHING to the database or auth.
 *   - It only writes when you pass --confirm explicitly.
 *
 * Run:
 *   # 1. Dry run (default — prints the plan, touches nothing):
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-baseball-e2e.ts
 *   # 2. Actually seed:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-baseball-e2e.ts --confirm
 *   # (or via the npm script):
 *   npm run seed:baseball:e2e -- --confirm
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * See e2e/README.md for the full fixture-refresh / gating documentation.
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { isRecruitingEnabled } from '../src/lib/baseball/product-modules';

// ---------------------------------------------------------------------------
// Stable E2E identity — must match e2e/helpers/auth.ts TEST_USERS exactly.
// ---------------------------------------------------------------------------
const COACH_EMAIL = 'testcoach@helm.test';
const COACH_PASSWORD = 'TestCoach123!';
const PLAYER_EMAIL = 'testplayer@helm.test';
const PLAYER_PASSWORD = 'TestPlayer123!';

// Seed-only accounts (bench roster + pipeline candidate) never log in during
// the E2E suites, so a fixed throwaway password is fine and is never reset.
const SEED_ONLY_PASSWORD = 'BaseballE2eSeed2026!';
const SEED_ONLY_DOMAIN = 'baseballhelm-e2e.test';

// Fixed namespace for all deterministic ids in this seed — isolated from
// scripts/seed-baseball-demo.ts (`baseballhelm-demo-phase1`) and any other
// seed script so E2E fixtures never collide with demo/production rows.
const NS = 'baseballhelm-e2e';

// Deterministic uuid v5-style from a stable key (no external dep).
function detId(key: string): string {
  const h = createHash('sha1').update(`${NS}:${key}`).digest('hex');
  const b = h.slice(0, 32).split('');
  b[12] = '5';
  b[16] = ((parseInt(b[16], 16) & 0x3) | 0x8).toString(16);
  const s = b.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

const ORG_ID = detId('org');
const TEAM_ID = detId('team');
const COACH_ID = detId('coach');
const STAFF_ID = detId('staff:coach');

// Roster: the shared test-player login + three bench players (one of whom
// pitches), enough to exercise box-score entry, totals, and season rollup.
const ROSTER = [
  { key: 'testplayer', email: PLAYER_EMAIL, first: 'Test', last: 'Player', pos: 'SS', sec: '2B', bats: 'R', throws: 'R', jersey: 2 },
  { key: 'bench1', email: `bench1@${SEED_ONLY_DOMAIN}`, first: 'Riley', last: 'Bennett', pos: 'C', sec: '1B', bats: 'R', throws: 'R', jersey: 12 },
  { key: 'bench2', email: `bench2@${SEED_ONLY_DOMAIN}`, first: 'Quinn', last: 'Ortiz', pos: 'OF', sec: 'OF', bats: 'L', throws: 'L', jersey: 24 },
  { key: 'pitcher1', email: `pitcher1@${SEED_ONLY_DOMAIN}`, first: 'Dakota', last: 'Reyes', pos: 'P', sec: 'P', bats: 'R', throws: 'R', jersey: 31 },
] as const;
const TEST_PLAYER_KEY = 'testplayer';

// One recruiting pipeline candidate — not on the roster, just a watchlist
// target the pipeline board renders and moves between stages.
const PIPELINE_CANDIDATE = {
  key: 'candidate1',
  email: `recruit1@${SEED_ONLY_DOMAIN}`,
  first: 'Jordan',
  last: 'Hayes',
  pos: 'OF',
  gradYear: 2027,
} as const;

// ---------------------------------------------------------------------------
// Date helpers — anchor everything to "now" so seeded dates stay relevant
// (the completed game must land in the CURRENT season year for season-stat
// assertions to hold).
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
function dateDaysFromNow(days: number): string {
  return dateDaysAgo(-days);
}
const SEASON_YEAR = NOW.getUTCFullYear();

// ---------------------------------------------------------------------------
// Tiny upsert wrapper — onConflict id by default, never destructive.
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
    if (/could not find the table|schema cache|does not exist|could not find the '.*' column|violates not-null constraint|violates check constraint/i.test(msg)) {
      delete counts[table];
      skipped.push(`${table} — ${msg}`);
      console.warn(`  ⚠ skipped ${table} (schema not present yet): ${msg}`);
      return;
    }
    throw new Error(`upsert ${table} failed: ${msg}`);
  }
}

/**
 * Reset the test-player's camp registration before reseeding. Registering
 * via the UI inserts a row with a NEW (random) id that a by-id upsert can't
 * reset — so we explicitly clear any registration scoped to (seeded camp,
 * test player) every run, guaranteeing register/unregister specs always
 * start from "not registered". Never touches any other player's rows.
 */
async function resetTestPlayerCampRegistration(campId: string, playerId: string) {
  if (DRY) return;
  const { error } = await supabase
    .from('baseball_camp_registrations')
    .delete()
    .eq('camp_id', campId)
    .eq('player_id', playerId);
  if (error && !/could not find the table|schema cache|does not exist/i.test(error.message || '')) {
    throw new Error(`reset camp registration failed: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Auth user: look up by email (public.users), create only if missing.
// `forcePassword` is used only for the two shared @helm.test login accounts —
// these exist solely to support automated login, so we enforce their
// password on every run rather than risk a stale credential blocking the
// whole suite. Seed-only accounts are create-only and never reset.
// ---------------------------------------------------------------------------
async function ensureAuthUser(
  email: string,
  password: string,
  opts: { forcePassword?: boolean } = {}
): Promise<{ userId: string | null; created: boolean }> {
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .ilike('email', email)
    .maybeSingle();

  if (existing) {
    if (opts.forcePassword && !DRY) {
      const { error } = await supabase.auth.admin.updateUserById(existing.id as string, { password });
      if (error) {
        console.warn(`  ⚠ could not enforce password for ${email}: ${error.message}`);
      }
    }
    return { userId: existing.id as string, created: false };
  }

  if (DRY) return { userId: null, created: false };

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data?.user) throw new Error(`createUser failed for ${email}: ${error?.message}`);
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
    console.log('[DRY RUN] No flag passed — printing the seed plan, writing NOTHING.');
    console.log('[DRY RUN] Re-run with --confirm to actually seed.\n');
  }
  console.log(`${DRY ? '[DRY RUN] ' : ''}Seeding BaseballHelm E2E fixtures (team ${TEAM_ID.slice(0, 8)})`);

  // --- 0. Auth logins -------------------------------------------------------
  const coachUser = await ensureAuthUser(COACH_EMAIL, COACH_PASSWORD, { forcePassword: true });
  const playerUsers: Record<string, { userId: string | null; created: boolean }> = {};
  for (const p of ROSTER) {
    const forcePassword = p.key === TEST_PLAYER_KEY;
    playerUsers[p.key] = await ensureAuthUser(
      p.email,
      forcePassword ? PLAYER_PASSWORD : SEED_ONLY_PASSWORD,
      { forcePassword }
    );
  }
  const candidateUser = await ensureAuthUser(PIPELINE_CANDIDATE.email, SEED_ONLY_PASSWORD);

  // --- 1. Organization + college team ---------------------------------------
  await upsert('organizations', [{
    id: ORG_ID,
    name: 'E2E Test University',
    type: 'college',
    division: 'NCAA D1',
    conference: 'E2E Test Conference',
    location_city: 'Testville',
    location_state: 'NC',
    description: 'BaseballHelm E2E seed organization (issue #375) — safe to ignore in production lists.',
  }]);

  await upsert('baseball_coaches', [{
    id: COACH_ID,
    user_id: coachUser.userId,
    organization_id: ORG_ID,
    coach_type: 'college',
    full_name: 'Test Coach',
    email: COACH_EMAIL,
    title: 'Head Coach',
    onboarding_completed: true,
  }]);

  await upsert('baseball_teams', [{
    id: TEAM_ID,
    organization_id: ORG_ID,
    name: 'E2E Test University Baseball',
    team_type: 'college',
    join_code: 'E2EBB01',
    description: 'BaseballHelm E2E seed team (issue #375).',
    created_by: COACH_ID,
  }]);

  // Staff row grants the test coach full capabilities on the team — required
  // for box-score entry, camp management, and team-access checks throughout
  // src/app/baseball/actions/*.
  await upsert('baseball_team_coach_staff', [{
    id: STAFF_ID,
    team_id: TEAM_ID,
    coach_id: COACH_ID,
    role: 'head_coach',
    title: 'Head Coach',
    is_primary: true,
    is_head_coach: true,
    status: 'active',
    can_manage_roster: true,
    can_manage_practice: true,
    can_manage_lifting: true,
    can_view_academics: true,
    can_manage_imports: true,
    can_manage_stats: true,
    can_invite_staff: true,
    can_manage_settings: true,
    can_view_medical: true,
    can_message_team: true,
    can_manage_calendar: true,
    visible_to_players: true,
  }]);

  // --- 2. Roster: players + team memberships --------------------------------
  const playerIdByKey: Record<string, string> = {};
  const playerRows: Record<string, unknown>[] = [];
  const memberRows: Record<string, unknown>[] = [];
  for (const p of ROSTER) {
    const pid = detId(`player:${p.key}`);
    playerIdByKey[p.key] = pid;
    playerRows.push({
      id: pid,
      user_id: playerUsers[p.key]?.userId,
      player_type: 'college',
      recruiting_activated: false,
      first_name: p.first,
      last_name: p.last,
      email: p.email,
      primary_position: p.pos,
      secondary_position: p.sec,
      bats: p.bats,
      throws: p.throws,
      grad_year: SEASON_YEAR + 1,
      height_feet: 6,
      height_inches: (p.jersey % 5),
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
      joined_at: isoDaysAgo(60),
      approved_by: COACH_ID,
      approved_at: isoDaysAgo(60),
    });
  }
  await upsert('baseball_players', playerRows);
  await upsert('baseball_team_members', memberRows);

  // --- 3. Pipeline candidate (off-roster recruiting target) -----------------
  //
  // SUNSET GATE. The only consumer is e2e/baseball-pipeline.spec.ts, which now
  // skips while the recruiting module is off — so without this gate every push
  // to main writes a baseball_players row flagged
  // recruiting_activated = true (the flag that makes a player publicly NAMED
  // rather than masked to initials) plus a watchlist entry, into the same
  // project this workflow's other seed step targets, to satisfy a spec that
  // does not run. Same finding as the demo seed's Section C.
  if (isRecruitingEnabled()) {
  const candidateId = detId(`player:${PIPELINE_CANDIDATE.key}`);
  await upsert('baseball_players', [{
    id: candidateId,
    user_id: candidateUser.userId,
    player_type: 'high_school',
    recruiting_activated: true,
    first_name: PIPELINE_CANDIDATE.first,
    last_name: PIPELINE_CANDIDATE.last,
    email: PIPELINE_CANDIDATE.email,
    primary_position: PIPELINE_CANDIDATE.pos,
    grad_year: PIPELINE_CANDIDATE.gradYear,
    onboarding_completed: true,
    profile_completion_percent: 80,
  }]);

  const watchlistId = detId(`watchlist:${PIPELINE_CANDIDATE.key}`);
  await upsert('baseball_watchlists', [{
    id: watchlistId,
    coach_id: COACH_ID,
    player_id: candidateId,
    pipeline_stage: 'watchlist',
    notes: 'Seeded E2E pipeline candidate — strong bat speed, exit velo trending up.',
    priority: 50,
    source: 'e2e-seed',
    added_at: isoDaysAgo(10),
  }]);
  } else {
    console.log(
      `${DRY ? '[DRY RUN] ' : ''}  · Pipeline candidate skipped — recruiting module is sunset ` +
        '(its only spec, e2e/baseball-pipeline.spec.ts, skips too).',
    );
  }

  // --- 4. Games: one scheduled, one completed with a full box score --------
  const scheduledGameId = detId('game:scheduled');
  const completedGameId = detId('game:completed');

  await upsert('baseball_games', [
    {
      id: scheduledGameId,
      team_id: TEAM_ID,
      created_by: COACH_ID,
      game_date: dateDaysFromNow(14),
      game_type: 'game',
      opponent_name: 'Riverside University',
      home_away: 'home',
      location: 'Test Field',
      status: 'scheduled',
    },
    {
      id: completedGameId,
      team_id: TEAM_ID,
      created_by: COACH_ID,
      game_date: dateDaysAgo(14),
      game_type: 'game',
      opponent_name: 'Eastview College',
      home_away: 'home',
      location: 'Test Field',
      status: 'completed',
      our_score: 5,
      opponent_score: 3,
      innings_played: 9,
    },
  ]);

  // Batting lines — testplayer, bench1, bench2 (pitcher1 doesn't bat).
  const battingByKey: Record<string, Record<string, number>> = {
    testplayer: { ab: 4, r: 2, h: 2, doubles: 1, triples: 0, hr: 0, rbi: 1, bb: 1, k: 1, sb: 1 },
    bench1: { ab: 3, r: 1, h: 1, doubles: 0, triples: 0, hr: 0, rbi: 2, bb: 0, k: 0, sb: 0 },
    bench2: { ab: 4, r: 1, h: 2, doubles: 0, triples: 0, hr: 1, rbi: 2, bb: 0, k: 1, sb: 0 },
  };
  const battingRows = Object.entries(battingByKey).map(([key, stats], i) => ({
    id: detId(`batting:${key}`),
    game_id: completedGameId,
    player_id: playerIdByKey[key],
    team_id: TEAM_ID,
    batting_order: i + 1,
    ab: stats.ab,
    r: stats.r,
    h: stats.h,
    doubles: stats.doubles,
    triples: stats.triples,
    hr: stats.hr,
    rbi: stats.rbi,
    bb: stats.bb,
    k: stats.k,
    sb: stats.sb,
    cs: 0,
    hbp: 0,
    sac: 0,
    sf: 0,
    lob: 1,
  }));
  await upsert('baseball_box_score_batting', battingRows);

  // Pitching line — pitcher1 throws a complete game win.
  const pitchingRows = [
    {
      id: detId('pitching:pitcher1'),
      game_id: completedGameId,
      player_id: playerIdByKey.pitcher1,
      team_id: TEAM_ID,
      ip: 9,
      h: 6,
      r: 3,
      er: 3,
      bb: 2,
      k: 7,
      hr: 0,
      pitch_count: 102,
      result: 'W',
      complete_game: true,
    },
  ];
  await upsert('baseball_box_score_pitching', pitchingRows);

  // Recalculate season stats so team rollups + player "My Stats" are non-zero.
  // `recalculate_baseball_season_stats` bypasses its coach-only guard when
  // called via the service-role key (auth.role() = 'service_role').
  if (!DRY) {
    const statPlayerIds = new Set([
      ...battingRows.map((r) => r.player_id),
      ...pitchingRows.map((r) => r.player_id),
    ]);
    for (const playerId of statPlayerIds) {
      const { error } = await supabase.rpc('recalculate_baseball_season_stats', {
        p_player_id: playerId,
        p_team_id: TEAM_ID,
        p_season_year: SEASON_YEAR,
      });
      if (error) {
        const msg = error.message || '';
        if (/could not find the function|schema cache/i.test(msg)) {
          skipped.push(`recalculate_baseball_season_stats — ${msg}`);
          console.warn(`  ⚠ skipped season-stats recalc (RPC not present yet): ${msg}`);
        } else {
          throw new Error(`recalculate_baseball_season_stats failed: ${msg}`);
        }
      }
    }
  }
  counts['baseball_player_season_stats (via RPC)'] = battingRows.length + pitchingRows.length > 0 ? new Set([...battingRows.map((r) => r.player_id), ...pitchingRows.map((r) => r.player_id)]).size : 0;

  // --- 5. Camp + one registration (bench1) -----------------------------------
  //
  // SUNSET GATE, same reasoning as Section 3: /baseball/dashboard/camps is a
  // recruiting route and e2e/camps.spec.ts skips, so this seeds a camp and a
  // registration nothing reads. Less sensitive than Section 3 (no player rows,
  // no recruiting_activated), but writing rows for a spec that cannot run is
  // how a fixture quietly becomes indistinguishable from real data.
  if (isRecruitingEnabled()) {
  const campId = detId('camp');
  await upsert('baseball_camps', [{
    id: campId,
    coach_id: COACH_ID,
    organization_id: ORG_ID,
    name: 'E2E Prospect Camp',
    description: 'Seeded E2E test camp (issue #375) — safe to ignore.',
    start_date: dateDaysFromNow(20),
    end_date: dateDaysFromNow(21),
    location: 'Test University Field',
    capacity: 40,
    is_free: false,
    price_cents: 15000,
    registration_deadline: dateDaysFromNow(18),
    // Must match the value the real app write path uses (createCamp/updateCamp
    // in src/app/baseball/actions/camps.ts always write status:'published'),
    // because the baseball_camps_select RLS policy only exposes non-owner
    // (player) reads when status = 'published' — see
    // supabase/migrations/20260527000000_prod_public_baseline.sql. A seeded
    // 'active' row is invisible to the player-flow camps browse query and
    // silently fails the "Camps - Player Flow" e2e specs.
    status: 'published',
  }]);

  const campRegistrationId = detId('camp-registration:bench1');
  await upsert('baseball_camp_registrations', [{
    id: campRegistrationId,
    camp_id: campId,
    player_id: playerIdByKey.bench1,
    status: 'registered',
    created_at: isoDaysAgo(5),
  }]);

  // The shared test-player must always start UNREGISTERED so the
  // register/unregister spec has a clean, idempotent starting state.
  await resetTestPlayerCampRegistration(campId, playerIdByKey[TEST_PLAYER_KEY] as string);
  } else {
    console.log(
      `${DRY ? '[DRY RUN] ' : ''}  · Camp + registration skipped — recruiting module is sunset ` +
        '(e2e/camps.spec.ts skips too).',
    );
  }

  // --- Report -----------------------------------------------------------
  console.log(`\n${DRY ? '[DRY RUN] would seed' : 'Seeded'} rows:`);
  for (const [t, n] of Object.entries(counts)) console.log(`  ${t.padEnd(38)} ${n}`);
  if (skipped.length) {
    console.log('\nSkipped (schema not present yet):');
    for (const s of skipped) console.log(`  - ${s}`);
  }
  console.log(`\nE2E logins (used by e2e/helpers/auth.ts TEST_USERS):`);
  console.log(`  COACH : ${COACH_EMAIL} / ${COACH_PASSWORD}${coachUser.created ? ' (created)' : ' (existing, password enforced)'}`);
  console.log(`  PLAYER: ${PLAYER_EMAIL} / ${PLAYER_PASSWORD}${playerUsers[TEST_PLAYER_KEY]?.created ? ' (created)' : ' (existing, password enforced)'}`);
  console.log(`  Team  : E2E Test University Baseball (${TEAM_ID})`);
  console.log(
    isRecruitingEnabled()
      ? '  Set PLAYWRIGHT_BASEBALL_SEEDED=1 before running the Camps/Pipeline/Box Score specs.'
      : '  Set PLAYWRIGHT_BASEBALL_SEEDED=1 before running the Box Score specs. ' +
        '(Camps/Pipeline skip while recruiting is sunset — the env var will not un-skip them.)',
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
