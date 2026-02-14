import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qmnssrrolpinvwjjnufo.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtbnNzcnJvbHBpbnZ3ampudWZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODMyNjg0MCwiZXhwIjoyMDgzOTAyODQwfQ.pW8-66rT0Y3LXcPYSXMPqj0_y0K_AYnPj22nXjdMU6I'
);

async function checkRLS() {
  const testPlayerUserId = '7f13c6f0-e097-4e2d-b881-70f7712a093e';
  const testPlayerId = '49ffe06d-9b22-4f2f-8c69-f56badbbde6b';

  // 1. Check user exists
  const { data: userData } = await supabase.auth.admin.getUserById(testPlayerUserId);
  console.log('1. User email:', userData?.user?.email);

  // 2. Check golf_players record
  const { data: player, error: playerErr } = await supabase
    .from('golf_players')
    .select('*')
    .eq('id', testPlayerId)
    .single();
  console.log('\n2. golf_players record:', player ? 'EXISTS' : 'MISSING', playerErr?.message || '');

  // 3. Check golf_team_members record (service role bypasses RLS)
  const { data: membership, error: memberErr } = await supabase
    .from('golf_team_members')
    .select('*')
    .eq('player_id', testPlayerId);
  console.log('\n3. golf_team_members (service role):', membership?.length, 'records');
  console.log('   Status:', membership?.[0]?.status);
  console.log('   Team ID:', membership?.[0]?.team_id);

  // 4. Check the team exists
  if (membership?.[0]?.team_id) {
    const { data: team } = await supabase
      .from('golf_teams')
      .select('*')
      .eq('id', membership[0].team_id)
      .single();
    console.log('\n4. golf_teams record:', team?.name || 'MISSING');
  }

  // 5. Check what helper functions return
  const { data: fnResult, error: fnErr } = await supabase.rpc('get_current_golf_player_id');
  console.log('\n5. get_current_golf_player_id():', fnResult, fnErr?.message || '');

  // 6. Check is_golf_team_player function
  if (membership?.[0]?.team_id) {
    const { data: isPlayer, error: isPlayerErr } = await supabase.rpc('is_golf_team_player', {
      team_uuid: membership[0].team_id
    });
    console.log('\n6. is_golf_team_player():', isPlayer, isPlayerErr?.message || '');
  }

  // 7. Check user_is_golf_team_member function
  if (membership?.[0]?.team_id) {
    const { data: isMember, error: isMemberErr } = await supabase.rpc('user_is_golf_team_member', {
      check_team_id: membership[0].team_id
    });
    console.log('\n7. user_is_golf_team_member():', isMember, isMemberErr?.message || '');
  }

  // 8. Try to query golf_team_members as the player would
  // Simulate RLS by using anon key with a specific user context
  const anonClient = createClient(
    'https://qmnssrrolpinvwjjnufo.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtbnNzcnJvbHBpbnZ3ampudWZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMjY4NDAsImV4cCI6MjA4MzkwMjg0MH0.5CVd_a4BTOXsvone_Zz76RBITMNuk73JYM-SMfZmIPc'
  );

  // Sign in as the test player
  const { error: signInErr } = await anonClient.auth.signInWithPassword({
    email: 'rinin376@gmail.com',
    password: 'Pirates#09!!!'
  });
  console.log('\n8. Sign in as player:', signInErr ? `ERROR: ${signInErr.message}` : 'SUCCESS');

  if (!signInErr) {
    // Now query golf_team_members with RLS
    const { data: rlsData, error: rlsErr } = await anonClient
      .from('golf_team_members')
      .select('*')
      .eq('player_id', testPlayerId);
    
    console.log('\n9. golf_team_members with RLS:');
    console.log('   Data:', rlsData?.length, 'records');
    console.log('   Error:', rlsErr?.message || 'none');
    if (rlsErr?.message?.includes('recursion')) {
      console.log('\n   ⚠️  INFINITE RECURSION DETECTED IN RLS POLICY');
    }
  }
}

checkRLS().catch(console.error);
