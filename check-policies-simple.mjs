#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
);

console.log('🔍 Checking for duplicate/conflicting RLS policies...\n');

// Check if RLS is enabled
const { data: tableInfo, error: tableError } = await supabase
  .from('information_schema.tables')
  .select('*')
  .eq('table_schema', 'public')
  .eq('table_name', 'golf_player_classes')
  .single();

if (tableError) {
  console.error('Error checking table:', tableError.message);
} else {
  console.log('✅ Table golf_player_classes exists');
}

// Try to get pg_policies info via a different method
// Since we can't query system tables directly, let's test the actual behavior

console.log('\n📋 Testing actual RLS behavior:\n');

// Create a test with service role (should always work)
console.log('1. Creating test class with service role...');
const { data: testClass, error: insertError } = await supabase
  .from('golf_player_classes')
  .insert({
    player_id: 'cd7bb880-2a3e-45da-9c8a-e1fe8d7e07dc', // Use the known player ID
    course_code: 'DELETE-TEST-' + Date.now(),
    course_name: 'Delete Test',
    days: ['M'],
    day_of_week: 0,
    start_time: '09:00:00',
    end_time: '10:00:00',
    semester: 'Spring 2025',
    color: '#FF0000',
  })
  .select()
  .single();

if (insertError) {
  console.error('   ❌ INSERT failed:', insertError.message);
  console.error('   Code:', insertError.code);
  console.error('   This suggests a database-level problem');
} else {
  console.log('   ✅ INSERT succeeded, class ID:', testClass.id);
  
  console.log('\n2. Deleting test class with service role...');
  const { error: deleteError } = await supabase
    .from('golf_player_classes')
    .delete()
    .eq('id', testClass.id);
  
  if (deleteError) {
    console.error('   ❌ DELETE failed:', deleteError.message);
    console.error('   Code:', deleteError.code);
    console.error('   Details:', deleteError.details);
    
    if (deleteError.code === '42P17') {
      console.log('\n🚨 ERROR CODE 42P17 DETECTED!');
      console.log('   This is "invalid_object_definition" - likely duplicate/conflicting policies');
      console.log('\n   SOLUTION: Run fix-rls-completely.sql in Supabase Dashboard');
    }
  } else {
    console.log('   ✅ DELETE succeeded');
    console.log('\n   RLS policies appear to be working correctly with service role.');
    console.log('   If user still has issues, they may need to sign out and back in.');
  }
}

console.log();
