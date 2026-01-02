import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

// Query to get RLS policies
const query = `
  SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
  FROM pg_policies
  WHERE tablename = 'golf_events'
  ORDER BY policyname;
`;

console.log('Fetching RLS policies for golf_events...\n');

// Use raw query via rpc if available, otherwise describe the issue
const { data, error } = await supabase
  .from('golf_events')
  .select('*')
  .limit(0);

console.log('Table access test:', error ? error.message : 'OK');

// Try to get policies info (this might not work without custom RPC)
console.log('\n📋 To see RLS policies, run this SQL in Supabase Dashboard:\n');
console.log(query);
console.log('\n');

// Test with service role to see what's being blocked
console.log('Testing insert with service_role key (bypasses RLS)...\n');

const { data: testData, error: testError } = await supabase
  .from('golf_events')
  .insert({
    team_id: null,
    title: 'Test Service Role Event',
    event_type: 'practice',
    start_date: '2026-01-15',
    all_day: true,
  })
  .select()
  .single();

if (testError) {
  console.log('❌ Service role insert failed:', testError.message);
} else {
  console.log('✅ Service role can insert with null team_id');
  console.log('Event ID:', testData.id);

  // Clean up
  await supabase.from('golf_events').delete().eq('id', testData.id);
  console.log('✅ Cleaned up test event');
}

console.log('\n⚠️  The RLS policy needs to be updated to allow players to insert events.');
console.log('\nWe need to modify the INSERT policy for golf_events.');
