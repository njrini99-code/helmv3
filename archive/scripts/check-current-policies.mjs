import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Testing RLS policy for golf_events...\n');

// Test with service role (should always work)
const { data: serviceTest, error: serviceError } = await supabase
  .from('golf_events')
  .insert({
    team_id: null,
    title: 'Service Role Test',
    event_type: 'practice',
    start_date: '2026-01-15',
    all_day: true,
  })
  .select()
  .single();

if (serviceError) {
  console.log('❌ Even service role failed! Something is very wrong.');
  console.log('Error:', serviceError);
} else {
  console.log('✅ Service role can insert (as expected)');
  await supabase.from('golf_events').delete().eq('id', serviceTest.id);
}

console.log('\n📋 To check existing policies, run this in Supabase SQL Editor:\n');
console.log(`
SELECT
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'golf_events'
  AND cmd = 'INSERT'
ORDER BY policyname;
`);

console.log('\n⚠️  Did you run the RLS policy SQL successfully?');
console.log('It should have returned "Success. No rows returned"');
console.log('\nIf you got an error, please share it!');
