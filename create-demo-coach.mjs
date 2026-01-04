#!/usr/bin/env node
/**
 * CREATE DEMO GOLF COACH ACCOUNT
 * Complete profile with all required fields
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('👤 CREATING DEMO GOLF COACH ACCOUNT\n');
console.log('='.repeat(80));

// Demo credentials
const DEMO_EMAIL = 'demo.coach@helmgolf.com';
const DEMO_PASSWORD = 'DemoCoach2024!';

// =============================================================================
// STEP 1: Get existing test organization and team
// =============================================================================
console.log('\n📋 STEP 1: Finding Test Organization and Team\n');

// First find a team, then get its organization
const { data: team, error: teamError } = await supabase
  .from('golf_teams')
  .select('*, golf_organizations(*)')
  .limit(1)
  .single();

if (teamError || !team) {
  console.log('❌ No team found. Run create-test-team-data.mjs first.');
  process.exit(1);
}

console.log('✅ Found team:', team.name);
console.log('   Invite Code:', team.invite_code);

const org = team.golf_organizations;
console.log('✅ Found organization:', org.name);

// =============================================================================
// STEP 2: Create Auth User
// =============================================================================
console.log('\n📋 STEP 2: Creating Auth Account\n');

// Check if user already exists
const { data: existingAuth } = await supabase.auth.admin.listUsers();
const userExists = existingAuth?.users?.some(u => u.email === DEMO_EMAIL);

let userId;

if (userExists) {
  console.log('⚠️  User already exists, using existing account');
  const existing = existingAuth.users.find(u => u.email === DEMO_EMAIL);
  userId = existing.id;

  // Update password
  await supabase.auth.admin.updateUserById(userId, {
    password: DEMO_PASSWORD,
    email_confirm: true
  });
  console.log('✅ Updated password');
} else {
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
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

  userId = authData.user.id;
  console.log('✅ Created auth user');
}

console.log('   User ID:', userId);

// =============================================================================
// STEP 3: Create/Update Users Table Record
// =============================================================================
console.log('\n📋 STEP 3: Creating Users Table Record\n');

const { error: userError } = await supabase
  .from('users')
  .upsert({
    id: userId,
    email: DEMO_EMAIL,
    role: 'coach',
    sport: 'golf',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });

if (userError) {
  console.log('⚠️  Users table:', userError.message);
} else {
  console.log('✅ Users table record created');
}

// =============================================================================
// STEP 4: Create Golf Coach Profile (ALL REQUIRED FIELDS)
// =============================================================================
console.log('\n📋 STEP 4: Creating Complete Coach Profile\n');

// Check if profile already exists
const { data: existingCoach } = await supabase
  .from('golf_coaches')
  .select('*')
  .eq('user_id', userId)
  .maybeSingle();

if (existingCoach) {
  console.log('⚠️  Coach profile already exists, updating...');

  const { error: updateError } = await supabase
    .from('golf_coaches')
    .update({
      team_id: team.id,
      organization_id: org.id,
      email: DEMO_EMAIL,
      full_name: 'Mike Johnson',
      title: 'Head Coach',
      phone: '512-555-0199',
      onboarding_completed: true,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);

  if (updateError) {
    console.log('❌ Update error:', updateError.message);
  } else {
    console.log('✅ Updated coach profile');
  }
} else {
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .insert({
      user_id: userId,
      team_id: team.id,
      organization_id: org.id,
      email: DEMO_EMAIL,
      full_name: 'Mike Johnson',
      title: 'Head Coach',
      phone: '512-555-0199',
      onboarding_completed: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (coachError) {
    console.log('❌ Failed to create coach profile:', coachError.message);
    console.log('   Details:', coachError.details);
    console.log('   Hint:', coachError.hint);
    process.exit(1);
  }

  console.log('✅ Created complete coach profile');
  console.log('   Coach ID:', coach.id);
}

// =============================================================================
// VERIFICATION
// =============================================================================
console.log('\n📋 VERIFICATION\n');

const { data: verifyCoach, error: verifyError } = await supabase
  .from('golf_coaches')
  .select(`
    *,
    golf_teams (
      id,
      name,
      invite_code
    ),
    golf_organizations (
      id,
      name,
      city,
      state
    )
  `)
  .eq('user_id', userId)
  .single();

if (verifyError) {
  console.log('❌ Verification failed:', verifyError.message);
} else {
  console.log('✅ Profile verified successfully');
  console.log('\nProfile Details:');
  console.log('  Name:', verifyCoach.full_name);
  console.log('  Title:', verifyCoach.title);
  console.log('  Email:', verifyCoach.email);
  console.log('  Phone:', verifyCoach.phone);
  console.log('  Team:', verifyCoach.golf_teams?.name);
  console.log('  Organization:', verifyCoach.golf_organizations?.name);
  console.log('  Onboarding Complete:', verifyCoach.onboarding_completed);
}

// =============================================================================
// SUMMARY
// =============================================================================
console.log('\n' + '='.repeat(80));
console.log('✅ DEMO COACH ACCOUNT READY!');
console.log('='.repeat(80));

console.log('\n📧 LOGIN CREDENTIALS:\n');
console.log('  Email:    demo.coach@helmgolf.com');
console.log('  Password: DemoCoach2024!');

console.log('\n🏫 ORGANIZATION:\n');
console.log('  Name:', org.name);
console.log('  Location:', `${org.city}, ${org.state}`);
console.log('  Division:', org.division);
console.log('  Conference:', org.conference);

console.log('\n⛳ TEAM:\n');
console.log('  Name:', team.name);
console.log('  Invite Code:', team.invite_code);

console.log('\n🎯 TEST INSTRUCTIONS:\n');
console.log('1. Start dev server: npm run dev');
console.log('2. Go to: http://localhost:3000/golf/login');
console.log('3. Login with credentials above');
console.log('4. Should see coach dashboard with team management');
console.log('5. Go to Settings → Team Settings to see invite code');
console.log('6. Share invite link with players: /golf/join/' + team.invite_code);

console.log('\n💡 WHAT YOU CAN DO:\n');
console.log('  ✓ View team roster');
console.log('  ✓ Generate/view invite codes');
console.log('  ✓ Manage team settings');
console.log('  ✓ View calendar (after RLS fix)');
console.log('  ✓ Invite players to join team');

console.log();
