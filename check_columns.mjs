import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
)

async function checkColumns() {
  console.log('=== Checking golf_players columns ===\n')

  const { data, error } = await supabase
    .from('golf_players')
    .select('*')
    .limit(1)

  if (error) {
    console.log('❌ Error:', error.message)
  } else if (data && data.length > 0) {
    console.log('✅ Columns in golf_players:')
    Object.keys(data[0]).forEach(col => console.log(`   - ${col}`))
  } else {
    console.log('⚠️  Table exists but has no data')
    console.log('   Cannot determine columns without data')
  }

  console.log('\n=== Checking golf_coaches columns ===\n')

  const { data: coachData, error: coachError } = await supabase
    .from('golf_coaches')
    .select('*')
    .limit(1)

  if (coachError) {
    console.log('❌ Error:', coachError.message)
  } else if (coachData && coachData.length > 0) {
    console.log('✅ Columns in golf_coaches:')
    Object.keys(coachData[0]).forEach(col => console.log(`   - ${col}`))
  } else {
    console.log('⚠️  Table exists but has no data')
  }
}

checkColumns().then(() => process.exit(0))
