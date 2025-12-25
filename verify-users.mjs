import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyUsers() {
  console.log('\n=== DETAILED USER VERIFICATION ===\n');

  // Check auth.users table
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();

  if (authError) {
    console.error('Error fetching auth users:', authError);
  } else {
    const targetUsers = authUsers.users.filter(u =>
      u.email === 'bpotts821@gmail.com' || u.email === 'rinin376@gmail.com'
    );

    console.log('AUTH USERS:');
    targetUsers.forEach(user => {
      console.log(`\n${user.email}:`);
      console.log(`  Auth ID: ${user.id}`);
      console.log(`  Created: ${user.created_at}`);
      console.log(`  Last Sign In: ${user.last_sign_in_at}`);
    });
  }

  // Check public.users table
  const { data: publicUsers, error: publicError } = await supabase
    .from('users')
    .select('*')
    .in('email', ['bpotts821@gmail.com', 'rinin376@gmail.com']);

  console.log('\n\nPUBLIC.USERS TABLE:');
  publicUsers?.forEach(user => {
    console.log(`\n${user.email}:`);
    console.log(`  User ID: ${user.id}`);
    console.log(`  Role: ${user.role}`);
    console.log(`  Created: ${user.created_at}`);
  });

  // Check ALL golf-related tables for bpotts821@gmail.com
  const bpottsUser = publicUsers?.find(u => u.email === 'bpotts821@gmail.com');

  if (bpottsUser) {
    console.log(`\n\n=== CHECKING ALL GOLF RECORDS FOR bpotts821@gmail.com (ID: ${bpottsUser.id}) ===\n`);

    // Check golf_players
    const { data: golfPlayer, error: gpError } = await supabase
      .from('golf_players')
      .select('*')
      .eq('user_id', bpottsUser.id);

    console.log('golf_players:', golfPlayer?.length || 0, 'records');
    if (golfPlayer?.length) {
      console.log('  Player ID:', golfPlayer[0].id);
      console.log('  Name:', golfPlayer[0].first_name, golfPlayer[0].last_name);
    }

    // Check golf_coaches
    const { data: golfCoach, error: gcError } = await supabase
      .from('golf_coaches')
      .select('*')
      .eq('user_id', bpottsUser.id);

    console.log('golf_coaches:', golfCoach?.length || 0, 'records');
    if (golfCoach?.length) {
      console.log('  Coach ID:', golfCoach[0].id);
      console.log('  Name:', golfCoach[0].first_name, golfCoach[0].last_name);
    }

    // Check golf_rounds (if they have a player record)
    if (golfPlayer?.length) {
      const { data: rounds, error: roundsError } = await supabase
        .from('golf_rounds')
        .select('*')
        .eq('player_id', golfPlayer[0].id);

      console.log('golf_rounds:', rounds?.length || 0, 'records');
      if (rounds?.length) {
        rounds.forEach(r => {
          console.log(`  Round: ${r.course_name} on ${r.round_date}`);
        });
      }
    }
  }

  // Same for rinin376@gmail.com
  const rininUser = publicUsers?.find(u => u.email === 'rinin376@gmail.com');

  if (rininUser) {
    console.log(`\n\n=== CHECKING ALL GOLF RECORDS FOR rinin376@gmail.com (ID: ${rininUser.id}) ===\n`);

    const { data: golfPlayer, error: gpError } = await supabase
      .from('golf_players')
      .select('*')
      .eq('user_id', rininUser.id);

    console.log('golf_players:', golfPlayer?.length || 0, 'records');
    if (golfPlayer?.length) {
      console.log('  Player ID:', golfPlayer[0].id);
      console.log('  Name:', golfPlayer[0].first_name, golfPlayer[0].last_name);

      // Get rounds for this player
      const { data: rounds, error: roundsError } = await supabase
        .from('golf_rounds')
        .select('*')
        .eq('player_id', golfPlayer[0].id);

      console.log('golf_rounds:', rounds?.length || 0, 'records');
      if (rounds?.length) {
        rounds.forEach(r => {
          console.log(`  Round: ${r.course_name} on ${r.round_date}`);
        });
      }
    }
  }

  console.log('\n\n=== CONCLUSION ===');
  console.log('bpotts821@gmail.com can save rounds:', bpottsUser && golfPlayer?.length > 0 ? 'YES' : 'NO');
  console.log('rinin376@gmail.com can save rounds:', rininUser && publicUsers?.find(u => u.email === 'rinin376@gmail.com') ? 'YES' : 'NO');
}

verifyUsers().catch(console.error);
