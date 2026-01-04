#!/usr/bin/env node
/**
 * Diagnose database errors - check for broken triggers, functions, policies
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
);

console.log('🔍 DIAGNOSING DATABASE ERRORS\n');
console.log('='.repeat(80));

// Test 1: Check golf_coaches query
console.log('\n1️⃣ Testing golf_coaches table...');
const { data: coaches, error: coachError } = await supabase
  .from('golf_coaches')
  .select('id, full_name, team_id')
  .limit(1);

console.log('   Result:', coaches ? `✅ ${coaches.length} rows` : '❌ Error');
if (coachError) {
  console.log('   Error:', coachError.code, '-', coachError.message);
  console.log('   Details:', coachError.details);
  console.log('   Hint:', coachError.hint);
}

// Test 2: Check golf_teams query
console.log('\n2️⃣ Testing golf_teams table...');
const { data: teams, error: teamError } = await supabase
  .from('golf_teams')
  .select('id, name')
  .limit(1);

console.log('   Result:', teams ? `✅ ${teams.length} rows` : '❌ Error');
if (teamError) {
  console.log('   Error:', teamError.code, '-', teamError.message);
  console.log('   Details:', teamError.details);
  console.log('   Hint:', teamError.hint);
}

// Test 3: Check golf_player_classes policies
console.log('\n3️⃣ Testing golf_player_classes table...');
const { data: classes, error: classError } = await supabase
  .from('golf_player_classes')
  .select('id, course_code')
  .limit(1);

console.log('   Result:', classes ? `✅ ${classes.length} rows` : '❌ Error');
if (classError) {
  console.log('   Error:', classError.code, '-', classError.message);
  console.log('   Details:', classError.details);
  console.log('   Hint:', classError.hint);
}

// Test 4: Check golf_events
console.log('\n4️⃣ Testing golf_events table...');
const { data: events, error: eventError } = await supabase
  .from('golf_events')
  .select('id, title')
  .limit(1);

console.log('   Result:', events ? `✅ ${events.length} rows` : '❌ Error');
if (eventError) {
  console.log('   Error:', eventError.code, '-', eventError.message);
  console.log('   Details:', eventError.details);
  console.log('   Hint:', eventError.hint);
}

// Test 5: Try to delete a test class
console.log('\n5️⃣ Testing DELETE on golf_player_classes...');
const { data: player } = await supabase
  .from('golf_players')
  .select('id')
  .eq('email', 'rinin376@gmail.com')
  .single();

// Create a test class to delete
const { data: testClass, error: insertErr } = await supabase
  .from('golf_player_classes')
  .insert({
    player_id: player.id,
    course_code: 'DELETE-TEST',
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

if (insertErr) {
  console.log('   ❌ Insert failed:', insertErr.message);
} else {
  console.log('   ✅ Test class created:', testClass.id);

  // Try to delete it
  const { error: deleteErr } = await supabase
    .from('golf_player_classes')
    .delete()
    .eq('id', testClass.id);

  console.log('   Delete result:', deleteErr ? `❌ ${deleteErr.message}` : '✅ Success');
  if (deleteErr) {
    console.log('   Error code:', deleteErr.code);
    console.log('   Details:', deleteErr.details);
    console.log('   Hint:', deleteErr.hint);
  }
}

console.log('\n' + '='.repeat(80));
console.log('📊 DIAGNOSIS COMPLETE');
console.log();
