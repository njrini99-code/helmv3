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

  // Get coach profile with ALL columns
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('*')
    .eq('user_id', users.id)
    .single();

  console.log('\n=== GOLF COACH (FULL) ===');
  if (coachError) {
    console.error('Error:', coachError.message);
  } else {
    console.log(coach);
  }

  // Check all golf teams
  const { data: allTeams, error: teamsError } = await supabase
    .from('golf_teams')
    .select('id, name, organization_id');

  console.log('\n=== ALL GOLF TEAMS ===');
  if (teamsError) {
    console.error('Error:', teamsError.message);
  } else {
    console.log(allTeams);
  }
}

checkCoachProfile();
