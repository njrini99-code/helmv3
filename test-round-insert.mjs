import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRoundInsert() {
  const email = 'potter21@icloud.com';

  console.log(`\n=== TESTING ROUND INSERT FOR ${email} ===\n`);

  // Get the player
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  console.log('Player ID:', player.id);

  // Try to insert a test round
  console.log('\nAttempting to insert test round...');

  const testRound = {
    player_id: player.id,
    course_name: 'Test Course',
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
  };

  const { data: round, error: roundError } = await supabase
    .from('golf_rounds')
    .insert(testRound)
    .select()
    .single();

  if (roundError) {
    console.error('❌ FAILED TO INSERT ROUND:');
    console.error('Error code:', roundError.code);
    console.error('Error message:', roundError.message);
    console.error('Error details:', roundError.details);
    console.error('Error hint:', roundError.hint);
    return;
  }

  console.log('✅ Round inserted successfully!');
  console.log('Round ID:', round.id);
  console.log('Course:', round.course_name);
  console.log('Score:', round.total_score);

  // Clean up - delete the test round
  console.log('\nCleaning up test round...');
  await supabase.from('golf_rounds').delete().eq('id', round.id);
  console.log('✓ Test round deleted');
}

testRoundInsert().catch(console.error);
