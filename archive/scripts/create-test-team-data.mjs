#!/usr/bin/env node
/**
 * CREATE TEST DATA FOR TEAM JOIN FLOW
 * Creates: Organization → Team → Coach → Invite Code
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('🏗️  CREATING TEST DATA FOR TEAM JOIN FLOW\n');
console.log('='.repeat(80));

// =============================================================================
// STEP 1: Create Golf Organization
// =============================================================================
console.log('\n📋 STEP 1: Creating Golf Organization\n');

const { data: org, error: orgError } = await supabase
  .from('golf_organizations')
  .insert({
    name: 'Test University Golf',
    city: 'Austin',
    state: 'TX',
    division: 'D1',
    conference: 'Big 12',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
  .select()
  .single();

if (orgError) {
  console.log('❌ Failed to create organization:', orgError.message);
  process.exit(1);
}

console.log('✅ Created organization:', org.name);
console.log('   ID:', org.id);

// =============================================================================
// STEP 2: Create Golf Team
// =============================================================================
console.log('\n📋 STEP 2: Creating Golf Team\n');

const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

const { data: team, error: teamError } = await supabase
  .from('golf_teams')
  .insert({
    organization_id: org.id,
    name: "Test University Men's Golf",
    invite_code: inviteCode,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
  .select()
  .single();

if (teamError) {
  console.log('❌ Failed to create team:', teamError.message);
  process.exit(1);
}

console.log('✅ Created team:', team.name);
console.log('   Team ID:', team.id);
console.log('   Invite Code:', team.invite_code);

// =============================================================================
// STEP 3: Create Test User for Coach
// =============================================================================
console.log('\n📋 STEP 3: Creating Test Coach Account\n');

// Create auth user for coach
const { data: authData, error: authError } = await supabase.auth.admin.createUser({
  email: 'testcoach@testgolf.com',
  password: 'TestPass123!',
  email_confirm: true,
  user_metadata: {
    role: 'coach',
    sport: 'golf'
  }
});

if (authError) {
  console.log('❌ Failed to create auth user:', authError.message);
  process.exit(1);
}

const coachUserId = authData.user.id;
console.log('✅ Created auth user:', authData.user.email);
console.log('   User ID:', coachUserId);

// Create users table record
const { error: userError } = await supabase
  .from('users')
  .insert({
    id: coachUserId,
    email: 'testcoach@testgolf.com',
    role: 'coach',
    sport: 'golf',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

if (userError) {
  console.log('⚠️  Users table error (may already exist):', userError.message);
}

// =============================================================================
// STEP 4: Create Golf Coach Profile
// =============================================================================
console.log('\n📋 STEP 4: Creating Golf Coach Profile\n');

const { data: coach, error: coachError } = await supabase
  .from('golf_coaches')
  .insert({
    user_id: coachUserId,
    team_id: team.id,
    organization_id: org.id,
    email: 'testcoach@testgolf.com',
    full_name: 'Test Coach',
    title: 'Head Coach',
    phone: '555-0123',
    onboarding_completed: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
  .select()
  .single();

if (coachError) {
  console.log('❌ Failed to create coach profile:', coachError.message);
  process.exit(1);
}

console.log('✅ Created coach profile:', coach.full_name);
console.log('   Coach ID:', coach.id);

// =============================================================================
// SUMMARY
// =============================================================================
console.log('\n' + '='.repeat(80));
console.log('✅ TEST DATA CREATED SUCCESSFULLY!');
console.log('='.repeat(80));

console.log('\n📊 SUMMARY:\n');
console.log('Organization:');
console.log('  Name:', org.name);
console.log('  ID:', org.id);

console.log('\nTeam:');
console.log('  Name:', team.name);
console.log('  ID:', team.id);
console.log('  Invite Code:', team.invite_code);

console.log('\nCoach:');
console.log('  Name:', coach.full_name);
console.log('  Email:', coach.email);
console.log('  Password: TestPass123!');
console.log('  User ID:', coach.user_id);

console.log('\n🎯 NEXT STEPS:\n');
console.log('1. Player can now join team using invite code:', team.invite_code);
console.log('2. Visit: http://localhost:3000/golf/join/' + team.invite_code);
console.log('3. Or coach can login at: http://localhost:3000/golf/login');
console.log('   Email: testcoach@testgolf.com');
console.log('   Password: TestPass123!');
console.log('\n4. Run end-to-end test: node test-team-join-flow.mjs');

console.log();
