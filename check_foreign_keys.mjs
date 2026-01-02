import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
)

async function checkForeignKeys() {
  console.log('=== Checking Foreign Key Constraints ===\n')

  // Check if we can query golf_players and golf_teams separately
  const { data: players, error: playersError } = await supabase
    .from('golf_players')
    .select('id, team_id')
    .limit(1)

  if (playersError) {
    console.log('❌ golf_players query failed:', playersError.message)
  } else {
    console.log('✅ golf_players table accessible')
    console.log('   Sample:', players)
  }

  const { data: teams, error: teamsError } = await supabase
    .from('golf_teams')
    .select('id, name')
    .limit(1)

  if (teamsError) {
    console.log('❌ golf_teams query failed:', teamsError.message)
  } else {
    console.log('✅ golf_teams table accessible')
    console.log('   Sample:', teams)
  }

  // Try the reverse join (from teams to players)
  console.log('\n=== Testing Reverse Join (teams -> players) ===\n')

  const { data: teamsWithPlayers, error: joinError } = await supabase
    .from('golf_teams')
    .select('id, name, golf_players(id, first_name, last_name)')
    .limit(1)

  if (joinError) {
    console.log('❌ Reverse join failed:', joinError.message)
    console.log('   Code:', joinError.code)
  } else {
    console.log('✅ Reverse join succeeded!')
    console.log('   Data:', JSON.stringify(teamsWithPlayers, null, 2))
  }
}

checkForeignKeys().then(() => process.exit(0))
