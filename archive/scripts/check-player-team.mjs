import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPlayerTeam() {
  const { data: user } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', 'rinin376@gmail.com')
    .single();

  console.log('\n=== USER ===');
  console.log(user);

  if (!user) {
    console.log('User not found');
    return;
  }

  const { data: player, error } = await supabase
    .from('golf_players')
    .select('id, team_id, first_name, last_name, user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  console.log('\n=== GOLF PLAYER ===');
  if (error) {
    console.error('Error:', error.message);
  } else if (!player) {
    console.log('❌ No player record found');
  } else {
    console.log(player);

    if (!player.team_id) {
      console.log('\n⚠️  Player has NO team_id! You need to join a team first.');
    } else {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id, name')
        .eq('id', player.team_id)
        .single();

      console.log('\n=== PLAYER\'S TEAM ===');
      console.log(team);
      console.log('\n✅ Player is on a team and can create calendar events!');
    }
  }
}

checkPlayerTeam();
