import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TEST_LOGIN_EMAIL = process.env.RLS_DIAGNOSTIC_TEST_EMAIL;
const TEST_LOGIN_PASSWORD = process.env.RLS_DIAGNOSTIC_TEST_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SUPABASE_ANON_KEY) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY. Set them in .env.local and run with `dotenv/config` or export them in your shell.'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  if (!TEST_LOGIN_EMAIL || !TEST_LOGIN_PASSWORD) {
    console.log('\n8. Sign in as player: SKIPPED (set RLS_DIAGNOSTIC_TEST_EMAIL / RLS_DIAGNOSTIC_TEST_PASSWORD to run this step)');
    return;
  }

  // Sign in as the test player
  const { error: signInErr } = await anonClient.auth.signInWithPassword({
    email: TEST_LOGIN_EMAIL,
    password: TEST_LOGIN_PASSWORD
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
