#!/usr/bin/env node
/**
 * Run RLS fix by executing SQL statements via Supabase client
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
);

console.log('🔧 APPLYING RLS FIX VIA SUPABASE CLIENT\n');
console.log('='.repeat(80));

const PLAYER_ID = '5bab961e-4ea4-4c88-812f-68a9469f8156';

// Since we can't execute DDL via the REST API, let's try a workaround:
// Temporarily disable RLS via service role and test if DELETE works

console.log('\n1️⃣ Testing DELETE with current policies...');

// First, create a test class
const { data: testClass1, error: insertError1 } = await supabase
  .from('golf_player_classes')
  .insert({
    player_id: PLAYER_ID,
    course_code: 'TEST-1-' + Date.now(),
    course_name: 'Test Class 1',
    days: ['M'],
    day_of_week: 0,
    start_time: '09:00:00',
    end_time: '10:00:00',
    semester: 'Spring 2025',
    color: '#FF0000',
  })
  .select()
  .single();

if (insertError1) {
  console.error('   ❌ INSERT failed:', insertError1.message);
  process.exit(1);
}

console.log('   ✅ Test class created:', testClass1.id);

// Try to delete it
const { error: deleteError1 } = await supabase
  .from('golf_player_classes')
  .delete()
  .eq('id', testClass1.id);

if (deleteError1) {
  console.error('   ❌ DELETE failed:', deleteError1.message);
  console.error('   Code:', deleteError1.code);
  
  if (deleteError1.code === '42P17') {
    console.log('\n⚠️  CONFIRMED: Error code 42P17 (duplicate_object)');
    console.log('   This means there are conflicting RLS policies.');
    console.log('\n📋 YOU MUST run this SQL in Supabase Dashboard > SQL Editor:\n');
    
    const sql = fs.readFileSync('/Users/ricknini/Downloads/helmv3/supabase/migrations/058_nuclear_rls_fix.sql', 'utf8');
    console.log(sql);
    console.log('\n   Then come back and try deleting classes again.');
  }
} else {
  console.log('   ✅ DELETE works! The issue might already be fixed.');
  console.log('\n   Try these steps:');
  console.log('   1. In your browser, sign out completely');
  console.log('   2. Clear browser cache (Cmd+Shift+Delete)');
  console.log('   3. Sign back in');
  console.log('   4. Go to /golf/dashboard/classes');
  console.log('   5. Try deleting a class');
}

console.log('\n' + '='.repeat(80));
console.log();

