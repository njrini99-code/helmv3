#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
);

const PLAYER_ID = '5bab961e-4ea4-4c88-812f-68a9469f8156';

console.log('🧪 TESTING DELETE OPERATION\n');
console.log('='.repeat(80));

console.log('\n1️⃣ Creating test class...');
const { data: testClass, error: insertError } = await supabase
  .from('golf_player_classes')
  .insert({
    player_id: PLAYER_ID,
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
  process.exit(1);
}

console.log('   ✅ INSERT succeeded');
console.log('   Class ID:', testClass.id);

console.log('\n2️⃣ Attempting DELETE...');
const { error: deleteError } = await supabase
  .from('golf_player_classes')
  .delete()
  .eq('id', testClass.id);

if (deleteError) {
  console.error('   ❌ DELETE failed!');
  console.error('   Error message:', deleteError.message);
  console.error('   Error code:', deleteError.code);
  console.error('   Details:', deleteError.details);
  console.error('   Hint:', deleteError.hint);
  
  if (deleteError.code === '42P17') {
    console.log('\n🚨 ERROR CODE 42P17 - INVALID OBJECT DEFINITION');
    console.log('   This indicates duplicate or conflicting RLS policies.');
    console.log('\n   📋 NEXT STEPS:');
    console.log('   1. Open Supabase Dashboard');
    console.log('   2. Go to SQL Editor');
    console.log('   3. Run the contents of fix-rls-completely.sql');
    console.log('   4. This will wipe and recreate all RLS policies cleanly');
  }
} else {
  console.log('   ✅ DELETE succeeded!');
  console.log('\n   🎉 RLS policies are working correctly.');
  console.log('   The browser issue might be resolved. Have user try again.');
  console.log('   If still failing, user may need to sign out and back in.');
}

console.log('\n' + '='.repeat(80));
console.log();
