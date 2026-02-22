import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qmnssrrolpinvwjjnufo.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtbnNzcnJvbHBpbnZ3ampudWZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODMyNjg0MCwiZXhwIjoyMDgzOTAyODQwfQ.pW8-66rT0Y3LXcPYSXMPqj0_y0K_AYnPj22nXjdMU6I';
const TEAM_ID = '23ec4daa-124c-4744-a0ef-6a504f94fff7';
const COACH_ID = '0917b446-e19e-4b25-9d42-3f358dec8e65';

const s = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const fmt = n => parseFloat(n.toFixed(3));

async function run() {
  console.log('📊 Seeding stats for existing roster...\n');

  // Get all players on this team
  const { data: members, error } = await s
    .from('baseball_team_members')
    .select('player_id, position, baseball_players!inner(id, primary_position)')
    .eq('team_id', TEAM_ID);

  if (error || !members?.length) {
    console.error('Failed to get team members:', error?.message);
    process.exit(1);
  }

  console.log(`Found ${members.length} players on team\n`);

  const OPPONENTS = ['UCLA', 'USC', 'Stanford', 'Cal', 'Arizona', 'Oregon', 'Washington', 'Arizona St', 'Utah', 'Colorado'];
  const now = Date.now();

  for (const member of members) {
    const playerId = member.player_id;
    const pos = (member.baseball_players?.primary_position) || 'OF';
    const isPitcher = pos === 'P';

    // Clear existing stats for this player on this team
    await s.from('baseball_player_stats').delete().eq('player_id', playerId).eq('team_id', TEAM_ID);

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

      sessions.push({
        player_id: playerId,
        team_id: TEAM_ID,
        coach_id: COACH_ID,
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

    const { error: statsErr } = await s.from('baseball_player_stats').insert(sessions);
    if (statsErr) { console.error(`  ✗ ${playerId}:`, statsErr.message); continue; }

    // Recompute aggregates
    const hitting = sessions.filter(ss => ss.at_bats > 0);
    const totalAB = hitting.reduce((sum, ss) => sum + ss.at_bats, 0);
    const totalH = hitting.reduce((sum, ss) => sum + ss.hits, 0);
    const totalHR = hitting.reduce((sum, ss) => sum + ss.home_runs, 0);
    const totalRBI = hitting.reduce((sum, ss) => sum + ss.rbis, 0);
    const totalBB = hitting.reduce((sum, ss) => sum + ss.walks, 0);
    const careerAvg = totalAB > 0 ? fmt(totalH / totalAB) : 0;
    const careerOBP = totalAB + totalBB > 0 ? fmt((totalH + totalBB) / (totalAB + totalBB)) : 0;

    const gameSess = hitting.filter(ss => ss.stat_type === 'game');
    const gameAB = gameSess.reduce((sum, ss) => sum + ss.at_bats, 0);
    const gameH = gameSess.reduce((sum, ss) => sum + ss.hits, 0);
    const gameAvg = gameAB > 0 ? fmt(gameH / gameAB) : 0;

    const pracSess = hitting.filter(ss => ss.stat_type === 'practice');
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

    const { error: aggErr } = await s.from('baseball_player_aggregates').upsert({
      player_id: playerId,
      team_id: TEAM_ID,
      career_avg: careerAvg,
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
    }, { onConflict: 'player_id,team_id' });

    const flag = trend === 'improving' ? '↑' : trend === 'declining' ? '↓' : '—';
    console.log(`  ✓ ${pos.padEnd(2)} | ${sessions.length} sessions | AVG .${(careerAvg*1000).toFixed(0).padStart(3,'0')} | Game .${(gameAvg*1000).toFixed(0).padStart(3,'0')} | HR ${totalHR} | RBI ${totalRBI} | ${flag} ${trend}`);
    if (aggErr) console.error(`    ⚠ aggregate error:`, aggErr.message);
  }

  console.log('\n✅ Stats seeded for all roster players!');
  console.log('🔗 https://helmsportslabs.com/baseball/dashboard/command-center');
}

run().catch(console.error);
