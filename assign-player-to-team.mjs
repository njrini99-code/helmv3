import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function assignPlayerToTeam() {
  // Get all available teams
  const { data: teams } = await supabase
    .from('golf_teams')
    .select('id, name, organization_id');

  console.log('\n=== AVAILABLE GOLF TEAMS ===');
  teams?.forEach((team, i) => {
    console.log(`[${i + 1}] ${team.name} (${team.id})`);
  });

  // Assign player to first team (or you can choose which one)
  const teamToJoin = teams?.[0]; // Change this index to choose a different team

  if (!teamToJoin) {
    console.log('\n❌ No teams available');
    return;
  }

  console.log(`\n📝 Assigning player to: ${teamToJoin.name}`);

  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', 'aa6746b8-2d05-4101-9bde-63ada5f186cf')
    .single();

  if (!player) {
    console.log('❌ Player not found');
    return;
  }

  // Update player's team_id
  const { error: updateError } = await supabase
    .from('golf_players')
    .update({ team_id: teamToJoin.id })
    .eq('id', player.id);

  if (updateError) {
    console.error('❌ Error updating player:', updateError);
  } else {
    console.log(`✅ Player successfully assigned to team: ${teamToJoin.name}`);
  }
}

assignPlayerToTeam();
