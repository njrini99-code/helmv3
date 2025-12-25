import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MzA4NjgsImV4cCI6MjA4MTUwNjg2OH0.CPpPgG_EEXvu5eaSaDD-FPSVXcNTPlA5VS9W5tcX5Ck';

// Create client with ANON key (simulates frontend)
const supabase = createClient(supabaseUrl, anonKey);

async function testRoundAnon() {
  console.log('=== TESTING WITH ANON KEY (Frontend Simulation) ===\n');

  // First, sign in as potter21@icloud.com
  // We need their password - let's try to check if they can auth at all

  console.log('Note: This test uses ANON key instead of SERVICE_ROLE key');
  console.log('This simulates what happens when the frontend tries to insert a round\n');

  // Get user ID from auth (we need them to be signed in)
  const userId = '01fae126-0ac4-440e-8526-89f5b84691e2'; // potter21@icloud.com

  // Try to get player record using anon key
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (playerError) {
    console.error('❌ Cannot read golf_players with anon key:', playerError.message);
    console.log('\nPossible RLS issue: anon users cannot read golf_players table');
    return;
  }

  console.log('✓ Can read golf_players with anon key');
  console.log('Player ID:', player.id);

  // Try to insert a round using anon key (WITHOUT being authenticated)
  console.log('\nAttempting to insert round WITHOUT authentication...');

  const testRound = {
    player_id: player.id,
    course_name: 'Test Course Anon',
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
    console.error('❌ FAILED TO INSERT ROUND WITH ANON KEY:');
    console.error('Error code:', roundError.code);
    console.error('Error message:', roundError.message);
    console.error('\n🔍 DIAGNOSIS: RLS policy is blocking INSERT');
    console.log('The user needs to be authenticated AND the RLS policy needs to allow INSERT');
    return;
  }

  console.log('✅ Round inserted successfully with anon key!');
  console.log('Round ID:', round.id);

  // Clean up
  await supabase.from('golf_rounds').delete().eq('id', round.id);
}

testRoundAnon().catch(console.error);
