import { createClient } from '@supabase/supabase-js';

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtbnNzcnJvbHBpbnZ3ampudWZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODMyNjg0MCwiZXhwIjoyMDgzOTAyODQwfQ.pW8-66rT0Y3LXcPYSXMPqj0_y0K_AYnPj22nXjdMU6I';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtbnNzcnJvbHBpbnZ3ampudWZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMjY4NDAsImV4cCI6MjA4MzkwMjg0MH0.5CVd_a4BTOXsvone_Zz76RBITMNuk73JYM-SMfZmIPc';
const URL = 'https://qmnssrrolpinvwjjnufo.supabase.co';

const admin = createClient(URL, SERVICE_KEY);

async function diagnose() {
  console.log('='.repeat(60));
  console.log('RLS RECURSION DIAGNOSTIC');
  console.log('='.repeat(60));

  // 1. Sign in as Test Player
  const playerClient = createClient(URL, ANON_KEY);
  const { error: signInErr } = await playerClient.auth.signInWithPassword({
    email: 'rinin376@gmail.com',
    password: 'Pirates#09!!!'
  });
  
  if (signInErr) {
    console.log('❌ Cannot sign in as player:', signInErr.message);
    return;
  }
  console.log('✅ Signed in as Test Player\n');

  // 2. Test each table that might cause recursion
  const tables = [
    'golf_players',
    'golf_team_members', 
    'golf_teams',
    'golf_coaches'
  ];

  for (const table of tables) {
    console.log(`\n--- Testing ${table} ---`);
    const { data, error } = await playerClient.from(table).select('id').limit(1);
    if (error) {
      console.log(`❌ ${table}: ${error.message}`);
      if (error.message.includes('recursion')) {
        console.log(`   ⚠️  RECURSION FOUND IN ${table}!`);
      }
    } else {
      console.log(`✅ ${table}: ${data?.length} rows returned`);
    }
  }

  // 3. Test functions individually
  console.log('\n\n--- Testing Helper Functions ---');
  
  const testTeamId = '6ecdd1a6-63fe-4beb-b094-00118f334163';
  const testPlayerId = '49ffe06d-9b22-4f2f-8c69-f56badbbde6b';

  // Test get_current_golf_player_id
  const { data: playerId, error: e1 } = await playerClient.rpc('get_current_golf_player_id');
  console.log(`get_current_golf_player_id(): ${e1 ? '❌ ' + e1.message : playerId || 'null'}`);

  // Test get_user_golf_team_ids  
  const { data: teamIds, error: e2 } = await playerClient.rpc('get_user_golf_team_ids');
  console.log(`get_user_golf_team_ids(): ${e2 ? '❌ ' + e2.message : JSON.stringify(teamIds)}`);

  // Test is_golf_team_player
  const { data: isPlayer, error: e3 } = await playerClient.rpc('is_golf_team_player', { team_uuid: testTeamId });
  console.log(`is_golf_team_player('${testTeamId}'): ${e3 ? '❌ ' + e3.message : isPlayer}`);

  // Test user_is_golf_team_member
  const { data: isMember, error: e4 } = await playerClient.rpc('user_is_golf_team_member', { check_team_id: testTeamId });
  console.log(`user_is_golf_team_member('${testTeamId}'): ${e4 ? '❌ ' + e4.message : isMember}`);

  // 4. Check if the policies in the DB match what we expect
  console.log('\n\n--- Checking Applied Migrations ---');
  const { data: migrations } = await admin
    .from('schema_migrations')
    .select('version')
    .order('version', { ascending: false })
    .limit(20);
  
  if (migrations) {
    console.log('Recent migrations:');
    migrations.forEach((m: any) => console.log(`  ${m.version}`));
  } else {
    console.log('Could not read schema_migrations');
  }

  // 5. Direct test: Can service role query golf_team_members then have player query it?
  console.log('\n\n--- Cross-check: Service vs Player ---');
  
  const { data: svcData } = await admin
    .from('golf_team_members')
    .select('team_id, player_id, status')
    .eq('player_id', testPlayerId);
  console.log(`Service role sees: ${JSON.stringify(svcData)}`);

  const { data: playerData, error: playerErr } = await playerClient
    .from('golf_team_members')
    .select('team_id, player_id, status')
    .eq('player_id', testPlayerId);
  console.log(`Player sees: ${playerErr ? '❌ ' + playerErr.message : JSON.stringify(playerData)}`);

  console.log('\n' + '='.repeat(60));
  console.log('DIAGNOSIS COMPLETE');
  console.log('='.repeat(60));
}

diagnose().catch(console.error);
