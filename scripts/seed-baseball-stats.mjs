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

function detId(key) {
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

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmt = (n) => parseFloat(n.toFixed(3));

async function upsertRow(client, table, row, dryRun, label) {
  if (dryRun) {
    console.log(`  [DRY RUN] would upsert ${table}: ${label}`);
    return { error: null };
  }
  return client.from(table).upsert(row, { onConflict: 'id' });
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

  const OPPONENTS = ['UCLA', 'USC', 'Stanford', 'Cal', 'Arizona', 'Oregon', 'Washington', 'Arizona St', 'Utah', 'Colorado'];
  const now = Date.now();

  for (const member of members) {
    const playerId = member.player_id;
    const pos = member.baseball_players?.primary_position || 'OF';
    const isPitcher = pos === 'P';

    const sessions = [];
    const numSessions = rand(14, 22);

    for (let s2 = 0; s2 < numSessions; s2++) {
      const daysAgo = (numSessions - s2) * rand(3, 6);
      const sessionDate = new Date(now - daysAgo * 86400000).toISOString().split('T')[0];
      const statType = pick(['game', 'game', 'game', 'practice', 'practice']);

      const ab = isPitcher ? rand(0, 1) : rand(2, 5);
      const h = Math.min(ab, rand(0, Math.ceil(ab * 0.38)));
      const hr = h > 0 && !isPitcher && Math.random() < 0.12 ? 1 : 0;
      const rbi = !isPitcher ? rand(0, h + hr) : 0;
      const bb = rand(0, 2);
      const so = rand(0, Math.max(0, ab - h - 1));
      const dbl = h > 1 && Math.random() < 0.2 ? 1 : 0;
      const tpl = h > 2 && Math.random() < 0.04 ? 1 : 0;
      const sb = !isPitcher && Math.random() < 0.15 ? 1 : 0;
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
          ? `Game vs ${pick(OPPONENTS)}`
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

    for (const session of sessions) {
      const { error: statsErr } = await upsertRow(
        client,
        'baseball_player_stats',
        session,
        dryRun,
        `${playerId} ${session.session_date}`,
      );
      if (statsErr) {
        console.error(`  ✗ ${playerId}:`, statsErr.message);
        continue;
      }
    }

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

    const aggregateRow = {
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
    };

    if (dryRun) {
      console.log(`  [DRY RUN] ${pos.padEnd(2)} | ${sessions.length} sessions for ${playerId}`);
    } else {
      const { error: aggErr } = await client
        .from('baseball_player_aggregates')
        .upsert(aggregateRow, { onConflict: 'player_id,team_id' });
      const flag = trend === 'improving' ? '↑' : trend === 'declining' ? '↓' : '—';
      console.log(
        `  ✓ ${pos.padEnd(2)} | ${sessions.length} sessions | AVG .${(careerAvg * 1000).toFixed(0).padStart(3, '0')} | Game .${(gameAvg * 1000).toFixed(0).padStart(3, '0')} | HR ${totalHR} | RBI ${totalRBI} | ${flag} ${trend}`,
      );
      if (aggErr) console.error('    ⚠ aggregate error:', aggErr.message);
    }
  }

  console.log(dryRun ? '\n[DRY RUN] Complete — re-run with --confirm to write.' : '\n✅ Stats seeded for all roster players!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
