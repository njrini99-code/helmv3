#!/usr/bin/env node
/**
 * Check RLS policies on golf_player_classes table
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('🔍 CHECKING RLS POLICIES\n');
console.log('='.repeat(80));

console.log('\nQuerying pg_policies for golf_player_classes...\n');

const { data, error } = await supabase.rpc('exec_sql', {
  query: `
    SELECT 
      policyname,
      cmd,
      roles::text,
      qual::text AS using_expression,
      with_check::text AS with_check_expression
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_player_classes'
    ORDER BY policyname;
  `
});

if (error) {
  console.error('❌ Error:', error.message);
  console.log('\n💡 Trying alternative approach with direct SQL query...\n');
  
  // Try a simple query to see what functions are available
  const { data: functions, error: funcError } = await supabase
    .from('information_schema.routines')
    .select('routine_name')
    .eq('routine_schema', 'public')
    .limit(10);
  
  if (funcError) {
    console.error('Cannot query database functions:', funcError.message);
  } else {
    console.log('Available functions:', functions?.map(f => f.routine_name));
  }
} else {
  console.log('Current RLS Policies on golf_player_classes:');
  console.log('='.repeat(80));
  
  if (data && data.length > 0) {
    data.forEach(policy => {
      console.log(`\nPolicy: ${policy.policyname}`);
      console.log(`  Command: ${policy.cmd}`);
      console.log(`  Roles: ${policy.roles}`);
      console.log(`  USING: ${policy.using_expression || '(none)'}`);
      console.log(`  WITH CHECK: ${policy.with_check_expression || '(none)'}`);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log(`\nTotal policies: ${data.length}`);
    
    // Check for duplicates
    const policyNames = data.map(p => p.policyname);
    const duplicates = policyNames.filter((name, index) => policyNames.indexOf(name) !== index);
    
    if (duplicates.length > 0) {
      console.log('\n⚠️  DUPLICATE POLICIES FOUND:', duplicates);
    } else {
      console.log('\n✅ No duplicate policies');
    }
  } else {
    console.log('\n⚠️  No RLS policies found on golf_player_classes!');
    console.log('This table might not have RLS enabled or policies are missing.');
  }
}

console.log();
