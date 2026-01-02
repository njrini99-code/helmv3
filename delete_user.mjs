import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
)

async function deleteUser() {
  const userId = 'f4ab253a-ffc9-4127-a8e3-5e4d7c8b38f6' // rinin37@gmail.com

  console.log('=== Deleting User ===\n')
  console.log(`User ID: ${userId}`)
  console.log('Email: rinin37@gmail.com\n')

  // Delete from users table (will cascade to golf_players/golf_coaches)
  const { error: deleteError } = await supabase
    .from('users')
    .delete()
    .eq('id', userId)

  if (deleteError) {
    console.log('❌ Error deleting from users table:', deleteError.message)
  } else {
    console.log('✅ User deleted from users table')
  }

  // Also delete from Supabase Auth
  console.log('\nDeleting from Supabase Auth...')
  const { error: authError } = await supabase.auth.admin.deleteUser(userId)

  if (authError) {
    console.log('❌ Error deleting from auth:', authError.message)
  } else {
    console.log('✅ User deleted from Supabase Auth')
  }

  console.log('\n=== User Deletion Complete ===')
  console.log('You can now sign up again with rinin37@gmail.com\n')
}

deleteUser().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
