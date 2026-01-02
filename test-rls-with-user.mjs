import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
// Use ANON key to test RLS (not service role)
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU3Njg4NjgsImV4cCI6MjA1MTM0NDg2OH0.BhFpNSE_vn0I52u45_MxoJqvs8oAzN7sGkCcNxJgv9Q';

const supabase = createClient(supabaseUrl, anonKey);

async function testRLS() {
  // Sign in as the user
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'rinin376@gmail.com',
    password: 'test123' // You'll need to provide the actual password
  });

  if (authError) {
    console.log('Cannot test - need user credentials');
    console.log('Error:', authError.message);
    console.log('\nPlease verify the RLS policy was applied in Supabase Dashboard');
    console.log('Run this query to check:\n');
    console.log(`SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'golf_events'
  AND cmd = 'INSERT';`);
    return;
  }

  console.log('✅ Signed in as:', authData.user.email);
  console.log('User ID:', authData.user.id);

  // Try to create an event with null team_id
  const { data, error } = await supabase
    .from('golf_events')
    .insert({
      team_id: null,
      title: 'Test Personal Event',
      event_type: 'practice',
      start_date: '2026-01-15',
      all_day: true,
    })
    .select()
    .single();

  if (error) {
    console.log('\n❌ RLS Policy is blocking the insert!');
    console.log('Error:', error.message);
    console.log('Code:', error.code);
    console.log('\n→ The RLS policy was not applied or is incorrect');
  } else {
    console.log('\n✅ RLS Policy works! Event created:', data.id);
    // Clean up
    await supabase.from('golf_events').delete().eq('id', data.id);
  }

  await supabase.auth.signOut();
}

testRLS();
