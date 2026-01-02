import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, serviceKey);

console.log('📋 Checking current RLS policies for golf_events...\n');

// Query pg_policies to see what INSERT policies exist
const { data, error } = await supabase.rpc('exec_sql', {
  query: `
    SELECT
      policyname,
      cmd,
      qual::text AS using_clause,
      with_check::text AS with_check_clause
    FROM pg_policies
    WHERE tablename = 'golf_events'
      AND cmd = 'INSERT'
    ORDER BY policyname;
  `
});

if (error) {
  console.log('⚠️  Could not query policies directly.');
  console.log('Error:', error.message);
  console.log('\n💡 Please run this SQL in Supabase Dashboard SQL Editor:\n');
  console.log(`
SELECT
  policyname,
  cmd,
  qual::text AS using_clause,
  with_check::text AS with_check_clause
FROM pg_policies
WHERE tablename = 'golf_events'
  AND cmd = 'INSERT'
ORDER BY policyname;
  `);
} else {
  console.log('✅ Current INSERT policies on golf_events:\n');
  if (!data || data.length === 0) {
    console.log('   ❌ NO INSERT POLICIES FOUND!');
    console.log('   This means ALL inserts will be blocked by default.');
  } else {
    console.table(data);
  }
}
