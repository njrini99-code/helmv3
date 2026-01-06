import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDeletedRounds() {
  // Get all golf players to see all rounds
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  const user = authUsers?.users.find(u => u.email === 'rinin376@gmail.com');

  console.log('User ID:', user.id);

  const { data: player } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name')
    .eq('user_id', user.id)
    .single();

  console.log('Player:', player.first_name, player.last_name, 'ID:', player.id);

  console.log('\n🔍 Checking all rounds in database...\n');

  // Get ALL rounds to see if any exist
  const { data: allRounds } = await supabase
    .from('golf_rounds')
    .select('id, player_id, course_name, round_date, status, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  console.log('Recent rounds in database (last 20):');
  if (allRounds && allRounds.length > 0) {
    allRounds.forEach(r => {
      const isPlayerRound = r.player_id === player.id;
      console.log(
        `${isPlayerRound ? '👤 YOUR ROUND:' : '  '} ${r.created_at} - ${r.course_name} - Status: ${r.status} - Player: ${r.player_id}`
      );
    });
  } else {
    console.log('❌ No rounds found in entire database');
  }

  // Check if there are any holes without rounds (orphaned)
  console.log('\n🔍 Checking for orphaned holes...\n');

  const { data: allHoles } = await supabase
    .from('golf_holes')
    .select('round_id')
    .limit(10);

  if (allHoles && allHoles.length > 0) {
    console.log('Found holes in database:', allHoles.length);

    // Check if rounds exist for these holes
    const roundIds = [...new Set(allHoles.map(h => h.round_id))];
    const { data: holesRounds } = await supabase
      .from('golf_rounds')
      .select('id, player_id')
      .in('id', roundIds);

    console.log('Rounds that exist for these holes:', holesRounds?.length || 0);

    // Check for orphaned holes (holes with no corresponding round)
    const existingRoundIds = new Set(holesRounds?.map(r => r.id) || []);
    const orphanedRoundIds = roundIds.filter(id => !existingRoundIds.has(id));

    if (orphanedRoundIds.length > 0) {
      console.log('\n⚠️  Found orphaned holes (no matching round):');
      console.log('Orphaned round IDs:', orphanedRoundIds);

      // Check if any are for this player
      const { data: orphanedHoles } = await supabase
        .from('golf_holes')
        .select('round_id, hole_number, par, score')
        .in('round_id', orphanedRoundIds);

      console.log('Orphaned holes details:', orphanedHoles);
    }
  } else {
    console.log('No holes in database');
  }

  // Check browser localStorage (can't access from Node, but suggest to user)
  console.log('\n💡 SUGGESTIONS:');
  console.log('1. Check browser localStorage for draft rounds:');
  console.log('   - Open DevTools → Application → Local Storage');
  console.log('   - Look for key: golf-round-draft');
  console.log('2. If you started a round but clicked "Exit" → "Delete", it was removed');
  console.log('3. Try creating a new round to test the flow');
}

checkDeletedRounds().catch(console.error);
