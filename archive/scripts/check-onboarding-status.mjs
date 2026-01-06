#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('🔍 Checking onboarding status for rinin376@gmail.com\n');

// Check users table
console.log('=== USERS TABLE ===');
const { data: user, error: userError } = await supabase
  .from('users')
  .select('*')
  .eq('email', 'rinin376@gmail.com')
  .single();

if (userError) {
  console.log('❌ Error:', userError.message);
} else {
  console.log('User record:');
  console.table({
    id: user.id,
    email: user.email,
    role: user.role,
    sport: user.sport,
    onboarding_completed: user.onboarding_completed,
    created_at: user.created_at,
    updated_at: user.updated_at
  });
}

// Check golf_players table
console.log('\n=== GOLF_PLAYERS TABLE ===');
const { data: player, error: playerError } = await supabase
  .from('golf_players')
  .select('*')
  .eq('email', 'rinin376@gmail.com')
  .single();

if (playerError) {
  console.log('❌ Error:', playerError.message);
} else {
  console.log('Golf player record:');
  console.table({
    id: player.id,
    user_id: player.user_id,
    email: player.email,
    first_name: player.first_name,
    last_name: player.last_name,
    onboarding_completed: player.onboarding_completed,
    team_id: player.team_id,
    created_at: player.created_at
  });
}

// Check auth.users metadata
console.log('\n=== DIAGNOSIS ===');

if (user) {
  console.log('\n✅ User record exists');
  console.log(`   Role: ${user.role}`);
  console.log(`   Sport: ${user.sport}`);

  if (user.onboarding_completed === true) {
    console.log('   ✅ users.onboarding_completed = true');
  } else if (user.onboarding_completed === false) {
    console.log('   ❌ users.onboarding_completed = false (ISSUE!)');
  } else {
    console.log('   ⚠️  users.onboarding_completed = NULL (ISSUE!)');
  }
}

if (player) {
  console.log('\n✅ Golf player record exists');
  console.log(`   Name: ${player.first_name} ${player.last_name}`);

  if (player.onboarding_completed === true) {
    console.log('   ✅ golf_players.onboarding_completed = true');
  } else if (player.onboarding_completed === false) {
    console.log('   ❌ golf_players.onboarding_completed = false (ISSUE!)');
  } else {
    console.log('   ⚠️  golf_players.onboarding_completed = NULL (ISSUE!)');
  }

  if (player.team_id) {
    console.log(`   ✅ Has team: ${player.team_id}`);
  } else {
    console.log('   ℹ️  No team assigned yet');
  }
}

console.log('\n=== LIKELY ISSUE ===');
if (user && user.onboarding_completed !== true) {
  console.log('🔴 users.onboarding_completed is not TRUE');
  console.log('   The route protection is checking this field');
  console.log('   Solution: Set users.onboarding_completed = true');
}

if (player && player.onboarding_completed !== true) {
  console.log('🔴 golf_players.onboarding_completed is not TRUE');
  console.log('   Solution: Set golf_players.onboarding_completed = true');
}
