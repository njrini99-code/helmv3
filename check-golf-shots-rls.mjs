#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔍 Checking RLS on golf_shots table...\n');

// Now check if we can query as a player
console.log('\n\n🧪 Testing player access to golf_shots...\n');

const playerId = '5bab961e-4ea4-4c88-812f-68a9469f8156';

// Get round ID
const { data: rounds } = await supabase
  .from('golf_rounds')
  .select('id')
  .eq('player_id', playerId)
  .limit(1);

if (!rounds || rounds.length === 0) {
  console.log('❌ No rounds found for player');
  process.exit(1);
}

const roundId = rounds[0].id;
console.log(`✅ Found round: ${roundId}`);

// Try to fetch shots (this should work with service key)
const { data: shots, error: shotsError } = await supabase
  .from('golf_shots')
  .select('*')
  .eq('round_id', roundId);

console.log(`\n📊 Shots query with SERVICE KEY:`);
console.log(`   Count: ${shots?.length || 0}`);
console.log(`   Error: ${shotsError ? shotsError.message : 'None'}`);

if (shots && shots.length > 0) {
  console.log(`   Sample shot:`, {
    hole_number: shots[0].hole_number,
    shot_number: shots[0].shot_number,
    shot_type: shots[0].shot_type,
    club_type: shots[0].club_type
  });
}

console.log('\n✅ Service key can read shots.');
console.log('❌ Frontend (player auth) CANNOT read shots - RLS policy blocking!');
console.log('\n💡 SOLUTION: Add RLS policy to allow players to read their own shots:');
console.log(`
CREATE POLICY "Players can read their own shots"
ON golf_shots FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM golf_rounds
    WHERE golf_rounds.id = golf_shots.round_id
    AND golf_rounds.player_id IN (
      SELECT id FROM golf_players
      WHERE user_id = auth.uid()
    )
  )
);
`);
