import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
)

async function checkTables() {
  console.log('=== Checking Golf Tables ===\n')

  const tables = ['golf_players', 'golf_coaches', 'golf_teams', 'golf_organizations']

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('id').limit(1)
    if (error) {
      console.log(`❌ ${table}: MISSING or ERROR`)
      console.log(`   Error: ${error.message}`)
    } else {
      console.log(`✅ ${table}: EXISTS (${data?.length || 0} rows checked)`)
    }
  }
}

checkTables().then(() => process.exit(0))
