#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('🔍 Complete User State Check for rinin376@gmail.com\n');

// 1. Check users table
console.log('=== USERS TABLE ===');
const { data: user, error: userError } = await supabase
  .from('users')
  .select('*')
  .eq('email', 'rinin376@gmail.com')
  .maybeSingle();

if (userError) {
  console.log('❌ Error:', userError.message);
} else if (!user) {
  console.log('❌ No user record found!');
} else {
  console.log('✅ User record found:');
  console.table(user);
}

// 2. Check golf_players table
console.log('\n=== GOLF_PLAYERS TABLE ===');
const { data: player, error: playerError } = await supabase
  .from('golf_players')
  .select('*')
  .eq('email', 'rinin376@gmail.com')
  .maybeSingle();

if (playerError) {
  console.log('❌ Error:', playerError.message);
} else if (!player) {
  console.log('❌ No golf_players record found!');
  console.log('⚠️  THIS IS THE PROBLEM - Dashboard layout expects golf_players record');
} else {
  console.log('✅ Golf player record found:');
  console.table(player);

  // Check if user_id matches
  if (user && player.user_id !== user.id) {
    console.log('\n⚠️  WARNING: user_id mismatch!');
    console.log(`   users.id = ${user.id}`);
    console.log(`   golf_players.user_id = ${player.user_id}`);
  } else if (user) {
    console.log('\n✅ user_id correctly linked');
  }
}

// 3. Check golf_coaches table
console.log('\n=== GOLF_COACHES TABLE ===');
const { data: coach, error: coachError } = await supabase
  .from('golf_coaches')
  .select('*')
  .eq('email', 'rinin376@gmail.com')
  .maybeSingle();

if (coachError) {
  console.log('❌ Error:', coachError.message);
} else if (!coach) {
  console.log('✅ No coach record (expected for player account)');
} else {
  console.log('⚠️  Coach record found (unexpected for player):');
  console.table(coach);
}

// 4. Summary
console.log('\n=== DIAGNOSIS ===');
if (user && player && player.user_id === user.id) {
  console.log('✅ All records correct - user should be able to access dashboard');
  console.log('\nDashboard layout logic (line 142-171):');
  console.log('  1. Query golf_players WHERE user_id = ${user.id}');
  console.log(`  2. Should find player: ${player.id}`);
  console.log('  3. Load dashboard with player data');
  console.log('\n✅ Expected behavior: Dashboard should load normally');
} else if (user && !player) {
  console.log('❌ PROBLEM FOUND: users record exists but golf_players missing!');
  console.log('\nDashboard layout logic (line 173):');
  console.log('  → No golf_coaches found');
  console.log('  → No golf_players found');
  console.log('  → Redirects to /golf/signup');
  console.log('\n🔧 FIX: Need to create golf_players record linked to user.id');
} else if (!user) {
  console.log('❌ PROBLEM: No users record found');
} else {
  console.log('⚠️  Complex issue - check logs above');
}
