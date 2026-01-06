#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

console.log('🔌 Testing Supabase connection...\n');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Test 1: Read from users table
console.log('Test 1: Reading from users table...');
const { data: users, error: usersError } = await supabase
  .from('users')
  .select('id, email, role, sport')
  .limit(5);

if (usersError) {
  console.log('❌ Failed:', usersError.message);
} else {
  console.log('✅ Success! Found', users.length, 'users');
  console.log(users);
}

// Test 2: Run account fix
console.log('\nTest 2: Fixing your account...');
const { data: updateData, error: updateError } = await supabase
  .from('users')
  .update({ sport: 'golf', updated_at: new Date().toISOString() })
  .eq('email', 'rinin376@gmail.com')
  .select();

if (updateError) {
  console.log('❌ Failed:', updateError.message);
} else {
  console.log('✅ Success! Account updated');
  console.log(updateData);
}

// Test 3: Verify fix
console.log('\nTest 3: Verifying account fix...');
const { data: verifyData, error: verifyError } = await supabase
  .from('users')
  .select('id, email, role, sport, updated_at')
  .eq('email', 'rinin376@gmail.com')
  .single();

if (verifyError) {
  console.log('❌ Failed:', verifyError.message);
} else {
  console.log('✅ Verification:');
  console.log(verifyData);
}

console.log('\n✅ Connection working! Ready to run audits.');
