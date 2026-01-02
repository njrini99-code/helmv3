#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const playerId = '5bab961e-4ea4-4c88-812f-68a9469f8156';

console.log('🗑️  Deleting test rounds for rinin376@gmail.com...\n');

// Get all rounds for this player
const { data: rounds } = await supabase
  .from('golf_rounds')
  .select('id, course_name, round_date')
  .eq('player_id', playerId);

if (!rounds || rounds.length === 0) {
  console.log('No rounds found to delete.');
  process.exit(0);
}

console.log(`Found ${rounds.length} round(s):`);
rounds.forEach(r => console.log(`  - ${r.course_name} on ${r.round_date}`));

// Delete all rounds (cascades to holes and shots)
const { error } = await supabase
  .from('golf_rounds')
  .delete()
  .eq('player_id', playerId);

if (error) {
  console.error('❌ Error deleting rounds:', error);
  process.exit(1);
}

console.log('\n✅ All test rounds deleted!');
