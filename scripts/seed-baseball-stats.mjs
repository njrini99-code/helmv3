/**
 * seed-baseball-stats.mjs — env-gated, dry-run-by-default stats seeder (#417).
 *
 * SAFE BY DEFAULT
 *   - No flags → dry run (prints plan, writes nothing)
 *   - --confirm required to write
 *   - Production project ref blocked unless --allow-prod
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Target: SEED_TEAM_ID + SEED_COACH_ID (or --team / --coach)
 *
 *   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/seed-baseball-stats.mjs
 *   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/seed-baseball-stats.mjs --confirm --team <uuid> --coach <uuid>
 *
 * #379 RECONCILIATION — this seeder writes BOTH stats layers, not just the
 * legacy one:
 *   1. Legacy flat/aggregate (`baseball_player_stats` / `baseball_player_
 *      aggregates`) — unchanged, kept so the ~30 grandfathered consumers
 *      (Command Center, Roster, Player Today/Passport, CoachHelm — see
 *      `src/lib/baseball/stat-layer-manifest.ts`) keep showing real numbers
 *      during the migration window documented in
 *      `docs/baseball/stats-migration-plan.md`.
 *   2. Canonical box-score/season (`baseball_box_score_batting` /
 *      `_pitching` → `recalculate_baseball_season_stats()` →
 *      `baseball_player_season_stats`) — NEW. For every `stat_type: 'game'`
 *      session this script seeds, it additionally upserts a synthetic
 *      completed `baseball_games` row + matching box-score line(s), then
 *      calls the SAME `recalculate_baseball_season_stats` RPC
 *      `src/app/baseball/actions/games.ts`'s box-score save flow calls
 *      (`completeGameAndRecalculate` / `save_baseball_full_box_score`) —
 *      not a bespoke insert into `baseball_player_season_stats`. Practice
 *      sessions have no box-score equivalent (layer 2 has no practice-session
 *      concept yet — see the Open Questions in the #379 design) and are
 *      intentionally left as legacy-only.
 *   This closes the "seeded but Stats Center shows empty" symptom #379
 *   reports: `src/lib/baseball/read-models/stats-center.ts` reads ONLY the
 *   box-score/season layer, so a team seeded by the old version of this
 *   script (legacy layer only) looked fully populated on Command
 *   Center/Roster/Passport and completely empty on Stats Center.
 *
 * UPSERT-ONLY: every write here is a `.upsert(row, { onConflict: ... })`
 * keyed on a deterministic id (flat sessions, box-score games) or the
 * table's natural key (`game_id, player_id` for box-score lines, matching
 * the unique constraint `recalculate_baseball_season_stats`'s caller —
 * `save_baseball_full_box_score` — relies on). Nothing is ever deleted or
 * reinserted; re-running this script only ever adds/updates rows.
 *
 * SECURITY NOTE (#380): an earlier revision of this file (commit ef1dc926,
 * superseded by #417) had a production Supabase URL, a long-lived
 * `service_role` JWT, and production team/coach UUIDs hardcoded in source.
 * That key MUST be treated as compromised and rotated from the Supabase
 * dashboard by a human — this refactor only prevents *future* secrets from
 * being committed, it does not retroactively invalidate the old key, which
 * remains readable in git history. See
 * docs/operations/2026-06-30-baseball-stats-seed-key-rotation.md.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

const KNOWN_PROD_PROJECT_REF = 'qmnssrrolpinvwjjnufo';
const NS = 'baseball-stats-seed';

export function detId(key) {
  const h = createHash('sha1').update(`${NS}:${key}`).digest('hex');
  const b = h.slice(0, 32).split('');
  b[12] = '5';
  b[16] = ((parseInt(b[16], 16) & 0x3) | 0x8).toString(16);
  const s = b.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function parseConfig() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const teamId = getArg('--team') ?? (process.env.SEED_TEAM_ID ?? '').trim();
  const coachId = getArg('--coach') ?? (process.env.SEED_COACH_ID ?? '').trim();
  const confirm = process.argv.includes('--confirm');
  const allowProd = process.argv.includes('--allow-prod');
  const dryRun = !confirm;

  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  if (!teamId || !coachId) {
    console.error('Missing target team/coach. Set SEED_TEAM_ID + SEED_COACH_ID or pass --team and --coach');
    process.exit(1);
  }

  let projectRef = '';
  try {
    projectRef = new URL(url).hostname.split('.')[0] ?? '';
  } catch {
    console.error('Invalid NEXT_PUBLIC_SUPABASE_URL');
    process.exit(1);
  }

  if (projectRef === KNOWN_PROD_PROJECT_REF && !allowProd) {
    console.error(
      `Refusing to seed stats against production project ${projectRef}. Re-run with --allow-prod if intentional.`,
    );
    process.exit(1);
  }

  return { url, serviceKey, teamId, coachId, dryRun, projectRef };
}

const OPPONENTS = ['UCLA', 'USC', 'Stanford', 'Cal', 'Arizona', 'Oregon', 'Washington', 'Arizona St', 'Utah', 'Colorado'];
const GAME_OPPONENT_PREFIX = 'Game vs ';

/**
 * Deterministic-by-default random helpers. `randomFn` defaults to
 * `Math.random` for real seeding runs; tests inject a fixed sequence so the
 * reconciliation logic below can be exercised without flaking on which
 * sessions randomly draw `stat_type: 'game'`.
 */
export function createRng(randomFn = Math.random) {
  return {
    rand: (min, max) => Math.floor(randomFn() * (max - min + 1)) + min,
    pick: (arr) => arr[Math.floor(randomFn() * arr.length)],
    next: randomFn,
  };
}

const fmt = (n) => parseFloat(n.toFixed(3));

async function upsertRow(client, table, row, dryRun, label, onConflict = 'id') {
  if (dryRun) {
    console.log(`  [DRY RUN] would upsert ${table}: ${label}`);
    return { error: null };
  }
  return client.from(table).upsert(row, { onConflict });
}

/**
 * Builds one player's legacy-shape session rows (layer 1). Pure — no I/O.
 * `rng` and `now` are injectable so tests get deterministic, reproducible
 * output instead of depending on `Math.random()` / `Date.now()`.
 */
export function buildPlayerSessions({ teamId, playerId, coachId, position, rng = createRng(), now = Date.now() }) {
  const { rand, pick, next } = rng;
  const isPitcher = position === 'P';
  const sessions = [];
  const numSessions = rand(14, 22);

  for (let s2 = 0; s2 < numSessions; s2++) {
    const daysAgo = (numSessions - s2) * rand(3, 6);
    const sessionDate = new Date(now - daysAgo * 86400000).toISOString().split('T')[0];
    const statType = pick(['game', 'game', 'game', 'practice', 'practice']);

    const ab = isPitcher ? rand(0, 1) : rand(2, 5);
    const h = Math.min(ab, rand(0, Math.ceil(ab * 0.38)));
    const hr = h > 0 && !isPitcher && next() < 0.12 ? 1 : 0;
    const rbi = !isPitcher ? rand(0, h + hr) : 0;
    const bb = rand(0, 2);
    const so = rand(0, Math.max(0, ab - h - 1));
    const dbl = h > 1 && next() < 0.2 ? 1 : 0;
    const tpl = h > 2 && next() < 0.04 ? 1 : 0;
    const sb = !isPitcher && next() < 0.15 ? 1 : 0;
    const exitVelo = !isPitcher ? rand(84, 107) : null;
    const pitchVelo = isPitcher ? rand(84, 97) : null;
    const ip = isPitcher ? rand(2, 7) : null;
    const kThrown = isPitcher && ip ? rand(Math.floor(ip * 0.8), Math.floor(ip * 1.5)) : null;
    const hAllowed = isPitcher && ip ? rand(0, Math.floor(ip * 1.2)) : null;
    const erAllowed = isPitcher && hAllowed != null ? rand(0, Math.min(hAllowed, 4)) : null;

    const rowId = detId(`${teamId}:${playerId}:${sessionDate}:${s2}`);
    sessions.push({
      id: rowId,
      player_id: playerId,
      team_id: teamId,
      coach_id: coachId,
      session_date: sessionDate,
      session_name: statType === 'game'
        ? `${GAME_OPPONENT_PREFIX}${pick(OPPONENTS)}`
        : pick(['Batting Practice', 'Intra-squad', 'Live BP', 'Scrimmage']),
      stat_type: statType,
      at_bats: ab,
      hits: h,
      doubles: dbl,
      triples: tpl,
      home_runs: hr,
      rbis: rbi,
      walks: bb,
      strikeouts: so,
      stolen_bases: sb,
      exit_velocity: exitVelo,
      pitch_velocity: pitchVelo,
      innings_pitched: ip,
      strikeouts_thrown: kThrown,
      hits_allowed: hAllowed,
      earned_runs: erAllowed,
    });
  }

  return sessions;
}

/**
 * Derives this player's season/career/trend aggregate row (layer 1) from
 * their session set. Pure — extracted so `seedTeamStats` and tests share one
 * implementation instead of duplicating the math.
 */
export function buildAggregateRow(teamId, playerId, sessions) {
  const hitting = sessions.filter((ss) => ss.at_bats > 0);
  const totalAB = hitting.reduce((sum, ss) => sum + ss.at_bats, 0);
  const totalH = hitting.reduce((sum, ss) => sum + ss.hits, 0);
  const totalHR = hitting.reduce((sum, ss) => sum + ss.home_runs, 0);
  const totalRBI = hitting.reduce((sum, ss) => sum + ss.rbis, 0);
  const totalBB = hitting.reduce((sum, ss) => sum + ss.walks, 0);
  const careerAvg = totalAB > 0 ? fmt(totalH / totalAB) : 0;
  const careerOBP = totalAB + totalBB > 0 ? fmt((totalH + totalBB) / (totalAB + totalBB)) : 0;

  const gameSess = hitting.filter((ss) => ss.stat_type === 'game');
  const gameAB = gameSess.reduce((sum, ss) => sum + ss.at_bats, 0);
  const gameH = gameSess.reduce((sum, ss) => sum + ss.hits, 0);
  const gameAvg = gameAB > 0 ? fmt(gameH / gameAB) : 0;

  const pracSess = hitting.filter((ss) => ss.stat_type === 'practice');
  const pracAB = pracSess.reduce((sum, ss) => sum + ss.at_bats, 0);
  const pracH = pracSess.reduce((sum, ss) => sum + ss.hits, 0);
  const practiceAvg = pracAB > 0 ? fmt(pracH / pracAB) : 0;

  const last5 = hitting.slice(-5);
  const l5AB = last5.reduce((sum, ss) => sum + ss.at_bats, 0);
  const l5H = last5.reduce((sum, ss) => sum + ss.hits, 0);
  const last5Avg = l5AB > 0 ? fmt(l5H / l5AB) : 0;

  const last10 = hitting.slice(-10);
  const l10AB = last10.reduce((sum, ss) => sum + ss.at_bats, 0);
  const l10H = last10.reduce((sum, ss) => sum + ss.hits, 0);
  const last10Avg = l10AB > 0 ? fmt(l10H / l10AB) : 0;

  const trend = last5Avg > careerAvg + 0.025 ? 'improving'
    : last5Avg < careerAvg - 0.025 ? 'declining' : 'stable';

  const trendData = hitting.slice(-14).map((ss, idx) => ({
    session: idx + 1,
    avg: ss.at_bats > 0 ? fmt(ss.hits / ss.at_bats) : 0,
    date: ss.session_date,
    type: ss.stat_type,
    hr: ss.home_runs,
    rbi: ss.rbis,
  }));

  return {
    player_id: playerId,
    team_id: teamId,
    career_avg: careerAvg,
    career_obp: careerOBP,
    game_avg: gameAvg,
    practice_avg: practiceAvg,
    last_5_avg: last5Avg,
    last_10_avg: last10Avg,
    recent_trend: trend,
    total_at_bats: totalAB,
    total_hits: totalH,
    total_sessions: sessions.length,
    last_session_at: sessions[sessions.length - 1].session_date,
    trend_data: trendData,
    pressure_gap: fmt(gameAvg - practiceAvg),
    // Not persisted on baseball_player_aggregates but useful for callers'
    // console summaries.
    _totalHR: totalHR,
    _totalRBI: totalRBI,
  };
}

/**
 * Derives the canonical box-score-era rows (#379) for this player's
 * `stat_type: 'game'` sessions ONLY — one synthetic completed
 * `baseball_games` row + a matching batting line (always) and pitching line
 * (when the session recorded innings pitched) per game-type session.
 * Practice sessions have no box-score equivalent (see the #379 design's
 * Open Questions on a canonical practice shape) and are intentionally not
 * represented here — the legacy aggregate's `practice_avg` remains the only
 * home for that context until a canonical practice shape lands.
 *
 * Pure — no I/O — so both `seedTeamStats` and the drift/smoke tests share
 * one derivation instead of the tests re-implementing it.
 */
export function buildBoxScoreRowsForSessions(teamId, sessions) {
  const games = [];
  const batting = [];
  const pitching = [];

  for (const session of sessions) {
    if (session.stat_type !== 'game') continue;

    const gameId = detId(`box-game:${teamId}:${session.player_id}:${session.id}`);
    const opponentName = session.session_name?.startsWith(GAME_OPPONENT_PREFIX)
      ? session.session_name.slice(GAME_OPPONENT_PREFIX.length)
      : null;

    games.push({
      id: gameId,
      team_id: teamId,
      game_date: session.session_date,
      game_type: 'game',
      opponent_name: opponentName,
      status: 'completed',
    });

    batting.push({
      id: detId(`box-bat:${gameId}:${session.player_id}`),
      game_id: gameId,
      player_id: session.player_id,
      team_id: teamId,
      ab: session.at_bats,
      r: 0,
      h: session.hits,
      doubles: session.doubles,
      triples: session.triples,
      hr: session.home_runs,
      rbi: session.rbis,
      bb: session.walks,
      k: session.strikeouts,
      sb: session.stolen_bases,
    });

    if (session.innings_pitched != null) {
      pitching.push({
        id: detId(`box-pit:${gameId}:${session.player_id}`),
        game_id: gameId,
        player_id: session.player_id,
        team_id: teamId,
        ip: session.innings_pitched,
        h: session.hits_allowed ?? 0,
        r: session.earned_runs ?? 0,
        er: session.earned_runs ?? 0,
        bb: 0,
        k: session.strikeouts_thrown ?? 0,
        hr: 0,
      });
    }
  }

  return { games, batting, pitching };
}

/**
 * Reconciled per-team stats seeding (#379). For every rostered player:
 *   1. Upserts the legacy flat sessions + derived aggregate row (layer 1) —
 *      unchanged behavior, kept for grandfathered consumers.
 *   2. Upserts the matching box-score game/batting/pitching rows (layer 2)
 *      for that player's `stat_type: 'game'` sessions, then calls
 *      `recalculate_baseball_season_stats` for every season year touched —
 *      the SAME RPC `src/app/baseball/actions/games.ts`'s box-score save
 *      flow calls, not a bespoke insert into `baseball_player_season_stats`.
 *
 * Every write is an upsert (never a delete-then-reinsert). Returns a summary
 * per player for the caller (CLI printer or a test) to inspect.
 */
export async function seedTeamStats(client, {
  teamId,
  coachId,
  members,
  dryRun,
  randomFn = Math.random,
  now = Date.now(),
  log = true,
}) {
  const rng = createRng(randomFn);
  const summaries = [];

  for (const member of members) {
    const playerId = member.player_id;
    const pos = member.baseball_players?.primary_position || 'OF';

    const sessions = buildPlayerSessions({ teamId, playerId, coachId, position: pos, rng, now });

    // ---- Layer 1: legacy flat sessions (unchanged) ----
    for (const session of sessions) {
      const { error: statsErr } = await upsertRow(
        client,
        'baseball_player_stats',
        session,
        dryRun,
        `${playerId} ${session.session_date}`,
        'id',
      );
      if (statsErr && log) console.error(`  ✗ ${playerId}:`, statsErr.message);
    }

    const aggregateRow = buildAggregateRow(teamId, playerId, sessions);
    const { _totalHR: totalHR, _totalRBI: totalRBI, ...persistedAggregateRow } = aggregateRow;

    if (dryRun) {
      if (log) console.log(`  [DRY RUN] ${pos.padEnd(2)} | ${sessions.length} sessions for ${playerId}`);
    } else {
      const { error: aggErr } = await client
        .from('baseball_player_aggregates')
        .upsert(persistedAggregateRow, { onConflict: 'player_id,team_id' });
      if (aggErr && log) console.error('    ⚠ aggregate error:', aggErr.message);
      if (log) {
        const flag = aggregateRow.recent_trend === 'improving' ? '↑' : aggregateRow.recent_trend === 'declining' ? '↓' : '—';
        console.log(
          `  ✓ ${pos.padEnd(2)} | ${sessions.length} sessions | AVG .${(aggregateRow.career_avg * 1000).toFixed(0).padStart(3, '0')} | Game .${(aggregateRow.game_avg * 1000).toFixed(0).padStart(3, '0')} | HR ${totalHR} | RBI ${totalRBI} | ${flag} ${aggregateRow.recent_trend}`,
        );
      }
    }

    // ---- Layer 2 reconciliation (#379): box-score + season recalc ----
    const { games, batting, pitching } = buildBoxScoreRowsForSessions(teamId, sessions);

    if (dryRun) {
      if (log) {
        console.log(
          `  [DRY RUN] would upsert ${games.length} box-score game(s), ${batting.length} batting line(s), ${pitching.length} pitching line(s) for ${playerId}`,
        );
      }
    } else {
      for (const game of games) {
        const { error } = await client.from('baseball_games').upsert(game, { onConflict: 'id' });
        if (error && log) console.error('    ⚠ box-score game upsert error:', error.message);
      }
      for (const row of batting) {
        const { error } = await client
          .from('baseball_box_score_batting')
          .upsert(row, { onConflict: 'game_id,player_id' });
        if (error && log) console.error('    ⚠ box-score batting upsert error:', error.message);
      }
      for (const row of pitching) {
        const { error } = await client
          .from('baseball_box_score_pitching')
          .upsert(row, { onConflict: 'game_id,player_id' });
        if (error && log) console.error('    ⚠ box-score pitching upsert error:', error.message);
      }

      const seasonYears = new Set(games.map((g) => g.game_date.slice(0, 4)));
      for (const yearStr of seasonYears) {
        const { error } = await client.rpc('recalculate_baseball_season_stats', {
          p_player_id: playerId,
          p_team_id: teamId,
          p_season_year: parseInt(yearStr, 10),
        });
        if (error && log) console.error(`    ⚠ season recalc error (${yearStr}):`, error.message);
      }
    }

    summaries.push({
      playerId,
      position: pos,
      sessionCount: sessions.length,
      gameBoxScoreCount: games.length,
      aggregateRow: persistedAggregateRow,
    });
  }

  return summaries;
}

async function run() {
  const { url, serviceKey, teamId, coachId, dryRun, projectRef } = parseConfig();
  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (dryRun) {
    console.log('[DRY RUN] No writes will occur. Pass --confirm to seed.');
    console.log(`Target host: ${projectRef} | team: ${teamId} | coach: ${coachId}\n`);
  } else {
    console.log(`📊 Seeding stats for team ${teamId} on ${projectRef}...\n`);
  }

  const { data: members, error } = await client
    .from('baseball_team_members')
    .select('player_id, position, baseball_players!inner(id, primary_position)')
    .eq('team_id', teamId);

  if (error || !members?.length) {
    console.error('Failed to get team members:', error?.message ?? 'no members');
    process.exit(1);
  }

  console.log(`Found ${members.length} players on team\n`);

  await seedTeamStats(client, { teamId, coachId, members, dryRun });

  console.log(dryRun ? '\n[DRY RUN] Complete — re-run with --confirm to write.' : '\n✅ Stats seeded for all roster players!');
}

// Only auto-run when executed directly (`node scripts/seed-baseball-stats.mjs`),
// not when imported — the smoke/drift tests (#379) import the exported
// builders above and must not trigger a live `parseConfig()`/`process.exit`.
const isMainModule = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (isMainModule) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
