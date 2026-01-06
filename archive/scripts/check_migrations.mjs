import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
)

async function checkMigrations() {
  console.log('=== Checking Applied Migrations (containing "golf") ===\n')

  const { data, error } = await supabase
    .from('schema_migrations')
    .select('version')
    .ilike('version', '%golf%')
    .order('version')

  if (error) {
    console.error('❌ Error querying migrations:', error.message)
  } else if (data && data.length > 0) {
    console.log(`✅ Found ${data.length} golf-related migrations:`)
    data.forEach(m => console.log(`   - ${m.version}`))
  } else {
    console.log('⚠️  No golf-related migrations found')
  }

  console.log('\n=== Checking All Recent Migrations ===\n')

  const { data: recent, error: recentError } = await supabase
    .from('schema_migrations')
    .select('version')
    .order('version', { ascending: false })
    .limit(10)

  if (recent) {
    console.log('Last 10 migrations:')
    recent.forEach(m => console.log(`   - ${m.version}`))
  }
}

checkMigrations().then(() => process.exit(0))
