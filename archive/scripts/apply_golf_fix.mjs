import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
)

async function applyFix() {
  console.log('=== Applying golf_players Column Fixes ===\n')

  // Add team_id column
  console.log('1. Adding team_id column...')
  const { error: teamIdError } = await supabase.rpc('exec_sql', {
    query: `ALTER TABLE golf_players ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES golf_teams(id) ON DELETE SET NULL;`
  })

  if (teamIdError) {
    console.log('   ❌ Error:', teamIdError.message)
  } else {
    console.log('   ✅ team_id column added')
  }

  // Add other missing columns
  console.log('\n2. Adding other missing columns...')
  const alterSQL = `
    ALTER TABLE golf_players
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS year golf_player_year,
    ADD COLUMN IF NOT EXISTS graduation_year INTEGER,
    ADD COLUMN IF NOT EXISTS major TEXT,
    ADD COLUMN IF NOT EXISTS hometown TEXT,
    ADD COLUMN IF NOT EXISTS state TEXT,
    ADD COLUMN IF NOT EXISTS handicap DECIMAL(4,1),
    ADD COLUMN IF NOT EXISTS scholarship_percentage DECIMAL(5,2),
    ADD COLUMN IF NOT EXISTS gpa DECIMAL(3,2),
    ADD COLUMN IF NOT EXISTS status golf_player_status DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
  `

  const { error: alterError } = await supabase.rpc('exec_sql', {
    query: alterSQL
  })

  if (alterError) {
    console.log('   ❌ Error:', alterError.message)
  } else {
    console.log('   ✅ All columns added successfully')
  }

  // Create index
  console.log('\n3. Creating index...')
  const { error: indexError } = await supabase.rpc('exec_sql', {
    query: `CREATE INDEX IF NOT EXISTS idx_golf_players_team_id ON golf_players(team_id);`
  })

  if (indexError) {
    console.log('   ❌ Error:', indexError.message)
  } else {
    console.log('   ✅ Index created')
  }

  // Verify
  console.log('\n4. Verifying columns...')
  const { data: verifyData, error: verifyError } = await supabase
    .from('golf_players')
    .select('*')
    .limit(1)

  if (verifyError) {
    console.log('   ❌ Verification failed:', verifyError.message)
  } else if (verifyData && verifyData.length > 0) {
    console.log('   ✅ Current columns:', Object.keys(verifyData[0]).join(', '))
  } else {
    console.log('   ⚠️  Table has no data to verify columns')
  }

  console.log('\n=== Fix Complete ===\n')
}

applyFix().then(() => process.exit(0)).catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
