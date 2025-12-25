import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUsers() {
  console.log('\n=== CHECKING USERS ===\n');

  // Get both users
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('*')
    .in('email', ['bpotts821@gmail.com', 'rinin376@gmail.com']);

  if (usersError) {
    console.error('Error fetching users:', usersError);
    return;
  }

  console.log('Users found:', users.length);
  users.forEach(user => {
    console.log(`\n${user.email}:`);
    console.log(`  ID: ${user.id}`);
    console.log(`  Role: ${user.role}`);
    console.log(`  Created: ${user.created_at}`);
  });

  // Get golf players for both users
  console.log('\n=== GOLF PLAYERS ===\n');
  const userIds = users.map(u => u.id);

  const { data: players, error: playersError } = await supabase
    .from('golf_players')
    .select('*')
    .in('user_id', userIds);

  if (playersError) {
    console.error('Error fetching players:', playersError);
    return;
  }

  console.log('Golf players found:', players?.length || 0);
  players?.forEach(player => {
    const user = users.find(u => u.id === player.user_id);
    console.log(`\n${user?.email}:`);
    console.log(`  Player ID: ${player.id}`);
    console.log(`  Name: ${player.first_name} ${player.last_name}`);
    console.log(`  Organization ID: ${player.organization_id}`);
  });

  // Get rounds for both players
  console.log('\n=== GOLF ROUNDS ===\n');
  const playerIds = players?.map(p => p.id) || [];

  const { data: rounds, error: roundsError } = await supabase
    .from('golf_rounds')
    .select('*')
    .in('player_id', playerIds)
    .order('created_at', { ascending: false });

  if (roundsError) {
    console.error('Error fetching rounds:', roundsError);
    return;
  }

  console.log('Rounds found:', rounds?.length || 0);
  rounds?.forEach(round => {
    const player = players?.find(p => p.id === round.player_id);
    const user = users.find(u => u.id === player?.user_id);
    console.log(`\n${user?.email}:`);
    console.log(`  Round ID: ${round.id}`);
    console.log(`  Course: ${round.course_name}`);
    console.log(`  Date: ${round.round_date}`);
    console.log(`  Created: ${round.created_at}`);
  });

  // Check organizations
  console.log('\n=== ORGANIZATIONS ===\n');
  const orgIds = players?.map(p => p.organization_id).filter(Boolean) || [];

  if (orgIds.length > 0) {
    const { data: orgs, error: orgsError } = await supabase
      .from('golf_organizations')
      .select('*')
      .in('id', orgIds);

    if (orgsError) {
      console.error('Error fetching organizations:', orgsError);
    } else {
      orgs?.forEach(org => {
        console.log(`\nOrganization ID: ${org.id}`);
        console.log(`  Name: ${org.name}`);
        console.log(`  Type: ${org.organization_type}`);
      });
    }
  } else {
    console.log('No organizations found for these players');
  }
}

checkUsers().catch(console.error);
