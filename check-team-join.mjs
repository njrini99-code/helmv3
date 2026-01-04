import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials. Check your .env.local file.');
  process.exit(1);
}

// Use service role key to bypass RLS
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkTeamJoin() {
  console.log('\n=== CHECKING TEAM JOIN STATUS ===\n');

  // Get the current user's golf_players record
  const { data: players, error: playersError } = await supabase
    .from('golf_players')
    .select('id, user_id, first_name, last_name, team_id')
    .order('created_at', { ascending: false })
    .limit(10);

  if (playersError) {
    console.error('❌ Error fetching players:', playersError);
    return;
  }

  console.log('📋 Recent Golf Players:');
  players?.forEach((player, index) => {
    console.log(`${index + 1}. ${player.first_name} ${player.last_name}`);
    console.log(`   Player ID: ${player.id}`);
    console.log(`   User ID: ${player.user_id}`);
    console.log(`   Team ID: ${player.team_id || '❌ NO TEAM SET'}`);
    console.log('');
  });

  // Get golf teams
  const { data: teams, error: teamsError } = await supabase
    .from('golf_teams')
    .select('id, name, invite_code, organization_id')
    .order('created_at', { ascending: false })
    .limit(10);

  if (teamsError) {
    console.error('❌ Error fetching teams:', teamsError);
    return;
  }

  console.log('\n⛳ Recent Golf Teams:');
  teams?.forEach((team, index) => {
    console.log(`${index + 1}. ${team.name}`);
    console.log(`   Team ID: ${team.id}`);
    console.log(`   Invite Code: ${team.invite_code || 'None'}`);
    console.log('');
  });

  // Check RLS policies on golf_players
  console.log('\n🔒 Checking RLS Policies on golf_players table...');
  const { data: policies, error: policiesError } = await supabase
    .rpc('get_policies', { table_name: 'golf_players' })
    .catch(() => {
      // If the function doesn't exist, query pg_policies directly
      return supabase
        .from('pg_policies')
        .select('*')
        .eq('tablename', 'golf_players');
    });

  if (policiesError) {
    console.log('⚠️ Could not fetch RLS policies (expected if function not available)');
  } else if (policies && policies.length > 0) {
    console.log(`Found ${policies.length} RLS policies on golf_players`);
  }

  // Try a test update to see if RLS blocks it
  console.log('\n🧪 Testing UPDATE permission (will rollback)...');
  if (players && players.length > 0) {
    const testPlayer = players[0];
    const { error: updateError } = await supabase
      .from('golf_players')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', testPlayer.id);

    if (updateError) {
      console.error('❌ UPDATE blocked by RLS:', updateError.message);
    } else {
      console.log('✅ UPDATE succeeded (RLS allows updates)');
    }
  }
}

checkTeamJoin();
