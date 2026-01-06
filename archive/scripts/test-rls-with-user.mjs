#!/usr/bin/env node
/**
 * Test RLS policies with actual user authentication
 * This simulates what happens when the user tries to delete classes
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MzA4NjgsImV4cCI6MjA4MTUwNjg2OH0.tFNLv6DtCIGlLwz7VZECHUqaKHFNbkbNv-pCtdNTM5U';

// Create client with anon key (simulates browser)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('🧪 TESTING RLS POLICIES WITH USER AUTHENTICATION\n');
console.log('='.repeat(80));

// Test credentials - use the player's email
const TEST_EMAIL = 'rinin376@gmail.com';
const TEST_PASSWORD = 'password123'; // You may need to set this

console.log('\n1️⃣ Signing in as player...');
console.log('   Email:', TEST_EMAIL);

const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
});

if (authError) {
  console.error('❌ Authentication failed:', authError.message);
  console.log('\n💡 Please update TEST_PASSWORD in this script with the correct password');
  process.exit(1);
}

console.log('   ✅ Authenticated as:', authData.user.email);
console.log('   User ID:', authData.user.id);

// Get player record
console.log('\n2️⃣ Getting player record...');
const { data: player, error: playerError } = await supabase
  .from('golf_players')
  .select('id, first_name, last_name, team_id')
  .eq('user_id', authData.user.id)
  .single();

if (playerError) {
  console.error('❌ Error getting player:', playerError.message);
  process.exit(1);
}

console.log('   ✅ Player:', player.first_name, player.last_name);
console.log('   Player ID:', player.id);
console.log('   Team ID:', player.team_id);

// Test SELECT on classes
console.log('\n3️⃣ Testing SELECT on golf_player_classes...');
const { data: classes, error: selectError } = await supabase
  .from('golf_player_classes')
  .select('*')
  .eq('player_id', player.id);

if (selectError) {
  console.error('   ❌ SELECT failed:', selectError.message);
  console.error('   Code:', selectError.code);
  console.error('   Details:', selectError.details);
} else {
  console.log('   ✅ SELECT succeeded:', classes.length, 'classes found');
}

// Test INSERT
console.log('\n4️⃣ Testing INSERT on golf_player_classes...');
const { data: newClass, error: insertError } = await supabase
  .from('golf_player_classes')
  .insert({
    player_id: player.id,
    course_code: 'RLS-TEST',
    course_name: 'RLS Test Class',
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
  console.error('   Details:', insertError.details);
} else {
  console.log('   ✅ INSERT succeeded');
  console.log('   Class ID:', newClass.id);

  // Test DELETE
  console.log('\n5️⃣ Testing DELETE on golf_player_classes...');
  const { error: deleteError } = await supabase
    .from('golf_player_classes')
    .delete()
    .eq('id', newClass.id);

  if (deleteError) {
    console.error('   ❌ DELETE failed:', deleteError.message);
    console.error('   Code:', deleteError.code);
    console.error('   Details:', deleteError.details);
    console.error('   Hint:', deleteError.hint);
  } else {
    console.log('   ✅ DELETE succeeded');
  }
}

// Test golf_coaches query
console.log('\n6️⃣ Testing SELECT on golf_coaches...');
const { data: coaches, error: coachError } = await supabase
  .from('golf_coaches')
  .select('id, full_name')
  .limit(1);

if (coachError) {
  console.error('   ❌ SELECT failed:', coachError.message);
  console.error('   Code:', coachError.code);
} else {
  console.log('   ✅ SELECT succeeded:', coaches.length, 'coaches found');
}

// Test golf_teams query
console.log('\n7️⃣ Testing SELECT on golf_teams...');
const { data: teams, error: teamError } = await supabase
  .from('golf_teams')
  .select('id, name')
  .limit(1);

if (teamError) {
  console.error('   ❌ SELECT failed:', teamError.message);
  console.error('   Code:', teamError.code);
} else {
  console.log('   ✅ SELECT succeeded:', teams.length, 'teams found');
}

console.log('\n' + '='.repeat(80));
console.log('📊 RLS POLICY TEST COMPLETE');
console.log('\nNote: If DELETE failed with error code 42P17, RLS policies need to be fixed.');
console.log('Run fix-rls-completely.sql in Supabase Dashboard > SQL Editor');
console.log();
