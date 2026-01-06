#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('🔍 Checking RLS Policy Status\n');

// Test 1: Can service role read data?
console.log('TEST 1: Service role data access');
const { data: player, error: playerError } = await supabase
  .from('golf_players')
  .select('id, first_name, last_name, user_id')
  .eq('email', 'rinin376@gmail.com')
  .maybeSingle();

if (playerError) {
  console.log('❌ Service role CANNOT read golf_players:', playerError.message);
} else if (player) {
  console.log('✅ Service role can read golf_players');
  console.log(`   Player: ${player.first_name} ${player.last_name}`);
  console.log(`   User ID: ${player.user_id}`);
} else {
  console.log('⚠️  No player found for rinin376@gmail.com');
}

// Test 2: Try authenticated user access (will fail without real JWT, but shows policy error vs other error)
console.log('\nTEST 2: Checking for policy existence');
console.log('⚠️  Cannot test authenticated access via Node.js without real user JWT');
console.log('⚠️  Policies must be verified via Supabase Dashboard SQL Editor');

console.log('\n=== MANUAL VERIFICATION NEEDED ===');
console.log('Run this in Supabase Dashboard SQL Editor:');
console.log('https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc/sql');
console.log('\nSQL to run:');
console.log(`
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('golf_players', 'golf_coaches')
ORDER BY tablename, policyname;
`);

console.log('\nExpected result: Should see 3 policies per table (SELECT, UPDATE, INSERT)');
console.log('\nIf no policies shown → Run FIX_GOLF_RLS_POLICIES.sql again');
console.log('If policies exist but still 500 error → Check browser console for exact error');
