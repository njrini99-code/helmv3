#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const playerId = '5bab961e-4ea4-4c88-812f-68a9469f8156';

console.log('🔍 Verifying shot types...\n');

// Get the latest round
const { data: round } = await supabase
  .from('golf_rounds')
  .select('id')
  .eq('player_id', playerId)
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

if (!round) {
  console.log('No round found.');
  process.exit(0);
}

// Get sample shots
const { data: shots } = await supabase
  .from('golf_shots')
  .select('hole_number, shot_number, shot_type, club_type, lie_before, result')
  .eq('round_id', round.id)
  .order('hole_number')
  .order('shot_number')
  .limit(20);

console.log('Sample shots (first 20):');
console.table(shots);

// Count by shot_type
const { data: shotTypeCounts } = await supabase
  .from('golf_shots')
  .select('shot_type')
  .eq('round_id', round.id);

const counts = shotTypeCounts?.reduce((acc, s) => {
  acc[s.shot_type] = (acc[s.shot_type] || 0) + 1;
  return acc;
}, {});

console.log('\nShot Type Distribution:');
console.table(counts);

// Count by club_type
const { data: clubTypeCounts } = await supabase
  .from('golf_shots')
  .select('club_type')
  .eq('round_id', round.id);

const clubCounts = clubTypeCounts?.reduce((acc, s) => {
  acc[s.club_type] = (acc[s.club_type] || 0) + 1;
  return acc;
}, {});

console.log('\nClub Type Distribution:');
console.table(clubCounts);
