import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
)

async function testCoachQuery() {
  console.log('=== Testing Golf Coach Query ===\n')

  // This mimics the query from golf.ts:974
  const { data, error } = await supabase
    .from('golf_coaches')
    .select('id, team_id, team:golf_teams(name, invite_code)')
    .limit(1)

  if (error) {
    console.log('❌ Query failed:', error.message)
    console.log('   Code:', error.code)
    console.log('   Hint:', error.hint || 'N/A')
    console.log('   Details:', error.details || 'N/A')
  } else {
    console.log('✅ Query succeeded!')
    console.log('   Data:', JSON.stringify(data, null, 2))
  }

  console.log('\n=== Testing Golf Player Query ===\n')

  const { data: playerData, error: playerError } = await supabase
    .from('golf_players')
    .select('id, team_id, team:golf_teams(name)')
    .limit(1)

  if (playerError) {
    console.log('❌ Query failed:', playerError.message)
    console.log('   Code:', playerError.code)
  } else {
    console.log('✅ Query succeeded!')
    console.log('   Data:', JSON.stringify(playerData, null, 2))
  }
}

testCoachQuery().then(() => process.exit(0))
