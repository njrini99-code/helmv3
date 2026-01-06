import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU3Njg4NjgsImV4cCI6MjA1MTM0NDg2OH0.BhFpNSE_vn0I52u45_MxoJqvs8oAzN7sGkCcNxJgv9Q';

console.log('🔍 DIAGNOSING RLS POLICY ISSUE FOR golf_events\n');
console.log('=' .repeat(80));

// Step 1: Check if RLS is enabled
console.log('\n📋 Step 1: Checking if RLS is enabled on golf_events table...\n');

const supabaseService = createClient(supabaseUrl, serviceKey);

// Try to get table info from information_schema
const { data: tableInfo, error: tableError } = await supabaseService
  .from('information_schema.tables')
  .select('*')
  .eq('table_schema', 'public')
  .eq('table_name', 'golf_events')
  .maybeSingle();

if (tableError) {
  console.log('⚠️  Could not query information_schema:', tableError.message);
} else {
  console.log('✅ Table exists:', tableInfo ? 'Yes' : 'No');
}

// Step 2: Test with SERVICE role (should ALWAYS work)
console.log('\n📋 Step 2: Testing INSERT with SERVICE ROLE (should work)...\n');

const { data: serviceInsert, error: serviceError } = await supabaseService
  .from('golf_events')
  .insert({
    team_id: null,
    title: '[TEST] Service Role Insert',
    event_type: 'practice',
    start_date: '2026-01-15',
    all_day: true,
  })
  .select()
  .single();

if (serviceError) {
  console.log('❌ SERVICE ROLE FAILED! This should NEVER happen!');
  console.log('   Error:', serviceError);
} else {
  console.log('✅ Service role can insert (ID:', serviceInsert.id, ')');
  // Clean up
  await supabaseService.from('golf_events').delete().eq('id', serviceInsert.id);
}

// Step 3: Test with ANON role (simulates authenticated user)
console.log('\n📋 Step 3: Testing INSERT with ANON ROLE (simulates RLS)...\n');

const supabaseAnon = createClient(supabaseUrl, anonKey);

// First, try to sign in as a test user
console.log('Attempting to sign in as test user...');
const { data: authData, error: authError } = await supabaseAnon.auth.signInWithPassword({
  email: 'rinin376@gmail.com',
  password: 'Ricknini1!'
});

if (authError) {
  console.log('⚠️  Could not sign in:', authError.message);
  console.log('   Trying anonymous insert instead...\n');

  const { data: anonInsert, error: anonError } = await supabaseAnon
    .from('golf_events')
    .insert({
      team_id: null,
      title: '[TEST] Anon Role Insert',
      event_type: 'practice',
      start_date: '2026-01-15',
      all_day: true,
    })
    .select()
    .single();

  if (anonError) {
    console.log('❌ ANON ROLE FAILED (expected if RLS requires auth):');
    console.log('   Code:', anonError.code);
    console.log('   Message:', anonError.message);

    if (anonError.code === '42501') {
      console.log('\n⚠️  ERROR CODE 42501 = RLS POLICY VIOLATION');
      console.log('   This means the INSERT policy is blocking the operation.');
    }
  } else {
    console.log('✅ Anon role can insert (ID:', anonInsert.id, ')');
    await supabaseAnon.from('golf_events').delete().eq('id', anonInsert.id);
  }
} else {
  console.log('✅ Signed in as:', authData.user.email, '\n');

  const { data: authInsert, error: authInsertError } = await supabaseAnon
    .from('golf_events')
    .insert({
      team_id: null,
      title: '[TEST] Authenticated Insert',
      event_type: 'practice',
      start_date: '2026-01-15',
      all_day: true,
    })
    .select()
    .single();

  if (authInsertError) {
    console.log('❌ AUTHENTICATED USER FAILED:');
    console.log('   Code:', authInsertError.code);
    console.log('   Message:', authInsertError.message);
    console.log('   Details:', authInsertError.details);
    console.log('   Hint:', authInsertError.hint);

    if (authInsertError.code === '42501') {
      console.log('\n🚨 THIS IS THE PROBLEM!');
      console.log('   Even authenticated users are being blocked by RLS policy.');
      console.log('   The policy with WITH CHECK (true) was NOT applied or is being overridden.');
    }
  } else {
    console.log('✅ Authenticated user can insert (ID:', authInsert.id, ')');
    await supabaseAnon.from('golf_events').delete().eq('id', authInsert.id);
  }

  await supabaseAnon.auth.signOut();
}

console.log('\n' + '='.repeat(80));
console.log('\n💡 NEXT STEPS:\n');
console.log('1. If SERVICE ROLE works but AUTHENTICATED fails:');
console.log('   → RLS policy is the problem');
console.log('   → Need to run the SQL in Supabase Dashboard\n');

console.log('2. To check what policies exist, run in Supabase Dashboard SQL Editor:');
console.log('   SELECT policyname, cmd, with_check::text');
console.log('   FROM pg_policies');
console.log('   WHERE tablename = \'golf_events\' AND cmd = \'INSERT\';');
console.log('\n');
