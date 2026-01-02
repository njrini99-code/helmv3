import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
);

// Note: RLS policies need to be applied via SQL directly.
// Since we can't run DDL via the client, we'll verify the existing state
// and note what needs to be applied via Supabase dashboard.

async function verifyRLS() {
  console.log('=== RLS VERIFICATION ===\n');

  // Test anonymous access to players table
  const anonClient = createClient(
    'https://dgvlnelygibgrrjehbyc.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MzA4NjgsImV4cCI6MjA4MTUwNjg2OH0.CPpPgG_EEXvu5eaSaDD-FPSVXcNTPlA5VS9W5tcX5Ck'
  );

  console.log('Testing anonymous access to players table...');
  const { data: anonPlayers, error: anonError } = await anonClient
    .from('players')
    .select('id, first_name')
    .limit(5);

  if (anonError) {
    console.log('✅ Anonymous access blocked:', anonError.message);
  } else if (anonPlayers && anonPlayers.length > 0) {
    console.log('❌ SECURITY ISSUE: Anonymous can see', anonPlayers.length, 'players');
    console.log('   Sample:', anonPlayers[0]);
  } else {
    console.log('✅ Anonymous returns 0 players');
  }

  console.log('\nTesting anonymous access to golf_players table...');
  const { data: anonGolfPlayers, error: anonGolfError } = await anonClient
    .from('golf_players')
    .select('id, first_name')
    .limit(5);

  if (anonGolfError) {
    console.log('✅ Anonymous access blocked:', anonGolfError.message);
  } else if (anonGolfPlayers && anonGolfPlayers.length > 0) {
    console.log('❌ SECURITY ISSUE: Anonymous can see', anonGolfPlayers.length, 'golf players');
  } else {
    console.log('✅ Anonymous returns 0 golf players');
  }

  console.log('\nTesting anonymous access to golf_teams table...');
  const { data: anonTeams, error: anonTeamsError } = await anonClient
    .from('golf_teams')
    .select('id, name')
    .limit(5);

  if (anonTeamsError) {
    console.log('✅ Anonymous access blocked:', anonTeamsError.message);
  } else if (anonTeams && anonTeams.length > 0) {
    console.log('⚠️  Anonymous can see', anonTeams.length, 'teams (may be intentional for invite lookup)');
  } else {
    console.log('✅ Anonymous returns 0 teams');
  }

  console.log('\n=== SERVICE ROLE CHECK ===');
  const { count: playerCount } = await supabase.from('players').select('*', { count: 'exact', head: true });
  const { count: golfPlayerCount } = await supabase.from('golf_players').select('*', { count: 'exact', head: true });
  console.log('Service role can see:', playerCount, 'baseball players');
  console.log('Service role can see:', golfPlayerCount, 'golf players');

  console.log('\n=== RLS MIGRATION NEEDED ===');
  console.log('The RLS migration at supabase/migrations/048_rls_security_fix.sql');
  console.log('needs to be applied via the Supabase Dashboard SQL Editor.');
  console.log('');
  console.log('Steps:');
  console.log('1. Go to https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc/sql/new');
  console.log('2. Copy the contents of 048_rls_security_fix.sql');
  console.log('3. Run it in the SQL Editor');
}

verifyRLS().catch(console.error);
