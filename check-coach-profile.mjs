import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCoachProfile() {
  // Get user
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', 'rinin376@gmail.com')
    .single();

  if (userError) {
    console.error('Error fetching user:', userError);
    return;
  }

  console.log('\n=== USER ===');
  console.log(users);

  // Get coach profile
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, user_id, team_id, first_name, last_name')
    .eq('user_id', users.id)
    .single();

  console.log('\n=== GOLF COACH ===');
  if (coachError) {
    console.error('Error:', coachError.message);
  } else {
    console.log(coach);
  }

  // Check if there's a team
  if (coach?.team_id) {
    const { data: team, error: teamError } = await supabase
      .from('golf_teams')
      .select('id, name, organization_id')
      .eq('id', coach.team_id)
      .single();

    console.log('\n=== GOLF TEAM ===');
    if (teamError) {
      console.error('Error:', teamError.message);
    } else {
      console.log(team);
    }
  } else {
    console.log('\n⚠️  Coach has NO team_id assigned!');
  }
}

checkCoachProfile();
