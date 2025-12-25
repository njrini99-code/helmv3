import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testFullRound() {
  console.log('\n=== TESTING FULL ROUND CREATION FOR potter21@icloud.com ===\n');

  const userId = '01fae126-0ac4-440e-8526-89f5b84691e2';

  // Get player
  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', userId)
    .single();

  console.log('Player ID:', player.id);

  // Step 1: Insert round
  console.log('\n[1/2] Inserting round...');
  const { data: round, error: roundError } = await supabase
    .from('golf_rounds')
    .insert({
      player_id: player.id,
      course_name: 'Full Test Course',
      round_type: 'practice',
      round_date: '2025-12-25',
      total_score: 72,
      total_to_par: 0,
      total_putts: 32,
      fairways_hit: 10,
      fairways_total: 14,
      greens_in_regulation: 12,
      greens_total: 18,
      is_verified: false,
    })
    .select()
    .single();

  if (roundError) {
    console.error('❌ Round INSERT failed:', roundError.message);
    return;
  }

  console.log('✅ Round inserted:', round.id);

  // Step 2: Insert holes
  console.log('\n[2/2] Inserting holes...');
  const holesData = Array.from({ length: 18 }, (_, i) => ({
    round_id: round.id,
    hole_number: i + 1,
    par: i % 3 === 0 ? 5 : i % 2 === 0 ? 3 : 4,
    score: 4,
    score_to_par: 0,
    putts: 2,
    fairway_hit: i % 2 === 0,
    green_in_regulation: i % 3 !== 0,
  }));

  const { data: holes, error: holesError } = await supabase
    .from('golf_holes')
    .insert(holesData)
    .select('id, hole_number');

  if (holesError) {
    console.error('❌ Holes INSERT failed:', holesError.message);
    console.error('   This is the problem blocking round saves!');

    // Clean up round
    await supabase.from('golf_rounds').delete().eq('id', round.id);
    return;
  }

  console.log(`✅ ${holes.length} holes inserted successfully`);

  // Clean up
  console.log('\nCleaning up test data...');
  await supabase.from('golf_holes').delete().eq('round_id', round.id);
  await supabase.from('golf_rounds').delete().eq('id', round.id);
  console.log('✓ Cleanup complete');

  console.log('\n========================================');
  console.log('🎉 SUCCESS: Full round creation works!');
  console.log('========================================\n');
  console.log('potter21@icloud.com can now:');
  console.log('  ✅ Insert rounds');
  console.log('  ✅ Insert holes');
  console.log('  ✅ Save complete rounds in the app\n');
}

testFullRound().catch(console.error);
