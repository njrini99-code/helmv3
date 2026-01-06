import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function investigateOrphanedHoles() {
  console.log('🔍 INVESTIGATING ORPHANED HOLES\n');

  // Get all holes
  const { data: allHoles } = await supabase
    .from('golf_holes')
    .select('*')
    .order('created_at', { ascending: false });

  console.log('Total holes in database:', allHoles?.length || 0);

  if (!allHoles || allHoles.length === 0) {
    console.log('No holes found');
    return;
  }

  // Group by round_id
  const holesByRound = allHoles.reduce((acc, hole) => {
    if (!acc[hole.round_id]) acc[hole.round_id] = [];
    acc[hole.round_id].push(hole);
    return acc;
  }, {});

  console.log('Unique round IDs:', Object.keys(holesByRound).length);

  for (const [roundId, holes] of Object.entries(holesByRound)) {
    console.log(`\n📍 Round ID: ${roundId}`);
    console.log(`   Holes: ${holes.length}`);
    console.log(`   Created: ${holes[0].created_at}`);

    // Check if round exists
    const { data: round } = await supabase
      .from('golf_rounds')
      .select('*')
      .eq('id', roundId)
      .single();

    if (round) {
      console.log(`   ✅ Round EXISTS`);
      console.log(`      Player: ${round.player_id}`);
      console.log(`      Course: ${round.course_name}`);
      console.log(`      Status: ${round.status}`);
    } else {
      console.log(`   ❌ Round DELETED (orphaned holes)`);

      // Show hole details
      console.log(`   Hole numbers:`, holes.map(h => h.hole_number).sort((a, b) => a - b).join(', '));

      // Check if there are shots
      const { data: shots } = await supabase
        .from('golf_shots')
        .select('id')
        .eq('round_id', roundId);

      console.log(`   Shots: ${shots?.length || 0}`);

      // This is likely Nick's deleted round!
      console.log('\n   💡 This is likely the deleted round!');
      console.log('   Recommendation: Clean up orphaned data');
    }
  }

  // Check golf_shots too
  console.log('\n🔍 Checking shots...\n');
  const { data: allShots } = await supabase
    .from('golf_shots')
    .select('round_id')
    .limit(100);

  if (allShots && allShots.length > 0) {
    const shotRoundIds = [...new Set(allShots.map(s => s.round_id))];
    console.log('Shots found for', shotRoundIds.length, 'round IDs');

    for (const roundId of shotRoundIds) {
      const { data: round } = await supabase
        .from('golf_rounds')
        .select('id')
        .eq('id', roundId)
        .single();

      if (!round) {
        const { data: shots } = await supabase
          .from('golf_shots')
          .select('id')
          .eq('round_id', roundId);

        console.log(`   ❌ Orphaned shots for round ${roundId}: ${shots?.length || 0} shots`);
      }
    }
  }
}

investigateOrphanedHoles().catch(console.error);
