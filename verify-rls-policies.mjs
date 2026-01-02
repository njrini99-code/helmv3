#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔍 Verifying RLS policies on golf_shots...\n');

// Try to query using REST API to check RLS status
const response = await fetch(`${supabaseUrl}/rest/v1/golf_shots?select=count&limit=1`, {
  headers: {
    'apikey': supabaseServiceKey,
    'Authorization': `Bearer ${supabaseServiceKey}`
  }
});

console.log('REST API Status:', response.status, response.statusText);

// Check if we can query shots
const { data: shots, error } = await supabase
  .from('golf_shots')
  .select('count');

console.log('Service key query:', {
  success: !error,
  count: shots?.length,
  error: error?.message
});

console.log('\n📋 To verify policies exist, run this in Supabase Dashboard SQL:');
console.log(`
SELECT
  policyname,
  cmd,
  permissive
FROM pg_policies
WHERE tablename = 'golf_shots'
ORDER BY policyname;
`);

console.log('\n🔍 If policies are missing, the SQL may have failed.');
console.log('   Check Supabase Dashboard → SQL Editor → Query History for errors.');
