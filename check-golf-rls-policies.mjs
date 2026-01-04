#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('🔍 Checking RLS Policies on Golf Tables\n');

// Test 1: Can we query golf_players with service role?
console.log('=== TEST 1: Service Role Query (should work) ===');
const { data: serviceData, error: serviceError } = await supabase
  .from('golf_players')
  .select('id, first_name, last_name, user_id')
  .eq('email', 'rinin376@gmail.com')
  .maybeSingle();

if (serviceError) {
  console.log('❌ Service role query failed:', serviceError.message);
} else {
  console.log('✅ Service role can read golf_players');
  console.table(serviceData);
}

// Test 2: Check if RLS is enabled
console.log('\n=== TEST 2: Checking RLS Status ===');
console.log('⚠️  Cannot check RLS status via REST API');
console.log('Need to run SQL in Supabase Dashboard:');
console.log(`
SELECT
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('golf_players', 'golf_coaches', 'golf_teams', 'golf_organizations')
ORDER BY tablename;
`);

// Test 3: Try to get policy details (won't work via REST API but we can try)
console.log('\n=== TEST 3: RLS Policy Details ===');
console.log('⚠️  Cannot query pg_policies via REST API');
console.log('Need to run SQL in Supabase Dashboard:');
console.log(`
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual::text AS using_clause,
  with_check::text AS with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('golf_players', 'golf_coaches')
ORDER BY tablename, policyname;
`);

console.log('\n=== DIAGNOSIS ===');
console.log('🔴 CRITICAL: The 500 errors in browser console indicate:');
console.log('   1. RLS is enabled on golf_players/golf_coaches tables');
console.log('   2. BUT no SELECT policy exists for authenticated users to read their own data');
console.log('   3. OR the policy has an error/infinite loop');
console.log('\n🔧 SOLUTION: Need to create RLS policies that allow:');
console.log('   - Users can SELECT their own golf_players record (WHERE user_id = auth.uid())');
console.log('   - Users can SELECT their own golf_coaches record (WHERE user_id = auth.uid())');
console.log('\n📋 Next step: Run the SQL queries above in Supabase Dashboard → SQL Editor');
