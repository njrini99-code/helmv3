#!/usr/bin/env node
/**
 * Assign demo coach to the player's team
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('🔧 ASSIGNING COACH TO PLAYER TEAM\n');
console.log('='.repeat(80));

// Get player's team
const { data: player, error: playerError } = await supabase
  .from('golf_players')
  .select('id, team_id, first_name, last_name, email')
  .eq('email', 'rinin376@gmail.com')
  .single();

if (playerError || !player) {
  console.log('❌ Player not found');
  process.exit(1);
}

console.log('\n👤 Player:', player.first_name, player.last_name);
console.log('   Team ID:', player.team_id);

if (!player.team_id) {
  console.log('❌ Player is not on a team!');
  process.exit(1);
}

// Get demo coach
const { data: coach, error: coachError } = await supabase
  .from('golf_coaches')
  .select('id, full_name, team_id, email')
  .eq('email', 'demo.coach@helmgolf.com')
  .single();

if (coachError || !coach) {
  console.log('❌ Demo coach not found');
  process.exit(1);
}

console.log('\n👨‍🏫 Coach:', coach.full_name);
console.log('   Current Team ID:', coach.team_id);
console.log('   Target Team ID:', player.team_id);

if (coach.team_id === player.team_id) {
  console.log('\n✅ Coach is already on the player\'s team!');
  process.exit(0);
}

// Update coach to player's team
console.log('\n🔄 Updating coach team assignment...');

const { error: updateError } = await supabase
  .from('golf_coaches')
  .update({ team_id: player.team_id })
  .eq('id', coach.id);

if (updateError) {
  console.log('❌ Failed to update coach:', updateError.message);
  process.exit(1);
}

console.log('✅ Coach successfully assigned to player\'s team!');

// Verify
const { data: verifyCoach } = await supabase
  .from('golf_coaches')
  .select('id, full_name, team_id')
  .eq('id', coach.id)
  .single();

console.log('\n📋 Verification:');
console.log('   Coach:', verifyCoach.full_name);
console.log('   Team ID:', verifyCoach.team_id);
console.log('   Match:', verifyCoach.team_id === player.team_id ? '✅ YES' : '❌ NO');

console.log('\n' + '='.repeat(80));
console.log('✅ DONE! Now try uploading your class schedule again.');
console.log('   The calendar sync should work now.');
console.log();
