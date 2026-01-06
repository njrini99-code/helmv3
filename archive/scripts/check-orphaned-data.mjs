import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOrphanedData() {
  // Get player
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  const user = authUsers?.users.find(u => u.email === 'rinin376@gmail.com');

  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  console.log('Player ID:', player.id);
  console.log('\n🔍 Checking for orphaned/partial data...\n');

  // Check golf_holes (these should only exist if rounds exist)
  const { data: holes } = await supabase
    .from('golf_holes')
    .select('round_id, hole_number')
    .order('round_id');

  if (holes && holes.length > 0) {
    console.log('Found holes:', holes.length);

    // Check if any rounds exist for these holes
    const roundIds = [...new Set(holes.map(h => h.round_id))];
    const { data: rounds } = await supabase
      .from('golf_rounds')
      .select('id, player_id')
      .in('id', roundIds);

    console.log('Rounds for these holes:', rounds?.length || 0);

    const playerRounds = rounds?.filter(r => r.player_id === player.id);
    console.log('Player rounds:', playerRounds?.length || 0);
  } else {
    console.log('✅ No orphaned holes');
  }

  // Check golf_shots
  const { data: shots } = await supabase
    .from('golf_shots')
    .select('round_id')
    .order('round_id');

  if (shots && shots.length > 0) {
    console.log('\nFound shots:', shots.length);

    const roundIds = [...new Set(shots.map(s => s.round_id))];
    const { data: rounds } = await supabase
      .from('golf_rounds')
      .select('id, player_id')
      .in('id', roundIds);

    const playerRounds = rounds?.filter(r => r.player_id === player.id);
    console.log('Player rounds with shots:', playerRounds?.length || 0);
  } else {
    console.log('\n✅ No orphaned shots');
  }

  // Check if migrations ran properly
  console.log('\n🔧 Checking migration status...\n');

  const { data: migrations } = await supabase
    .from('golf_rounds')
    .select('status')
    .limit(1);

  if (migrations) {
    console.log('✅ Migration 080 (status column) applied successfully');
  } else {
    console.log('⚠️ Check if status column exists');
  }
}

checkOrphanedData().catch(console.error);
