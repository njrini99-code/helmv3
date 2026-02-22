import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qmnssrrolpinvwjjnufo.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtbnNzcnJvbHBpbnZ3ampudWZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODMyNjg0MCwiZXhwIjoyMDgzOTAyODQwfQ.pW8-66rT0Y3LXcPYSXMPqj0_y0K_AYnPj22nXjdMU6I';
const ORG_ID = 'd4b0a207-76ca-49ff-ae29-59c26990d474'; // Pacific Coast Conference
const COACH_ID = '0917b446-e19e-4b25-9d42-3f358dec8e65'; // yup@gmail.com

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const fmt = n => parseFloat(n.toFixed(3));

// ─── Player pool ─────────────────────────────────────────────────────────────
const PLAYERS = [
  { first: 'Marcus', last: 'Rodriguez', pos: 'SS', city: 'Austin', state: 'TX', hs: 'Westlake HS' },
  { first: 'Jake', last: 'Thompson', pos: 'C', city: 'San Diego', state: 'CA', hs: 'Mission Hills HS' },
  { first: 'Caleb', last: 'Williams', pos: 'OF', city: 'Atlanta', state: 'GA', hs: 'Marist HS' },
  { first: 'Dylan', last: 'Carter', pos: '1B', city: 'Phoenix', state: 'AZ', hs: 'Brophy College Prep' },
  { first: 'Ethan', last: 'Brooks', pos: 'P', city: 'Tampa', state: 'FL', hs: 'Jesuit HS' },
  { first: 'Noah', last: 'Mitchell', pos: '3B', city: 'Dallas', state: 'TX', hs: 'Highland Park HS' },
  { first: 'Liam', last: 'Harrison', pos: '2B', city: 'Nashville', state: 'TN', hs: 'Brentwood Academy' },
  { first: 'Owen', last: 'Davis', pos: 'OF', city: 'Charlotte', state: 'NC', hs: 'Myers Park HS' },
  { first: 'Aiden', last: 'Clark', pos: 'P', city: 'Houston', state: 'TX', hs: 'The Woodlands HS' },
  { first: 'Hunter', last: 'Lewis', pos: 'OF', city: 'Denver', state: 'CO', hs: 'Cherry Creek HS' },
  { first: 'Tyler', last: 'Walker', pos: 'C', city: 'Scottsdale', state: 'AZ', hs: 'Chaparral HS' },
  { first: 'Cole', last: 'Hall', pos: '1B', city: 'Miami', state: 'FL', hs: 'Gulliver Prep' },
  { first: 'Mason', last: 'Allen', pos: 'SS', city: 'Portland', state: 'OR', hs: 'Jesuit HS' },
  { first: 'Logan', last: 'Young', pos: '3B', city: 'Columbus', state: 'OH', hs: 'New Albany HS' },
  { first: 'Gavin', last: 'King', pos: 'P', city: 'Sacramento', state: 'CA', hs: 'Jesuit HS' },
  { first: 'Bryce', last: 'Wright', pos: '2B', city: 'Chicago', state: 'IL', hs: 'Mt. Carmel HS' },
  { first: 'Connor', last: 'Lopez', pos: 'OF', city: 'Las Vegas', state: 'NV', hs: 'Bishop Gorman HS' },
  { first: 'Jordan', last: 'Hill', pos: 'P', city: 'St. Louis', state: 'MO', hs: 'Vianney HS' },
  { first: 'Ryan', last: 'Scott', pos: 'SS', city: 'Seattle', state: 'WA', hs: 'Eastside Catholic' },
  { first: 'Zach', last: 'Green', pos: '1B', city: 'Minneapolis', state: 'MN', hs: 'Edina HS' },
  { first: 'Brandon', last: 'Adams', pos: 'OF', city: 'Boston', state: 'MA', hs: 'Catholic Memorial' },
  { first: 'Chase', last: 'Nelson', pos: 'C', city: 'Raleigh', state: 'NC', hs: 'Cary HS' },
  { first: 'Austin', last: 'Baker', pos: '3B', city: 'San Antonio', state: 'TX', hs: 'Reagan HS' },
  { first: 'Drew', last: 'Rivera', pos: 'P', city: 'Indianapolis', state: 'IN', hs: 'Cathedral HS' },
  { first: 'Tanner', last: 'Campbell', pos: '2B', city: 'Kansas City', state: 'MO', hs: 'Blue Valley HS' },
  { first: 'Kyle', last: 'Torres', pos: 'OF', city: 'Orlando', state: 'FL', hs: 'Lake Mary HS' },
  { first: 'Jared', last: 'Phillips', pos: 'SS', city: 'Memphis', state: 'TN', hs: 'Christian Brothers HS' },
  { first: 'Derek', last: 'Evans', pos: '1B', city: 'Salt Lake City', state: 'UT', hs: 'Brighton HS' },
  { first: 'Travis', last: 'Morris', pos: 'P', city: 'Omaha', state: 'NE', hs: 'Creighton Prep' },
  { first: 'Spencer', last: 'Reed', pos: 'OF', city: 'Richmond', state: 'VA', hs: 'Collegiate School' },
];

const BATS = ['R', 'L', 'S'];
const THROWS = ['R', 'L'];
const TRENDS = ['improving', 'improving', 'stable', 'stable', 'declining'];

async function run() {
  console.log('🌱 Starting baseball roster seed...\n');

  // ── 1. Create team ──────────────────────────────────────────────────────────
  console.log('Creating team...');
  const { data: existingTeam } = await supabase
    .from('baseball_teams')
    .select('id')
    .eq('organization_id', ORG_ID)
    .maybeSingle();

  let teamId;
  if (existingTeam) {
    teamId = existingTeam.id;
    console.log(`  ✓ Using existing team: ${teamId}`);
  } else {
    const { data: newTeam, error: teamErr } = await supabase
      .from('baseball_teams')
      .insert({
        name: 'Pacific Coast Conference',
        team_type: 'college',
        organization_id: ORG_ID,
        join_code: 'PCC2026',
        created_by: COACH_ID,
      })
      .select()
      .single();

    if (teamErr) { console.error('Team error:', teamErr); process.exit(1); }
    teamId = newTeam.id;
    console.log(`  ✓ Created team: ${teamId}`);
  }

  // ── 2. Create 30 players ────────────────────────────────────────────────────
  console.log('\nCreating 30 players...');
  const playerIds = [];

  for (let i = 0; i < PLAYERS.length; i++) {
    const p = PLAYERS[i];
    const jerseyNum = i + 1;
    const gradYear = pick([2026, 2027, 2027, 2028]);
    const heightFt = pick([5, 6, 6, 6]);
    const heightIn = rand(0, 11);
    const weight = rand(165, 225);
    const gpa = fmt(rand(28, 40) / 10);
    const bats = pick(BATS);
    const throws = bats === 'L' ? 'L' : 'R';
    const secPos = p.pos === 'P' ? null : pick(['OF', 'IF', null]);

    // Create a real auth user for this player (required by NOT NULL FK constraint)
    const email = `${p.first.toLowerCase()}.${p.last.toLowerCase()}.demo@helmseed.dev`;
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password: 'HelmSeed2026!!',
      email_confirm: true,
      user_metadata: { first_name: p.first, last_name: p.last },
    });
    let userId = authUser?.user?.id;
    if (authErr || !userId) {
      // User might already exist — look them up directly in auth.users via admin getUserByEmail
      try {
        const { data: found } = await supabase.auth.admin.getUserByEmail(email);
        userId = found?.user?.id ?? null;
      } catch (_) { /* method may not exist in this SDK version */ }

      // Fallback: query public.users table by email
      if (!userId) {
        const { data: pubUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .maybeSingle();
        userId = pubUser?.id ?? null;
      }

      if (!userId) {
        console.error(`  ✗ Auth user ${p.first} ${p.last}:`, authErr?.message);
        continue;
      }
    }

    const { data: player, error } = await supabase
      .from('baseball_players')
      .insert({
        user_id: userId,
        first_name: p.first,
        last_name: p.last,
        primary_position: p.pos,
        secondary_position: secPos,
        grad_year: gradYear,
        bats,
        throws,
        height_feet: heightFt,
        height_inches: heightIn,
        weight_lbs: weight,
        gpa,
        city: p.city,
        state: p.state,
        high_school_name: p.hs,
        player_type: 'college',
        recruiting_activated: true,
      })
      .select()
      .single();

    if (error) { console.error(`  ✗ Player ${p.first} ${p.last}:`, error.message); continue; }

    // Add to team
    await supabase.from('baseball_team_members').insert({
      team_id: teamId,
      player_id: player.id,
      jersey_number: jerseyNum,
      position: p.pos,
      status: 'active',
      joined_at: new Date(Date.now() - rand(30, 180) * 86400000).toISOString(),
    });

    playerIds.push({ id: player.id, pos: p.pos, jersey: jerseyNum });
    process.stdout.write(`  ✓ ${jerseyNum}. ${p.first} ${p.last} (${p.pos})\n`);
  }

  // ── 3. Generate stat sessions per player ───────────────────────────────────
  console.log('\nGenerating stats sessions...');
  const now = Date.now();

  for (const { id: playerId, pos } of playerIds) {
    const isPitcher = pos === 'P';
    const sessions = [];
    const numSessions = rand(12, 20);

    for (let s = 0; s < numSessions; s++) {
      const daysAgo = (numSessions - s) * rand(3, 7);
      const sessionDate = new Date(now - daysAgo * 86400000).toISOString().split('T')[0];
      const statType = pick(['game', 'game', 'game', 'practice', 'practice']);

      const ab = isPitcher ? rand(0, 2) : rand(2, 5);
      const h = Math.min(ab, rand(0, ab));
      const hr = h > 0 && !isPitcher ? (Math.random() < 0.15 ? rand(0, 1) : 0) : 0;
      const rbi = !isPitcher ? rand(0, Math.max(0, h + hr)) : 0;
      const bb = rand(0, 2);
      const so = rand(0, ab - h);
      const sb = !isPitcher && Math.random() < 0.2 ? rand(0, 1) : 0;
      const dbls = h > 0 && !isPitcher ? (Math.random() < 0.2 ? rand(0, 1) : 0) : 0;
      const trpl = h > 0 && !isPitcher ? (Math.random() < 0.05 ? rand(0, 1) : 0) : 0;
      const exitVelo = !isPitcher ? rand(82, 105) : null;
      const pitchVelo = isPitcher ? rand(82, 96) : null;
      const ip = isPitcher ? rand(1, 7) + rand(0, 2) / 3 : null;
      const kThrown = isPitcher ? rand(1, ip * 1.2) : null;
      const hAllowed = isPitcher ? rand(0, ip * 1.5) : null;
      const erAllowed = isPitcher ? rand(0, hAllowed) : null;

      sessions.push({
        player_id: playerId,
        team_id: teamId,
        coach_id: COACH_ID,
        session_date: sessionDate,
        session_name: statType === 'game' ? `Game vs ${pick(['UCLA', 'USC', 'Stanford', 'Cal', 'Arizona', 'Oregon', 'Washington'])}` : pick(['Batting Practice', 'Scrimmage Session', 'Intra-squad Game', 'Live BP']),
        stat_type: statType,
        at_bats: ab,
        hits: h,
        doubles: dbls,
        triples: trpl,
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

    const { error: statsErr } = await supabase.from('baseball_player_stats').insert(sessions);
    if (statsErr) console.error(`  ✗ Stats for ${playerId}:`, statsErr.message);

    // ── 4. Compute aggregates ─────────────────────────────────────────────────
    const hitting = sessions.filter(s => s.at_bats > 0);
    const totalAB = hitting.reduce((sum, s) => sum + s.at_bats, 0);
    const totalH = hitting.reduce((sum, s) => sum + s.hits, 0);
    const totalHR = hitting.reduce((sum, s) => sum + s.home_runs, 0);
    const totalRBI = hitting.reduce((sum, s) => sum + s.rbis, 0);
    const careerAvg = totalAB > 0 ? fmt(totalH / totalAB) : 0;

    const gameSess = hitting.filter(s => s.stat_type === 'game');
    const gameAB = gameSess.reduce((sum, s) => sum + s.at_bats, 0);
    const gameH = gameSess.reduce((sum, s) => sum + s.hits, 0);
    const gameAvg = gameAB > 0 ? fmt(gameH / gameAB) : 0;

    const scrSess = hitting.filter(s => s.stat_type === 'practice');
    const scrAB = scrSess.reduce((sum, s) => sum + s.at_bats, 0);
    const scrH = scrSess.reduce((sum, s) => sum + s.hits, 0);
    const practiceAvg = scrAB > 0 ? fmt(scrH / scrAB) : 0;

    const last5 = hitting.slice(-5);
    const l5AB = last5.reduce((sum, s) => sum + s.at_bats, 0);
    const l5H = last5.reduce((sum, s) => sum + s.hits, 0);
    const last5Avg = l5AB > 0 ? fmt(l5H / l5AB) : 0;

    const last10 = hitting.slice(-10);
    const l10AB = last10.reduce((sum, s) => sum + s.at_bats, 0);
    const l10H = last10.reduce((sum, s) => sum + s.hits, 0);
    const last10Avg = l10AB > 0 ? fmt(l10H / l10AB) : 0;

    const trend = last5Avg > careerAvg + 0.03 ? 'improving' : last5Avg < careerAvg - 0.03 ? 'declining' : 'stable';

    // Build trend_data for sparkline chart
    const trendData = hitting.slice(-12).map((s, idx) => ({
      session: idx + 1,
      avg: s.at_bats > 0 ? fmt(s.hits / s.at_bats) : 0,
      date: s.session_date,
      type: s.stat_type,
    }));

    const { error: aggErr } = await supabase.from('baseball_player_aggregates').upsert({
      player_id: playerId,
      team_id: teamId,
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
      // Store HR/RBI in trend_data metadata for stats tab
    }, { onConflict: 'player_id,team_id' });

    if (aggErr) console.error(`  ✗ Aggregates for ${playerId}:`, aggErr.message);
    process.stdout.write(`  ✓ ${sessions.length} sessions, avg: .${(careerAvg * 1000).toFixed(0).padStart(3, '0')} (${trend})\n`);
  }

  console.log(`\n✅ Done! Created ${playerIds.length} players on team ${teamId}`);
  console.log(`🔗 Visit: https://helmsportslabs.com/baseball/dashboard/command-center`);
}

run().catch(console.error);
