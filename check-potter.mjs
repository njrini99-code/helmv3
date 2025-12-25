import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPotter() {
  const email = 'potter21@icloud.com';

  console.log(`\n=== CHECKING ${email} ===\n`);

  // Check users table
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (userError) {
    console.error('❌ User not found in users table:', userError.message);

    // Check auth.users
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const authUser = authUsers.users.find(u => u.email === email);

    if (authUser) {
      console.log('\n✓ Found in auth.users:');
      console.log(`  Auth ID: ${authUser.id}`);
      console.log(`  Email: ${authUser.email}`);
      console.log(`  Created: ${authUser.created_at}`);
      console.log('\n❌ BUT missing from public.users table - this is the problem!');
    } else {
      console.log('❌ Not found in auth.users either - user does not exist');
    }
    return;
  }

  console.log('✓ User found in users table:');
  console.log(`  ID: ${user.id}`);
  console.log(`  Email: ${user.email}`);
  console.log(`  Role: ${user.role}`);
  console.log(`  Created: ${user.created_at}`);

  // Check golf_players
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (playerError) {
    console.log('\n❌ No golf_players record found');
    console.log('   This is why they cannot save rounds!');
  } else {
    console.log('\n✓ Golf player record found:');
    console.log(`  Player ID: ${player.id}`);
    console.log(`  Name: ${player.first_name} ${player.last_name}`);
  }

  // Check golf_coaches
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!coachError && coach) {
    console.log('\n✓ Golf coach record found:');
    console.log(`  Coach ID: ${coach.id}`);
    console.log(`  Name: ${coach.first_name} ${coach.last_name}`);
  }

  // Check rounds
  if (player) {
    const { data: rounds, error: roundsError } = await supabase
      .from('golf_rounds')
      .select('*')
      .eq('player_id', player.id);

    console.log(`\nGolf rounds: ${rounds?.length || 0}`);
    if (rounds?.length) {
      rounds.forEach(r => {
        console.log(`  - ${r.course_name} on ${r.round_date}`);
      });
    }
  }

  console.log('\n=== DIAGNOSIS ===');
  if (!user) {
    console.log('❌ User record missing - signup issue');
  } else if (user.role !== 'player') {
    console.log(`❌ Role is "${user.role}" instead of "player"`);
  } else if (!player) {
    console.log('❌ Missing golf_players record - cannot save rounds');
  } else {
    console.log('✓ Everything looks good - should be able to save rounds');
  }
}

checkPotter().catch(console.error);
