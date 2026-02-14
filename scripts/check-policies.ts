import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qmnssrrolpinvwjjnufo.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtbnNzcnJvbHBpbnZ3ampudWZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODMyNjg0MCwiZXhwIjoyMDgzOTAyODQwfQ.pW8-66rT0Y3LXcPYSXMPqj0_y0K_AYnPj22nXjdMU6I'
);

async function checkPolicies() {
  // Query pg_policies for golf_team_members
  const { data, error } = await supabase
    .rpc('admin_get_policies', { table_name: 'golf_team_members' });
  
  if (error) {
    console.log('No admin_get_policies function, trying raw query...');
    
    // Try querying information_schema
    const { data: policies, error: pErr } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'golf_team_members');
    
    if (pErr) {
      console.log('Cannot query pg_policies directly:', pErr.message);
      
      // Last resort - check what functions exist
      console.log('\nChecking helper functions...');
      
      // Check if functions exist and their definitions
      const functions = [
        'get_current_golf_player_id',
        'is_golf_team_player', 
        'is_golf_team_coach',
        'user_is_golf_team_member',
        'user_is_coach_of_golf_player'
      ];

      for (const fn of functions) {
        const { data: fnData, error: fnErr } = await supabase.rpc(fn as any, 
          fn.includes('team') ? { team_uuid: '6ecdd1a6-63fe-4beb-b094-00118f334163' } :
          fn.includes('check_team') ? { check_team_id: '6ecdd1a6-63fe-4beb-b094-00118f334163' } :
          fn.includes('player') && fn.includes('coach') ? { check_player_id: '49ffe06d-9b22-4f2f-8c69-f56badbbde6b' } :
          {}
        ).catch(() => ({ data: null, error: { message: 'call failed' } }));
        
        console.log(`  ${fn}:`, fnErr ? `ERROR - ${fnErr.message}` : fnData);
      }
    } else {
      console.log('Policies:', JSON.stringify(policies, null, 2));
    }
  } else {
    console.log('Policies:', JSON.stringify(data, null, 2));
  }

  // Check pg_proc for function definitions
  console.log('\nChecking if SECURITY DEFINER functions exist...');
  
  // We can check by seeing if the functions work with service role
  const testTeamId = '6ecdd1a6-63fe-4beb-b094-00118f334163';
  const testPlayerId = '49ffe06d-9b22-4f2f-8c69-f56badbbde6b';

  // These should work even without a user context if they're SECURITY DEFINER
  // But they check auth.uid() internally, so they'll return null/false with service role
  
  console.log('\nDirect table query test (service role):');
  const { data: members } = await supabase
    .from('golf_team_members')
    .select('id, team_id, player_id, status')
    .limit(5);
  console.log('  golf_team_members rows:', members?.length);

  const { data: players } = await supabase
    .from('golf_players')
    .select('id, user_id, first_name')
    .limit(5);
  console.log('  golf_players rows:', players?.length);
}

checkPolicies().catch(console.error);
