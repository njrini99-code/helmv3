#!/usr/bin/env node
/**
 * Fix authentication trigger and RLS policies
 * Run with: node scripts/fix-auth.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qmnssrrolpinvwjjnufo.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtbnNzcnJvbHBpbnZ3ampudWZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODMyNjg0MCwiZXhwIjoyMDgzOTAyODQwfQ.pW8-66rT0Y3LXcPYSXMPqj0_y0K_AYnPj22nXjdMU6I';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function checkTables() {
  console.log('\\n=== Checking Tables and Policies ===\\n');

  // Check if users table exists and has data
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, role')
    .limit(3);

  if (usersError) {
    console.log('❌ Users table error:', usersError.message);
  } else {
    console.log('✅ Users table OK, sample:', users?.length || 0, 'records');
  }

  // Check golf_coaches
  const { data: coaches, error: coachesError } = await supabase
    .from('golf_coaches')
    .select('id, user_id, full_name, onboarding_completed')
    .limit(3);

  if (coachesError) {
    console.log('❌ Golf coaches error:', coachesError.message);
  } else {
    console.log('✅ Golf coaches OK, sample:', coaches?.length || 0, 'records');
  }

  // Check golf_players
  const { data: players, error: playersError } = await supabase
    .from('golf_players')
    .select('id, user_id, first_name, onboarding_completed')
    .limit(3);

  if (playersError) {
    console.log('❌ Golf players error:', playersError.message);
  } else {
    console.log('✅ Golf players OK, sample:', players?.length || 0, 'records');
  }

  // Check golf_team_coach_staff (this is a key table for RLS)
  const { data: staff, error: staffError } = await supabase
    .from('golf_team_coach_staff')
    .select('*')
    .limit(1);

  if (staffError) {
    if (staffError.code === '42P01') {
      console.log('❌ Table golf_team_coach_staff does not exist!');
    } else {
      console.log('❌ Golf team coach staff error:', staffError.message);
    }
  } else {
    console.log('✅ Golf team coach staff OK');
  }

  // Check organizations
  const { data: orgs, error: orgsError } = await supabase
    .from('organizations')
    .select('id, name')
    .limit(3);

  if (orgsError) {
    console.log('❌ Organizations error:', orgsError.message);
  } else {
    console.log('✅ Organizations OK, sample:', orgs?.length || 0, 'records');
  }
}

async function testSignupFlow() {
  console.log('\\n=== Testing Signup Flow ===\\n');

  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';

  console.log('1. Creating test user:', testEmail);

  const { data: signUpData, error: signUpError } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
    user_metadata: {
      role: 'coach',
      sport: 'golf',
      first_name: 'Test',
      last_name: 'Coach',
    },
  });

  if (signUpError) {
    console.log('❌ Signup failed:', signUpError.message);
    return null;
  }

  console.log('✅ User created in auth.users:', signUpData.user?.id);

  // Wait for trigger to execute
  await new Promise(r => setTimeout(r, 1000));

  // Check if trigger created the users record
  const { data: userRecord, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', signUpData.user.id)
    .single();

  if (userError) {
    console.log('❌ Trigger did NOT create users record:', userError.message);
    console.log('   This is the root cause! The handle_new_user trigger is not working.');
  } else {
    console.log('✅ Trigger created users record:', userRecord);
  }

  return signUpData.user;
}

async function cleanupTestUser(userId) {
  if (!userId) return;

  console.log('\\n=== Cleaning up test user ===');

  // Delete from users table
  await supabase.from('users').delete().eq('id', userId);

  // Delete from auth
  await supabase.auth.admin.deleteUser(userId);

  console.log('✅ Test user cleaned up');
}

async function main() {
  console.log('🔧 Auth/RLS Diagnostic Script\\n');

  await checkTables();

  const testUser = await testSignupFlow();

  if (testUser) {
    await cleanupTestUser(testUser.id);
  }

  console.log('\\n=== Diagnosis Complete ===');
  console.log('\\nIf the trigger did NOT create a users record, you need to:');
  console.log('1. Go to Supabase Dashboard > SQL Editor');
  console.log('2. Run the SQL from FIX_RLS_URGENT.sql');
  console.log('   OR copy and paste the trigger function from:');
  console.log('   supabase/migrations/002_core_users_auth.sql');
}

main().catch(console.error);
