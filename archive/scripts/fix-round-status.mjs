import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixRoundStatus() {
  console.log('🔧 Fixing round status...\n');

  const roundId = 'cd4bbe87-f5c4-4835-adce-0d9d30ee70c5';

  // First, check current state
  const { data: before } = await supabase
    .from('golf_rounds')
    .select('*')
    .eq('id', roundId)
    .single();

  console.log('BEFORE:');
  console.log('  Round ID:', before.id);
  console.log('  Course:', before.course_name);
  console.log('  Status:', before.status);
  console.log('  Total Score:', before.total_score);
  console.log('  Total to Par:', before.total_to_par);

  // Update status to 'completed'
  const { data: updated, error } = await supabase
    .from('golf_rounds')
    .update({ status: 'completed' })
    .eq('id', roundId)
    .select()
    .single();

  if (error) {
    console.error('❌ Error updating:', error);
    return;
  }

  console.log('\nAFTER:');
  console.log('  ✅ Status updated to:', updated.status);

  // Verify it now shows up in queries
  const { data: verifyRounds, error: verifyError } = await supabase
    .from('golf_rounds')
    .select('id, course_name, total_score, status')
    .eq('player_id', before.player_id)
    .eq('status', 'completed');

  console.log('\nVERIFICATION - Query with status filter:');
  console.log('  Rounds found:', verifyRounds?.length || 0);
  if (verifyRounds && verifyRounds.length > 0) {
    verifyRounds.forEach(r => {
      console.log(`  - ${r.course_name}: ${r.total_score} (status: ${r.status})`);
    });
  }
}

fixRoundStatus().catch(console.error);
