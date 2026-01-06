import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUserStats() {
  console.log('Checking user: rinin376@gmail.com\n');

  // 1. Find user in auth.users
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
  const user = authUsers?.users.find(u => u.email === 'rinin376@gmail.com');

  if (!user) {
    console.log('❌ User not found in auth.users');
    return;
  }

  console.log('✅ User found:', user.id, user.email);

  // 2. Find player record
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (playerError || !player) {
    console.log('❌ Player record not found:', playerError?.message);
    return;
  }

  console.log('✅ Player record found:', player.id, player.first_name, player.last_name);
  console.log('   Team ID:', player.team_id);

  // 3. Check all rounds (both completed and in-progress)
  const { data: allRounds, error: roundsError } = await supabase
    .from('golf_rounds')
    .select('id, status, round_date, course_name, total_score, total_to_par, current_hole, holes_to_play')
    .eq('player_id', player.id)
    .order('round_date', { ascending: false });

  console.log('\n📊 ROUNDS SUMMARY:');
  console.log('Total rounds:', allRounds?.length || 0);

  if (allRounds && allRounds.length > 0) {
    const completed = allRounds.filter(r => r.status === 'completed');
    const inProgress = allRounds.filter(r => r.status === 'in_progress');

    console.log('  - Completed:', completed.length);
    console.log('  - In Progress:', inProgress.length);

    console.log('\nCompleted Rounds:');
    completed.forEach(r => {
      console.log(`  ${r.round_date} - ${r.course_name}: ${r.total_score} (${r.total_to_par >= 0 ? '+' : ''}${r.total_to_par})`);
    });

    console.log('\nIn-Progress Rounds:');
    inProgress.forEach(r => {
      console.log(`  ${r.round_date} - ${r.course_name}: Hole ${r.current_hole}/${r.holes_to_play}`);
    });
  } else {
    console.log('❌ No rounds found');
  }

  // 4. Check RLS policies
  console.log('\n🔒 RLS CHECK:');
  const { data: testQuery, error: rlsError } = await supabase
    .from('golf_rounds')
    .select('id')
    .eq('player_id', player.id)
    .limit(1);

  if (rlsError) {
    console.log('❌ RLS Error:', rlsError.message);
  } else {
    console.log('✅ RLS allows access to rounds');
  }
}

checkUserStats().catch(console.error);
