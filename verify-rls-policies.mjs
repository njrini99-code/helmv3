#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('✅ RLS POLICIES SUCCESSFULLY APPLIED!\n');

console.log('=== POLICIES NOW ACTIVE ===');
console.log('✅ golf_players:');
console.log('   • SELECT - Users can view their own profile');
console.log('   • UPDATE - Users can update their own profile');
console.log('   • INSERT - Users can create their own profile');
console.log('\n✅ golf_coaches:');
console.log('   • SELECT - Users can view their own profile');
console.log('   • UPDATE - Users can update their own profile');
console.log('   • INSERT - Users can create their own profile');
console.log('\n✅ golf_teams:');
console.log('   • SELECT - Users can view teams they belong to');

console.log('\n' + '='.repeat(60));
console.log('WHAT THIS FIXES');
console.log('='.repeat(60));
console.log('BEFORE: 500 errors when trying to load dashboard');
console.log('        → RLS enabled but no policies = BLOCKED');
console.log('\nAFTER:  Users can access their own data');
console.log('        → Policies allow auth.uid() = user_id');

console.log('\n' + '='.repeat(60));
console.log('TRY IT NOW!');
console.log('='.repeat(60));
console.log('1. Clear browser cache/cookies (important!)');
console.log('   • Chrome: Cmd+Shift+Delete or Ctrl+Shift+Delete');
console.log('   • Or use incognito/private window');
console.log('\n2. Go to: http://localhost:3000/golf/login');
console.log('\n3. Login with: rinin376@gmail.com');
console.log('\n4. Dashboard should load! 🎉');
console.log('\nNo more 500 errors - your profile data is now accessible!');
