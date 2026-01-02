import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
)

async function checkAccount() {
  console.log('=== Checking Current User Accounts ===\n')

  // Check all users
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, role')
    .order('created_at', { ascending: false })
    .limit(5)

  if (usersError) {
    console.log('❌ Error fetching users:', usersError.message)
  } else {
    console.log('Recent users:')
    users?.forEach(u => console.log(`  - ${u.email}: ${u.role} (${u.id})`))
  }

  console.log('\n=== Golf Coaches ===\n')
  const { data: coaches, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, user_id, full_name, team_id, organization_id, onboarding_completed')

  if (coachError) {
    console.log('❌ Error:', coachError.message)
  } else {
    coaches?.forEach(c => {
      console.log(`Coach: ${c.full_name}`)
      console.log(`  - user_id: ${c.user_id}`)
      console.log(`  - team_id: ${c.team_id || 'NULL (not on a team)'}`)
      console.log(`  - organization_id: ${c.organization_id || 'NULL'}`)
      console.log(`  - onboarding_completed: ${c.onboarding_completed}`)
    })
  }

  console.log('\n=== Golf Players ===\n')
  const { data: players, error: playerError } = await supabase
    .from('golf_players')
    .select('id, user_id, first_name, last_name')

  if (playerError) {
    console.log('❌ Error:', playerError.message)
  } else if (players && players.length > 0) {
    players?.forEach(p => {
      console.log(`Player: ${p.first_name} ${p.last_name}`)
      console.log(`  - user_id: ${p.user_id}`)
      console.log(`  - team_id: NOT AVAILABLE (column missing!)`)
    })
  } else {
    console.log('No golf players found')
  }

  console.log('\n=== Golf Teams ===\n')
  const { data: teams, error: teamError } = await supabase
    .from('golf_teams')
    .select('id, name, organization_id')

  if (teamError) {
    console.log('❌ Error:', teamError.message)
  } else if (teams && teams.length > 0) {
    teams?.forEach(t => {
      console.log(`Team: ${t.name}`)
      console.log(`  - id: ${t.id}`)
      console.log(`  - organization_id: ${t.organization_id || 'NULL'}`)
    })
  } else {
    console.log('No teams found')
  }
}

checkAccount().then(() => process.exit(0))
