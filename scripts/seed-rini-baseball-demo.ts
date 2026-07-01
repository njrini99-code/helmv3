/**
 * seed-rini-baseball-demo.ts — full BaseballHelm + Helm Lift Lab demo for the
 * user's REAL accounts (njrini99 = coach, rinin376 = player), on ONE team.
 *
 * Modeled on scripts/seed-baseball-demo.ts (Phase-1) + seed-baseball-lifting-demo.ts
 * (Phase-2): deterministic uuid ids, upsert-only (no destructive writes except the
 * explicit old-team delete below), dry-run by default, --confirm to write.
 *
 *   Coach : njrini99@gmail.com  / Pirates#09!!   (head coach + lifting coach)
 *   Player: rinin376@gmail.com  / Pirates#09!!!  (Marcus Rodriguez, SS #7)
 *
 * Run:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-rini-baseball-demo.ts          # dry run
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-rini-baseball-demo.ts --confirm # write
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Golf is NEVER touched. The two auth users are SHARED with golf (same login),
 * so the passwords below also become the golf logins for these emails.
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

// --- Verified prod identity -------------------------------------------------
const COACH_USER_ID = 'c8dcf7d5-da14-439b-93c6-58d1e0dd38a0'; // njrini99@gmail.com
const PLAYER_USER_ID = '7f13c6f0-e097-4e2d-b881-70f7712a093e'; // rinin376@gmail.com
const COACH_ID = '5080d69c-4bd0-41fc-a02a-714062f2e74b'; // reuse existing baseball_coaches row
const OLD_TEAM_ID = 'f9bdd510-acf4-44c0-9003-4fdca5b48755'; // empty shell to delete

const COACH_EMAIL = 'njrini99@gmail.com';
const COACH_PASSWORD = 'Pirates#09!!';
const PLAYER_EMAIL = 'rinin376@gmail.com';
const PLAYER_PASSWORD = 'Pirates#09!!!';
const FILLER_DOMAIN = 'rinibaseballdemo.com';
const FILLER_PASSWORD = 'Pirates#09!!!';

const NS = 'rini-baseball-demo-v1';
function detId(key: string): string {
  const h = createHash('sha1').update(`${NS}:${key}`).digest('hex');
  const b = h.slice(0, 32).split('');
  b[12] = '5';
  b[16] = ((parseInt(b[16], 16) & 0x3) | 0x8).toString(16);
  const s = b.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

const ORG_ID = '6ce2c0bd-fb7d-4cae-a536-387f6aea8ff7'; // reuse njrini99's existing "Rini University" org
const TEAM_ID = detId('team');

// 14-man squad. p1 IS rinin376 (Marcus Rodriguez). Others get filler auth users.
const ROSTER = [
  { key: 'p1', first: 'Marcus', last: 'Rodriguez', pos: 'SS', sec: '2B', bats: 'R', throws: 'R', jersey: 7, grad: 2026 },
  { key: 'p2', first: 'Jake', last: 'Thompson', pos: 'C', sec: '1B', bats: 'R', throws: 'R', jersey: 12, grad: 2026 },
  { key: 'p3', first: 'Caleb', last: 'Williams', pos: 'CF', sec: 'OF', bats: 'L', throws: 'L', jersey: 24, grad: 2027 },
  { key: 'p4', first: 'Ethan', last: 'Brooks', pos: 'P', sec: 'P', bats: 'R', throws: 'R', jersey: 31, grad: 2026 },
  { key: 'p5', first: 'Noah', last: 'Mitchell', pos: '3B', sec: 'SS', bats: 'R', throws: 'R', jersey: 5, grad: 2027 },
  { key: 'p6', first: 'Liam', last: 'Harrison', pos: '2B', sec: 'OF', bats: 'S', throws: 'R', jersey: 9, grad: 2028 },
  { key: 'p7', first: 'Aiden', last: 'Clark', pos: 'P', sec: 'P', bats: 'L', throws: 'L', jersey: 18, grad: 2026 },
  { key: 'p8', first: 'Owen', last: 'Davis', pos: 'RF', sec: '1B', bats: 'R', throws: 'R', jersey: 22, grad: 2027 },
  { key: 'p9', first: 'Lucas', last: 'Bennett', pos: '1B', sec: 'OF', bats: 'L', throws: 'L', jersey: 33, grad: 2027 },
  { key: 'p10', first: 'Mason', last: 'Reed', pos: 'LF', sec: 'CF', bats: 'R', throws: 'R', jersey: 14, grad: 2028 },
  { key: 'p11', first: 'Carter', last: 'Hayes', pos: 'P', sec: 'P', bats: 'R', throws: 'R', jersey: 27, grad: 2026 },
  { key: 'p12', first: 'Wyatt', last: 'Foster', pos: 'DH', sec: '1B', bats: 'R', throws: 'R', jersey: 44, grad: 2027 },
  { key: 'p13', first: 'Hunter', last: 'Price', pos: 'P', sec: 'P', bats: 'L', throws: 'L', jersey: 20, grad: 2028 },
  { key: 'p14', first: 'Cole', last: 'Sanders', pos: 'C', sec: '3B', bats: 'R', throws: 'R', jersey: 2, grad: 2028 },
];
const PLAYER_KEY = 'p1';

// --- Date helpers -----------------------------------------------------------
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

// --- Upsert wrapper (tolerates missing schema by skipping) ------------------
type Counts = Record<string, number>;
const counts: Counts = {};
let DRY = false;
let supabase: SupabaseClient;
const skipped: string[] = [];

async function upsert(table: string, rows: readonly unknown[], conflict = 'id') {
  if (!rows.length) return;
  counts[table] = (counts[table] ?? 0) + rows.length;
  if (DRY) return;
  const { error } = await supabase.from(table).upsert(rows as never, { onConflict: conflict });
  if (error) {
    const msg = error.message || '';
    if (/could not find the table|schema cache|does not exist|could not find the '.*' column|violates not-null constraint|violates check constraint/i.test(msg)) {
      delete counts[table];
      skipped.push(`${table} — ${msg}`);
      console.warn(`  ⚠ skipped ${table}: ${msg}`);
      return;
    }
    throw new Error(`upsert ${table} failed: ${msg}`);
  }
}

async function ensureAuthUser(email: string, password: string): Promise<string | null> {
  const { data: existing } = await supabase.from('users').select('id').ilike('email', email).maybeSingle();
  if (existing) return existing.id as string;
  if (DRY) return null;
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data?.user) throw new Error(`createUser failed for ${email}: ${error?.message}`);
  return data.user.id;
}

async function setPassword(userId: string, password: string, label: string) {
  if (DRY) {
    console.log(`  [DRY] would set password for ${label}`);
    return;
  }
  const { error } = await supabase.auth.admin.updateUserById(userId, { password });
  if (error) console.warn(`  ⚠ setPassword ${label}: ${error.message}`);
  else console.log(`  ✓ password set for ${label}`);
}

// ===========================================================================
async function main() {
  DRY = !process.argv.includes('--confirm');
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  if (DRY) console.log('[DRY RUN] printing plan, writing NOTHING. Re-run with --confirm.\n');
  console.log(`${DRY ? '[DRY RUN] ' : ''}Seeding Rini University Baseball (team ${TEAM_ID.slice(0, 8)})`);

  // --- 0. Passwords -------------------------------------------------------
  await setPassword(COACH_USER_ID, COACH_PASSWORD, COACH_EMAIL);
  await setPassword(PLAYER_USER_ID, PLAYER_PASSWORD, PLAYER_EMAIL);

  // --- 1. Delete old empty team (baseball only; golf untouched) -----------
  if (!DRY) {
    await supabase.from('baseball_team_coach_staff').delete().eq('team_id', OLD_TEAM_ID);
    await supabase.from('baseball_teams').delete().eq('id', OLD_TEAM_ID);
    console.log(`  ✓ deleted old empty team ${OLD_TEAM_ID.slice(0, 8)}`);
  } else {
    console.log(`  [DRY] would delete old empty team ${OLD_TEAM_ID.slice(0, 8)} (+ its staff row)`);
  }

  // --- 2. Org + coach + team ----------------------------------------------
  await upsert('organizations', [{
    id: ORG_ID, name: 'Rini University', type: 'college', division: 'NCAA D1',
    conference: 'Demo Conference', location_city: 'Charlotte', location_state: 'NC',
    primary_color: '#1f6f43', secondary_color: '#0f3d27',
    description: 'Rini University demo organization.',
  }]);

  await upsert('baseball_coaches', [{
    id: COACH_ID, user_id: COACH_USER_ID, organization_id: ORG_ID, coach_type: 'college',
    full_name: 'Nick Rini', email: COACH_EMAIL, title: 'Head Coach',
    bio: 'Head coach of Rini University Baseball. Demo account.', onboarding_completed: true,
  }]);

  await upsert('baseball_teams', [{
    id: TEAM_ID, organization_id: ORG_ID, name: 'Rini University Baseball', team_type: 'college',
    // program_type is the recruiting gate's source of truth (middleware.ts). It
    // defaults to 'college' at the DB level, but set it explicitly so the demo
    // team always resolves the college recruiting suite even on an environment
    // where the program_type column backfill hasn't run.
    program_type: 'college',
    join_code: 'RINIBB', primary_color: '#1f6f43', secondary_color: '#0f3d27',
    description: 'Rini University Baseball — full demo data.', created_by: COACH_ID,
  }]);

  await upsert('baseball_team_coach_staff', [{
    id: detId('staff:head'), team_id: TEAM_ID, coach_id: COACH_ID, role: 'head_coach', is_primary: true,
    can_manage_roster: true, can_manage_practice: true, can_manage_lifting: true, can_view_academics: true,
    can_manage_imports: true, can_manage_stats: true, can_invite_staff: true, can_manage_settings: true,
    can_view_medical: true, can_message_team: true, can_manage_calendar: true,
    can_manage_documents: true, is_head_coach: true,
    capabilities: {}, status: 'active', title: 'Head Coach',
    bio: 'Head coach + strength coach for Rini University Baseball.', visible_to_players: true,
  }], 'team_id, coach_id');

  // --- 3. Players + memberships -------------------------------------------
  const playerIdByKey: Record<string, string> = {};
  const playerRows: Record<string, unknown>[] = [];
  const memberRows: Record<string, unknown>[] = [];
  for (const p of ROSTER) {
    const pid = detId(`player:${p.key}`);
    playerIdByKey[p.key] = pid;
    const isPlayerLogin = p.key === PLAYER_KEY;
    const email = isPlayerLogin ? PLAYER_EMAIL : `${p.first}.${p.last}@${FILLER_DOMAIN}`.toLowerCase();
    const userId = isPlayerLogin ? PLAYER_USER_ID : await ensureAuthUser(email, FILLER_PASSWORD);
    playerRows.push({
      id: pid, user_id: userId, player_type: 'college', recruiting_activated: false, first_name: p.first, last_name: p.last, email,
      primary_position: p.pos, secondary_position: p.sec, bats: p.bats, throws: p.throws, grad_year: p.grad,
      height_feet: 6, height_inches: p.jersey % 5, weight_lbs: 180 + (p.jersey % 30),
      onboarding_completed: true, profile_completion_percent: 100,
    });
    memberRows.push({
      id: detId(`member:${p.key}`), team_id: TEAM_ID, player_id: pid, status: 'active',
      jersey_number: p.jersey, position: p.pos, joined_at: isoDaysAgo(140), approved_by: COACH_ID, approved_at: isoDaysAgo(140),
    });
  }
  await upsert('baseball_players', playerRows);
  await upsert('baseball_team_members', memberRows);

  // --- 4. Events ----------------------------------------------------------
  const practiceEventId = detId('event:practice');
  const gameEventId = detId('event:game');
  const meetingEventId = detId('event:meeting');
  await upsert('baseball_events', [
    { id: practiceEventId, team_id: TEAM_ID, created_by: COACH_ID, title: 'Team Practice — Defense + Live BP', description: 'Full-squad practice. Mandatory.', event_type: 'practice', location: 'Rini Field', start_time: isoDaysAgo(-1), end_time: isoDaysAgo(-1), is_mandatory: true },
    { id: gameEventId, team_id: TEAM_ID, created_by: COACH_ID, title: 'vs Coastal State', description: 'Conference matchup.', event_type: 'game', location: 'Rini Field', start_time: isoDaysAgo(-3), end_time: isoDaysAgo(-3), is_mandatory: true },
    { id: meetingEventId, team_id: TEAM_ID, created_by: COACH_ID, title: 'Team Meeting — Travel Logistics', description: 'Read receipts required.', event_type: 'meeting', location: 'Film Room', start_time: isoDaysAgo(-2), end_time: isoDaysAgo(-2), is_mandatory: true },
  ]);

  // --- 5. Games (6 final + 2 scheduled) -----------------------------------
  const oppNames = ['Coastal State', 'Piedmont Tech', 'Lakeside College', 'Ironwood University', 'Granite Bay', 'Riverside A&M'];
  // Kept as its own array (not pushed into gameRows in place) so section 5b
  // below can derive box-score lines from these exact 6 completed games
  // without re-deriving scores/dates or fighting the `as unknown as number`
  // null-casts the 2 scheduled games below need.
  const pastGames = oppNames.map((opp, i) => {
    const us = 3 + ((i * 3) % 7);
    const them = 1 + ((i * 5) % 6);
    return {
      id: detId(`game:past:${i}`), team_id: TEAM_ID, event_id: null, game_date: dateDaysAgo(28 - i * 4),
      game_type: 'game', opponent_name: opp, location: i % 2 === 0 ? 'Rini Field' : `${opp} Park`,
      home_away: i % 2 === 0 ? 'home' : 'away', our_score: us, opponent_score: them, innings_played: 9,
      status: 'completed', notes: us > them ? 'W' : 'L', created_by: COACH_ID,
    };
  });
  const gameRows = [
    ...pastGames,
    { id: detId('game:next:0'), team_id: TEAM_ID, event_id: gameEventId, game_date: dateDaysFromNow(3), game_type: 'game', opponent_name: 'Coastal State', location: 'Rini Field', home_away: 'home', our_score: null as unknown as number, opponent_score: null as unknown as number, innings_played: null as unknown as number, status: 'scheduled', notes: null as unknown as string, created_by: COACH_ID },
    { id: detId('game:next:1'), team_id: TEAM_ID, event_id: null, game_date: dateDaysFromNow(6), game_type: 'game', opponent_name: 'Piedmont Tech', location: 'Piedmont Park', home_away: 'away', our_score: null as unknown as number, opponent_score: null as unknown as number, innings_played: null as unknown as number, status: 'scheduled', notes: null as unknown as string, created_by: COACH_ID },
  ];
  await upsert('baseball_games', gameRows);

  // --- 5b. Box scores + season/aggregate rollups (#382 — seeded smoke data) -
  // Stats Center (src/lib/baseball/read-models/stats-center.ts), Command Center
  // roster pulse, Box Score (/stats/games/[gameId]), and My Stats all read from
  // baseball_box_score_batting/_pitching, baseball_player_aggregates, and
  // baseball_player_season_stats — none of which this seed wrote before #382.
  // This block derives deterministic box-score lines for a fixed lineup +
  // pitching staff across the 6 completed games above, then rolls those SAME
  // lines up into season stats + aggregates so every sink agrees (no drift
  // between the box score, the season total, and the roster-pulse aggregate —
  // the Stats Center "Needs recalc" badge would otherwise flag every player).
  //
  // Season year matches the read models' own default (current calendar year).
  // Because the games above are dated relative to "now" (last ~28 days), this
  // only drifts from the default `seasonYear` window in the first ~28 days of
  // January — a pre-existing characteristic of this seed's relative-date
  // scheme, not introduced here. See e2e/helpers/baseball-seed-manifest.ts.
  const SEASON_YEAR = NOW.getFullYear();
  const LINEUP_KEYS = ['p1', 'p2', 'p3', 'p5', 'p6', 'p8', 'p9', 'p10', 'p12'] as const; // 9 position players, incl. Marcus (p1)
  const PITCHER_KEYS = ['p4', 'p7', 'p11', 'p13'] as const;

  function battingRates(ab: number, h: number, doubles: number, triples: number, hr: number, bb: number) {
    if (ab === 0) return { avg: null as number | null, obp: null as number | null, slg: null as number | null, ops: null as number | null };
    const singles = h - doubles - triples - hr;
    const avg = h / ab;
    const slg = (singles + 2 * doubles + 3 * triples + 4 * hr) / ab;
    const pa = ab + bb;
    const obp = pa > 0 ? (h + bb) / pa : null;
    const ops = obp !== null ? obp + slg : null;
    return {
      avg: parseFloat(avg.toFixed(3)),
      obp: obp !== null ? parseFloat(obp.toFixed(3)) : null,
      slg: parseFloat(slg.toFixed(3)),
      ops: ops !== null ? parseFloat(ops.toFixed(3)) : null,
    };
  }

  function pitchingRates(ip: number, h: number, er: number, bb: number, k: number) {
    if (ip === 0) return { era: null as number | null, whip: null as number | null, k9: null as number | null, bb9: null as number | null };
    return {
      era: parseFloat(((er * 9) / ip).toFixed(2)),
      whip: parseFloat(((bb + h) / ip).toFixed(3)),
      k9: parseFloat(((k * 9) / ip).toFixed(2)),
      bb9: parseFloat(((bb * 9) / ip).toFixed(2)),
    };
  }

  interface BatterTotals {
    g: number; ab: number; r: number; h: number; doubles: number; triples: number; hr: number;
    rbi: number; bb: number; k: number; sb: number; cs: number; lastGameDate: string;
  }
  interface PitcherTotals {
    g: number; gs: number; w: number; l: number; sv: number; ip: number;
    h: number; r: number; er: number; bb: number; k: number; hr: number;
  }
  const batterTotals = new Map<string, BatterTotals>();
  const pitcherTotals = new Map<string, PitcherTotals>();
  const battingLineRows: Record<string, unknown>[] = [];
  const pitchingLineRows: Record<string, unknown>[] = [];
  const playerStatRows: Record<string, unknown>[] = [];

  pastGames.forEach((game, gi) => {
    const them = game.opponent_score;

    LINEUP_KEYS.forEach((key, j) => {
      const pid = playerIdByKey[key];
      const seed = gi * LINEUP_KEYS.length + j;
      const ab = 3 + (seed % 2);
      const hitRoll = seed % 5;
      const h = Math.min(ab, hitRoll === 0 ? 0 : hitRoll <= 2 ? 1 : hitRoll === 3 ? 2 : 3);
      const doubles = h >= 2 && seed % 4 === 0 ? 1 : 0;
      const hr = h >= 1 && seed % 7 === 0 && doubles + 1 <= h ? 1 : 0;
      const triples = 0;
      const r = h > 0 ? seed % 3 : 0;
      const rbi = hr + (h > 0 ? seed % 2 : 0);
      const bb = seed % 6 === 0 ? 1 : 0;
      const k = ab - h > 0 && seed % 3 === 1 ? 1 : 0;
      const sb = key === 'p1' && seed % 5 === 0 ? 1 : 0;
      const rates = battingRates(ab, h, doubles, triples, hr, bb);

      battingLineRows.push({
        id: detId(`bs-bat:${gi}:${key}`), game_id: game.id, player_id: pid, team_id: TEAM_ID,
        ab, r, h, doubles, triples, hr, rbi, bb, k, sb, cs: 0, hbp: 0, sac: 0, sf: 0, lob: 0,
        batting_order: j + 1, ...rates,
      });

      playerStatRows.push({
        id: detId(`pstat:${gi}:${key}`), player_id: pid, team_id: TEAM_ID, coach_id: COACH_ID,
        stat_type: 'game', session_date: game.game_date, session_name: `vs ${game.opponent_name}`,
        at_bats: ab, hits: h, doubles, triples, home_runs: hr, rbis: rbi, walks: bb,
        strikeouts: k, stolen_bases: sb, source: 'manual', source_visibility: 'player_visible',
      });

      const prev = batterTotals.get(key);
      batterTotals.set(key, {
        g: (prev?.g ?? 0) + 1,
        ab: (prev?.ab ?? 0) + ab,
        r: (prev?.r ?? 0) + r,
        h: (prev?.h ?? 0) + h,
        doubles: (prev?.doubles ?? 0) + doubles,
        triples: (prev?.triples ?? 0) + triples,
        hr: (prev?.hr ?? 0) + hr,
        rbi: (prev?.rbi ?? 0) + rbi,
        bb: (prev?.bb ?? 0) + bb,
        k: (prev?.k ?? 0) + k,
        sb: (prev?.sb ?? 0) + sb,
        cs: prev?.cs ?? 0,
        lastGameDate: game.game_date,
      });
    });

    // Starter (6 IP) + reliever (3 IP) — sums to the game's 9 innings_played.
    // Non-null: gi % PITCHER_KEYS.length is always a valid in-bounds index.
    const starterKey = PITCHER_KEYS[gi % PITCHER_KEYS.length]!;
    const relieverKey = PITCHER_KEYS[(gi + 2) % PITCHER_KEYS.length]!;
    const starterEr = Math.max(0, them - 1);
    const relieverEr = Math.max(0, them - starterEr);
    const pitchLines = [
      {
        key: starterKey, ip: 6.0, h: 4 + (gi % 3), er: starterEr, bb: 1 + (gi % 2), k: 5 + (gi % 4),
        hr: them >= 4 ? 1 : 0, gs: 1,
        result: (game.our_score > them ? 'W' : game.our_score < them ? 'L' : null) as string | null,
      },
      {
        key: relieverKey, ip: 3.0, h: 2 + (gi % 2), er: relieverEr, bb: gi % 2, k: 2 + (gi % 3),
        hr: 0, gs: 0, result: null as string | null,
      },
    ];

    for (const line of pitchLines) {
      const pid = playerIdByKey[line.key];
      const rates = pitchingRates(line.ip, line.h, line.er, line.bb, line.k);
      pitchingLineRows.push({
        id: detId(`bs-pitch:${gi}:${line.key}`), game_id: game.id, player_id: pid, team_id: TEAM_ID,
        ip: line.ip, h: line.h, r: line.er, er: line.er, bb: line.bb, k: line.k, hr: line.hr,
        gs: line.gs, result: line.result, ...rates,
      });
      const prev = pitcherTotals.get(line.key);
      pitcherTotals.set(line.key, {
        g: (prev?.g ?? 0) + 1,
        gs: (prev?.gs ?? 0) + line.gs,
        w: (prev?.w ?? 0) + (line.result === 'W' ? 1 : 0),
        l: (prev?.l ?? 0) + (line.result === 'L' ? 1 : 0),
        sv: prev?.sv ?? 0,
        ip: (prev?.ip ?? 0) + line.ip,
        h: (prev?.h ?? 0) + line.h,
        r: (prev?.r ?? 0) + line.er,
        er: (prev?.er ?? 0) + line.er,
        bb: (prev?.bb ?? 0) + line.bb,
        k: (prev?.k ?? 0) + line.k,
        hr: (prev?.hr ?? 0) + line.hr,
      });
    }
  });

  await upsert('baseball_box_score_batting', battingLineRows);
  await upsert('baseball_box_score_pitching', pitchingLineRows);
  await upsert('baseball_player_stats', playerStatRows);

  // ---- Season-stat rollups: one row per player with a box-score sample, so
  // the Stats Center "stored season row" reconcile target matches the
  // official-derived totals exactly (drift would otherwise show a false
  // "Needs recalc" on every seeded player). ----
  const seasonRows: Record<string, unknown>[] = [];
  for (const [key, t] of batterTotals) {
    const rates = battingRates(t.ab, t.h, t.doubles, t.triples, t.hr, t.bb);
    seasonRows.push({
      id: detId(`season:${SEASON_YEAR}:${key}`), player_id: playerIdByKey[key], team_id: TEAM_ID,
      season_year: SEASON_YEAR, g: t.g, ab: t.ab, r: t.r, h: t.h, doubles: t.doubles, triples: t.triples,
      hr: t.hr, rbi: t.rbi, bb: t.bb, k: t.k, sb: t.sb, cs: t.cs, ...rates,
    });
  }
  for (const [key, t] of pitcherTotals) {
    const rates = pitchingRates(t.ip, t.h, t.er, t.bb, t.k);
    seasonRows.push({
      id: detId(`season:${SEASON_YEAR}:${key}`), player_id: playerIdByKey[key], team_id: TEAM_ID,
      season_year: SEASON_YEAR, g_p: t.g, gs: t.gs, w: t.w, l: t.l, sv: t.sv, ip: t.ip,
      h_allowed: t.h, r_allowed: t.r, er: t.er, bb_allowed: t.bb, k_thrown: t.k, hr_allowed: t.hr,
      era: rates.era, whip: rates.whip, k9: rates.k9, bb9: rates.bb9,
    });
  }
  await upsert('baseball_player_season_stats', seasonRows, 'player_id, team_id, season_year');

  // ---- Roster-pulse aggregates (batters only — the 4 pitchers genuinely have
  // no batting sample in this demo, so they honestly stay `noData` on Command
  // Center, exactly as an all-pitching roster slot would in production). ----
  const aggregateRows: Record<string, unknown>[] = [];
  for (const [key, t] of batterTotals) {
    const careerAvg = t.ab > 0 ? parseFloat((t.h / t.ab).toFixed(3)) : null;
    aggregateRows.push({
      id: detId(`agg:${key}`), player_id: playerIdByKey[key], team_id: TEAM_ID,
      career_avg: careerAvg, game_avg: careerAvg, practice_avg: null,
      last_5_avg: careerAvg, last_10_avg: careerAvg, pressure_gap: null,
      total_at_bats: t.ab, total_hits: t.h, total_sessions: t.g,
      recent_trend: key === 'p1' ? 'improving' : t.g % 3 === 0 ? 'declining' : 'stable',
      trend_data: {}, last_session_at: `${t.lastGameDate}T18:00:00.000Z`,
      updated_at: NOW.toISOString(),
    });
  }
  await upsert('baseball_player_aggregates', aggregateRows, 'player_id, team_id');

  // --- 6. Practice -> blocks -> attendance --------------------------------
  const practiceId = detId('practice:1');
  await upsert('baseball_practices', [{ id: practiceId, team_id: TEAM_ID, event_id: practiceEventId, title: 'Defense + Live BP', focus: 'Infield reads, two-strike approach, bullpens', status: 'published', published_at: isoDaysAgo(1) }]);
  await upsert('baseball_practice_blocks', [
    { id: detId('block:1'), team_id: TEAM_ID, practice_id: practiceId, start_offset_min: 0, duration_min: 15, activity: 'Dynamic warmup', location: 'Outfield', coach_owner_id: COACH_ID },
    { id: detId('block:2'), team_id: TEAM_ID, practice_id: practiceId, start_offset_min: 15, duration_min: 30, activity: 'Infield / outfield defense', location: 'Infield', coach_owner_id: COACH_ID },
    { id: detId('block:3'), team_id: TEAM_ID, practice_id: practiceId, start_offset_min: 45, duration_min: 45, activity: 'Live batting practice', location: 'Cage + field', coach_owner_id: COACH_ID },
    { id: detId('block:4'), team_id: TEAM_ID, practice_id: practiceId, start_offset_min: 90, duration_min: 30, activity: 'Bullpens', location: 'Pen', coach_owner_id: COACH_ID },
  ]);
  const attStatuses = ['present', 'present', 'present', 'limited', 'present', 'excused', 'present', 'absent'] as const;
  await upsert('baseball_practice_attendance', ROSTER.map((p, i) => ({
    id: detId(`attend:${p.key}`), team_id: TEAM_ID, practice_id: practiceId, player_id: playerIdByKey[p.key],
    status: attStatuses[i % attStatuses.length],
    reason: attStatuses[i % attStatuses.length] === 'excused' ? 'Class conflict' : attStatuses[i % attStatuses.length] === 'absent' ? 'Illness' : null,
  })));

  // --- 7. Baseball lift (Phase-1 surface) ---------------------------------
  await upsert('baseball_exercises', [
    { id: detId('bex:squat'), team_id: TEAM_ID, name: 'Back Squat', category: 'lower', description: 'Barbell back squat', created_by_coach_id: COACH_ID, is_global: false },
    { id: detId('bex:bench'), team_id: TEAM_ID, name: 'Bench Press', category: 'upper', description: 'Flat barbell bench', created_by_coach_id: COACH_ID, is_global: false },
    { id: detId('bex:dl'), team_id: TEAM_ID, name: 'Trap Bar Deadlift', category: 'lower', description: 'Hex-bar deadlift', created_by_coach_id: COACH_ID, is_global: false },
  ]);
  const bSquat = detId('bex:squat');
  const bBench = detId('bex:bench');
  const aRows: Record<string, unknown>[] = [];
  const rRows: Record<string, unknown>[] = [];
  const readyRows: Record<string, unknown>[] = [];
  const armStatuses = ['fresh', 'normal', 'tight', 'normal', 'sore', 'fresh', 'normal', 'tight'] as const;
  for (const [i, p] of ROSTER.entries()) {
    const pid = playerIdByKey[p.key];
    aRows.push({ id: detId(`bassign:squat:${p.key}`), team_id: TEAM_ID, player_id: pid, assigned_by_coach_id: COACH_ID, exercise_id: bSquat, title: 'Lower-body strength', due_date: dateDaysFromNow(3), prescription: { sets: 4, reps: 5, intensity_pct: 80, rest_seconds: 150 }, status: 'assigned' });
    const aBench = detId(`bassign:bench:${p.key}`);
    aRows.push({ id: aBench, team_id: TEAM_ID, player_id: pid, assigned_by_coach_id: COACH_ID, exercise_id: bBench, title: 'Upper-body strength', due_date: dateDaysAgo(2), prescription: { sets: 3, reps: 8, intensity_pct: 70 }, status: 'completed' });
    rRows.push({ id: detId(`bresult:bench:${p.key}`), team_id: TEAM_ID, player_id: pid, assignment_id: aBench, exercise_id: bBench, performed_at: isoDaysAgo(2), sets: 3, reps: 8, weight: 155 + i * 5, rpe: 7.5, notes: 'Felt strong.', source: 'manual' });
    readyRows.push({ id: detId(`bready:${p.key}`), team_id: TEAM_ID, player_id: pid, check_date: dateDaysAgo(0), sleep_hours: 7 + (i % 3), energy_level: 3 + (i % 3), soreness_level: 1 + (i % 4), arm_status: armStatuses[i % armStatuses.length], mood: i % 2 === 0 ? 'locked in' : 'a little tired', notes: null });
  }
  await upsert('baseball_lift_assignments', aRows);
  await upsert('baseball_lift_results', rRows);
  await upsert('baseball_readiness_checkins', readyRows);

  // --- 8. Coach insights + player timeline --------------------------------
  const demoPid = playerIdByKey[PLAYER_KEY];
  const srcReadiness = [{ table: 'baseball_readiness_checkins', column: 'arm_status', sample_n: 14, confidence: 0.8, label: 'Last 14 readiness check-ins', visibility: 'staff_only' }];
  await upsert('baseball_coach_insights', [
    { id: detId('insight:readiness'), team_id: TEAM_ID, coach_id: COACH_ID, player_id: demoPid, insight_type: 'readiness', title: 'Arm fatigue trending up', body: 'Reported arm status drifting toward tight/sore while bench RPE held high. Consider a lighter throwing day.', priority: 'medium', status: 'open', source_refs: srcReadiness, confidence: 0.74, lifecycle_state: 'detected', player_visible: true, generated_by: 'demo_seed.readiness_trend', dedupe_key: `${TEAM_ID}:readiness_trend:${demoPid}`, last_generated_at: isoDaysAgo(0), metadata: { evidence: { source_refs: srcReadiness } } },
    { id: detId('insight:games'), team_id: TEAM_ID, coach_id: COACH_ID, player_id: null, insight_type: 'performance', title: 'Strong home stretch', body: 'Team is 4-2 over the last 6 with a +9 run differential at home.', priority: 'low', status: 'open', source_refs: [], confidence: 0.8, lifecycle_state: 'detected', player_visible: false, generated_by: 'demo_seed.record', dedupe_key: `${TEAM_ID}:record`, last_generated_at: isoDaysAgo(0), metadata: {} },
  ]);
  await upsert('baseball_player_timeline_events', [
    { id: detId('tl:lift'), player_id: demoPid, team_id: TEAM_ID, event_type: 'lift_logged', title: 'Bench press logged', body: 'Completed assigned bench session at RPE 7.5.', source_type: 'baseball_lift_results', source_id: detId(`bresult:bench:${PLAYER_KEY}`), occurred_at: isoDaysAgo(2), created_by: COACH_USER_ID, visibility: 'player_only' },
    { id: detId('tl:insight'), player_id: demoPid, team_id: TEAM_ID, event_type: 'coach_insight', title: 'Coach flagged arm fatigue', body: 'Staff note from the readiness insight engine.', source_type: 'baseball_coach_insights', source_id: detId('insight:readiness'), confidence: 0.74, occurred_at: isoDaysAgo(0), created_by: COACH_USER_ID, visibility: 'staff_only' },
  ]);

  // --- 9. Team ops surfaces (#414) ----------------------------------------
  const announcementId = detId('announcement:series');
  await upsert('baseball_announcements', [{
    id: announcementId,
    team_id: TEAM_ID,
    title: 'Series opener — bus departs 8am',
    content: 'Be in the locker room by 7:45. Cleats + road grays packed.',
    urgency: 'high',
    is_pinned: true,
    published_at: isoDaysAgo(1),
    created_by_id: COACH_ID,
  }]);
  await upsert('baseball_announcement_acknowledgements', [{
    id: detId('ann-ack:p1'),
    announcement_id: announcementId,
    player_id: demoPid,
    acknowledged_at: isoDaysAgo(0),
  }]);

  const travelItineraryId = detId('travel:coastal');
  await upsert('baseball_travel_itineraries', [{
    id: travelItineraryId,
    team_id: TEAM_ID,
    event_name: 'Coastal State series',
    departure_date: dateDaysFromNow(2),
    return_date: dateDaysFromNow(4),
    location: 'Coastal State',
    accommodation: 'Marriott Courtyard',
    transportation: 'Charter bus',
    notes: 'Rooming list posted in locker room.',
    created_by: COACH_USER_ID,
  }]);
  await upsert('baseball_travel_expenses', [{
    id: detId('travel-exp:bus'),
    itinerary_id: travelItineraryId,
    team_id: TEAM_ID,
    category: 'transport',
    amount: 2400,
    description: 'Charter bus deposit',
    paid_by: 'team',
    expense_date: dateDaysAgo(3),
    created_by: COACH_USER_ID,
  }]);

  const taskId = detId('task:passport');
  await upsert('baseball_tasks', [{
    id: taskId,
    team_id: TEAM_ID,
    title: 'Upload passport copy',
    description: 'Required for Canada showcase travel.',
    due_date: dateDaysFromNow(7),
    priority: 'high',
    category: 'travel',
    status: 'open',
    assigned_by: COACH_ID,
  }]);
  await upsert('baseball_task_assignments', ROSTER.slice(0, 4).map((p, i) => ({
    id: detId(`task-assign:${p.key}`),
    task_id: taskId,
    player_id: playerIdByKey[p.key],
    status: i === 0 ? 'completed' : 'pending',
    completed_at: i === 0 ? isoDaysAgo(1) : null,
  })));

  // ========================================================================
  // LIFT LAB (helm_lifting_*)
  // ========================================================================
  const HELM_COACH_ID = detId('helm_coach');
  await upsert('helm_lifting_coaches', [{ id: HELM_COACH_ID, user_id: COACH_USER_ID, organization_id: ORG_ID, full_name: 'Nick Rini', title: 'Head Coach / Strength', email: COACH_EMAIL, status: 'active', onboarding_completed: true }]);
  await upsert('helm_lifting_coach_assignments', [{ id: detId('helm_assign'), coach_id: HELM_COACH_ID, organization_id: ORG_ID, sport: 'baseball', team_id: TEAM_ID, team_name_snapshot: 'Rini University Baseball', is_active: true, assigned_by_user_id: COACH_USER_ID }]);

  const athleteIdByKey: Record<string, string> = {};
  await upsert('helm_lifting_athletes', ROSTER.map((p) => {
    const aid = detId(`athlete:${p.key}`);
    athleteIdByKey[p.key] = aid;
    return { id: aid, organization_id: ORG_ID, sport: 'baseball', sport_player_id: playerIdByKey[p.key], user_id: p.key === PLAYER_KEY ? PLAYER_USER_ID : null, team_id: TEAM_ID, first_name: p.first, last_name: p.last, position: p.pos, is_active: true };
  }));

  const EX_SQUAT = detId('ex:squat'), EX_BENCH = detId('ex:bench'), EX_DL = detId('ex:dl'), EX_MED = detId('ex:med');
  await upsert('helm_lifting_exercises', [
    { id: EX_SQUAT, organization_id: ORG_ID, sport: 'baseball', created_by_coach_id: HELM_COACH_ID, name: 'Back Squat', category: 'strength', primary_pattern: 'squat', body_region: 'lower', equipment: 'barbell', default_unit: 'lb', track_load: true, track_reps: true, track_sets: true, track_rpe: true, instructions: 'Barbell back squat to parallel.', coaching_cues: ['Brace your core', 'Drive through your heels'], is_global: false, is_active: true },
    { id: EX_BENCH, organization_id: ORG_ID, sport: 'baseball', created_by_coach_id: HELM_COACH_ID, name: 'Bench Press', category: 'strength', primary_pattern: 'push', body_region: 'upper', equipment: 'barbell', default_unit: 'lb', track_load: true, track_reps: true, track_sets: true, track_rpe: true, instructions: 'Flat barbell bench.', coaching_cues: ['Retract scapula', 'Drive feet'], is_global: false, is_active: true },
    { id: EX_DL, organization_id: ORG_ID, sport: 'baseball', created_by_coach_id: HELM_COACH_ID, name: 'Trap Bar Deadlift', category: 'strength', primary_pattern: 'hinge', body_region: 'lower', equipment: 'hex bar', default_unit: 'lb', track_load: true, track_reps: true, track_sets: true, track_rpe: true, instructions: 'Hex-bar deadlift, neutral spine.', coaching_cues: ['Proud chest', 'Push the floor away'], is_global: false, is_active: true },
    { id: EX_MED, organization_id: ORG_ID, sport: 'baseball', created_by_coach_id: HELM_COACH_ID, name: 'Med Ball Rotational Throw', category: 'power', primary_pattern: 'rotate', body_region: 'trunk', equipment: 'medicine ball', default_unit: 'reps', track_load: false, track_reps: true, track_sets: true, track_rpe: false, instructions: 'Rotational hip-to-shoulder power.', coaching_cues: ['Load the hip', 'Full follow-through'], is_global: false, is_active: true },
  ]);

  const PROGRAM_ID = detId('prog');
  await upsert('helm_lifting_programs', [{ id: PROGRAM_ID, organization_id: ORG_ID, sport: 'baseball', team_id: TEAM_ID, name: 'In-Season Strength Maintenance', description: 'Two-day upper/lower split to hold strength through the season.', phase: 'in_season', goal: 'maintenance', created_by_coach_id: HELM_COACH_ID, visibility: 'assigned_players', status: 'active', is_template: false, start_date: dateDaysAgo(14), end_date: dateDaysFromNow(28) }]);
  const W1 = detId('week:1'), W2 = detId('week:2');
  await upsert('helm_lifting_weeks', [
    { id: W1, program_id: PROGRAM_ID, week_number: 1, name: 'Week 1 — Base Load', theme: 'Baseline; moderate intensity.', deload: false },
    { id: W2, program_id: PROGRAM_ID, week_number: 2, name: 'Week 2 — Progress', theme: 'Add 5% load.', deload: false },
  ]);
  const D_W1L = detId('day:w1l'), D_W1U = detId('day:w1u'), D_W2L = detId('day:w2l'), D_W2U = detId('day:w2u');
  await upsert('helm_lifting_days', [
    { id: D_W1L, week_id: W1, day_number: 1, name: 'W1 Lower', day_type: 'lower', sport_context: 'post_game_recovery', estimated_minutes: 45 },
    { id: D_W1U, week_id: W1, day_number: 2, name: 'W1 Upper', day_type: 'upper', sport_context: 'off_day', estimated_minutes: 45 },
    { id: D_W2L, week_id: W2, day_number: 1, name: 'W2 Lower', day_type: 'lower', sport_context: 'post_game_recovery', estimated_minutes: 50 },
    { id: D_W2U, week_id: W2, day_number: 2, name: 'W2 Upper', day_type: 'upper', sport_context: 'off_day', estimated_minutes: 50 },
  ]);
  const S_W1L = detId('sec:w1l'), S_W1U = detId('sec:w1u'), S_W2L = detId('sec:w2l'), S_W2U = detId('sec:w2u');
  await upsert('helm_lifting_sections', [
    { id: S_W1L, lift_day_id: D_W1L, section_order: 0, name: 'Main Strength — Lower', section_type: 'main_strength' },
    { id: S_W1U, lift_day_id: D_W1U, section_order: 0, name: 'Main Strength — Upper', section_type: 'main_strength' },
    { id: S_W2L, lift_day_id: D_W2L, section_order: 0, name: 'Main Strength — Lower', section_type: 'main_strength' },
    { id: S_W2U, lift_day_id: D_W2U, section_order: 0, name: 'Main Strength — Upper', section_type: 'main_strength' },
  ]);
  await upsert('helm_lifting_prescriptions', [
    { id: detId('pr:w1l:sq'), section_id: S_W1L, exercise_id: EX_SQUAT, order_index: 0, prescription_type: 'percent_1rm', sets: 4, reps: 5, percent_1rm: 80, rest_seconds: 150, coaching_note: '2-count eccentric.' },
    { id: detId('pr:w1l:med'), section_id: S_W1L, exercise_id: EX_MED, order_index: 1, prescription_type: 'fixed', sets: 3, reps: 6, coaching_note: 'Max intent.' },
    { id: detId('pr:w1u:bn'), section_id: S_W1U, exercise_id: EX_BENCH, order_index: 0, prescription_type: 'percent_1rm', sets: 3, reps: 8, percent_1rm: 70, rest_seconds: 120 },
    { id: detId('pr:w1u:dl'), section_id: S_W1U, exercise_id: EX_DL, order_index: 1, prescription_type: 'percent_1rm', sets: 3, reps: 5, percent_1rm: 75, rest_seconds: 150 },
    { id: detId('pr:w2l:sq'), section_id: S_W2L, exercise_id: EX_SQUAT, order_index: 0, prescription_type: 'percent_1rm', sets: 4, reps: 5, percent_1rm: 85, rest_seconds: 180 },
    { id: detId('pr:w2l:med'), section_id: S_W2L, exercise_id: EX_MED, order_index: 1, prescription_type: 'fixed', sets: 3, reps: 8 },
    { id: detId('pr:w2u:bn'), section_id: S_W2U, exercise_id: EX_BENCH, order_index: 0, prescription_type: 'percent_1rm', sets: 4, reps: 6, percent_1rm: 75, rest_seconds: 120 },
  ]);

  const PA1 = detId('pa:w1l'), PA2 = detId('pa:w1u'), PA3 = detId('pa:w2l'), PA4 = detId('pa:w2u');
  await upsert('helm_lifting_program_assignments', [
    { id: PA1, organization_id: ORG_ID, sport: 'baseball', team_id: TEAM_ID, program_id: PROGRAM_ID, lift_day_id: D_W1L, assigned_by_coach_id: HELM_COACH_ID, assignment_type: 'team', scheduled_date: dateDaysAgo(10), status: 'published', player_visible_at: isoDaysAgo(10) },
    { id: PA2, organization_id: ORG_ID, sport: 'baseball', team_id: TEAM_ID, program_id: PROGRAM_ID, lift_day_id: D_W1U, assigned_by_coach_id: HELM_COACH_ID, assignment_type: 'team', scheduled_date: dateDaysAgo(7), status: 'published', player_visible_at: isoDaysAgo(7) },
    { id: PA3, organization_id: ORG_ID, sport: 'baseball', team_id: TEAM_ID, program_id: PROGRAM_ID, lift_day_id: D_W2L, assigned_by_coach_id: HELM_COACH_ID, assignment_type: 'team', scheduled_date: dateDaysAgo(0), status: 'published', player_visible_at: isoDaysAgo(0) },
    { id: PA4, organization_id: ORG_ID, sport: 'baseball', team_id: TEAM_ID, program_id: PROGRAM_ID, lift_day_id: D_W2U, assigned_by_coach_id: HELM_COACH_ID, assignment_type: 'team', scheduled_date: dateDaysFromNow(3), status: 'published', player_visible_at: isoDaysAgo(0) },
  ]);

  const PA_MAP: Record<string, { ex: { exId: string; name: string }[] }> = {
    [PA1]: { ex: [{ exId: EX_SQUAT, name: 'Back Squat' }, { exId: EX_MED, name: 'Med Ball Rotational Throw' }] },
    [PA2]: { ex: [{ exId: EX_BENCH, name: 'Bench Press' }, { exId: EX_DL, name: 'Trap Bar Deadlift' }] },
    [PA3]: { ex: [{ exId: EX_SQUAT, name: 'Back Squat' }, { exId: EX_MED, name: 'Med Ball Rotational Throw' }] },
    [PA4]: { ex: [{ exId: EX_BENCH, name: 'Bench Press' }] },
  };
  const PA_DATE: Record<string, string> = { [PA1]: dateDaysAgo(10), [PA2]: dateDaysAgo(7), [PA3]: dateDaysAgo(0), [PA4]: dateDaysFromNow(3) };
  const LOAD: Record<string, number> = { [EX_SQUAT]: 225, [EX_BENCH]: 155, [EX_DL]: 285, [EX_MED]: 0 };
  const STEP: Record<string, number> = { [EX_SQUAT]: 10, [EX_BENCH]: 5, [EX_DL]: 15, [EX_MED]: 0 };

  const sessRows: Record<string, unknown>[] = [];
  const sessExRows: Record<string, unknown>[] = [];
  const setRows: Record<string, unknown>[] = [];
  const paKeys = [PA1, PA2, PA3, PA4];
  for (const [pi, paId] of paKeys.entries()) {
    const completed = pi < 2;
    const dayEx = PA_MAP[paId].ex;
    for (const [ri, p] of ROSTER.entries()) {
      const athId = athleteIdByKey[p.key];
      const sessId = detId(`sess:${pi}:${p.key}`);
      sessRows.push({ id: sessId, program_assignment_id: paId, organization_id: ORG_ID, sport: 'baseball', team_id: TEAM_ID, athlete_id: athId, title: completed ? `${dayEx[0].name} day — ${PA_DATE[paId]}` : pi === 2 ? `Today's lift — ${dayEx[0].name} day` : `Upcoming — ${dayEx[0].name} day`, day_type: pi % 2 === 0 ? 'lower' : 'upper', scheduled_date: PA_DATE[paId], estimated_minutes: 45 + (pi > 1 ? 5 : 0), status: completed ? 'completed' : 'assigned', started_at: completed ? isoDaysAgo(pi === 0 ? 10 : 7) : null, completed_at: completed ? isoDaysAgo(pi === 0 ? 10 : 7) : null, coach_review_status: completed ? 'reviewed' : 'none', player_note: completed && ri % 3 === 0 ? 'Felt strong today.' : null, coach_note: completed && ri === 0 ? 'Great intensity — keep it up.' : null });
      for (const [ei, ex] of dayEx.entries()) {
        const seId = detId(`se:${pi}:${p.key}:${ei}`);
        const sets = 3 + (pi === 0 && ei === 0 ? 1 : 0);
        const load = LOAD[ex.exId] > 0 ? LOAD[ex.exId] + ri * STEP[ex.exId] : null;
        sessExRows.push({ id: seId, session_id: sessId, prescription_id: null, exercise_id: ex.exId, exercise_name_snapshot: ex.name, section_name_snapshot: 'Main Strength', section_type_snapshot: 'main_strength', order_index: ei, prescribed_sets: sets, prescribed_reps: ex.exId === EX_SQUAT || ex.exId === EX_DL ? 5 : ex.exId === EX_MED ? 6 : 8, prescribed_load: load, prescribed_load_unit: load !== null ? 'lb' : null, status: completed ? 'completed' : 'assigned' });
        if (completed) {
          for (let s = 1; s <= sets; s++) {
            setRows.push({ id: detId(`sr:${pi}:${p.key}:${ei}:${s}`), session_exercise_id: seId, organization_id: ORG_ID, sport: 'baseball', athlete_id: athId, set_number: s, prescribed_reps: ex.exId === EX_SQUAT || ex.exId === EX_DL ? 5 : ex.exId === EX_MED ? 6 : 8, actual_reps: ex.exId === EX_SQUAT || ex.exId === EX_DL ? 5 : ex.exId === EX_MED ? 6 : 8, prescribed_load: load, actual_load: load !== null ? load + (ri % 2 === 0 ? 5 : 0) : null, load_unit: load !== null ? 'lb' : null, rpe: 6.5 + (s === sets ? 0.5 : 0), completed_at: isoDaysAgo(pi === 0 ? 10 : 7), coach_observed: ri === 0 && s === sets });
          }
        }
      }
    }
  }
  await upsert('helm_lifting_sessions', sessRows);
  await upsert('helm_lifting_session_exercises', sessExRows);
  await upsert('helm_lifting_set_results', setRows);

  // --- Readiness check-ins (Lift Lab) -------------------------------------
  const bands = ['green', 'green', 'yellow', 'green', 'orange_lower', 'green', 'yellow', 'green', 'green', 'yellow', 'green', 'green', 'orange_lower', 'green'] as const;
  const checkinIdByKey: Record<string, string> = {};
  await upsert('helm_lifting_readiness_checkins', ROSTER.map((p, i) => {
    const cid = detId(`checkin:${p.key}`);
    checkinIdByKey[p.key] = cid;
    const sleepQ = 3 + (i % 3), energy = 2 + (i % 4), soreness = i % 7, stress = 2 + (i % 3), lower = 3 + (i % 3), mood = 3 + (i % 3);
    const raw = (sleepQ + energy + (5 - Math.round(soreness / 2)) + (6 - stress) + lower) / 5;
    return { id: cid, organization_id: ORG_ID, sport: 'baseball', athlete_id: athleteIdByKey[p.key], checkin_date: dateDaysAgo((i % 3) + 1), sleep_quality: sleepQ, energy_level: energy, soreness_overall: soreness, stress_level: stress, lower_body_status: lower, illness_flag: false, mood, notes: i === 3 ? 'Shoulder a little tight after throwing.' : null, readiness_score: Math.round(raw * 10) / 10, readiness_band: bands[i], visibility: 'performance_staff' };
  }));

  // --- Soreness body-map data ---------------------------------------------
  // Tie soreness regions to a few athletes' readiness check-ins.
  const sorenessSpec: { key: string; regions: { region: string; side: string; sev: number; note?: string }[] }[] = [
    { key: 'p4', regions: [{ region: 'shoulder', side: 'right', sev: 3, note: 'Day-after-start soreness.' }, { region: 'forearm', side: 'right', sev: 2 }] }, // pitcher
    { key: 'p2', regions: [{ region: 'lower_back', side: 'center', sev: 3 }, { region: 'quad', side: 'left', sev: 2 }] }, // catcher
    { key: 'p1', regions: [{ region: 'hamstring', side: 'left', sev: 2, note: 'Tight after baserunning.' }] }, // rinin376 / Marcus
    { key: 'p7', regions: [{ region: 'shoulder', side: 'left', sev: 2 }, { region: 'lat', side: 'left', sev: 2 }] }, // pitcher
  ];
  const sorenessRows: Record<string, unknown>[] = [];
  for (const spec of sorenessSpec) {
    spec.regions.forEach((r, idx) => {
      sorenessRows.push({ id: detId(`sore:${spec.key}:${idx}`), checkin_id: checkinIdByKey[spec.key], organization_id: ORG_ID, sport: 'baseball', athlete_id: athleteIdByKey[spec.key], body_region: r.region, side: r.side, severity: r.sev, note: r.note ?? null });
    });
  }
  await upsert('helm_lifting_soreness_maps', sorenessRows);

  // --- Report -------------------------------------------------------------
  console.log(`\n${DRY ? '[DRY RUN] would seed' : 'Seeded'} rows:`);
  for (const [t, n] of Object.entries(counts)) console.log(`  ${t.padEnd(36)} ${n}`);
  if (skipped.length) {
    console.log('\nSkipped (schema mismatch):');
    for (const s of skipped) console.log(`  ⚠ ${s}`);
  }
  console.log(`\nDemo logins:`);
  console.log(`  COACH : ${COACH_EMAIL} / ${COACH_PASSWORD}   (head coach + lifting coach)`);
  console.log(`  PLAYER: ${PLAYER_EMAIL} / ${PLAYER_PASSWORD}  (Marcus Rodriguez, SS #7)`);
  console.log(`  Team  : Rini University Baseball (${TEAM_ID})`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
