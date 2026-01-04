#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('🔧 Fixing onboarding_completed flag for rinin376@gmail.com\n');

const { data, error } = await supabase
  .from('golf_players')
  .update({
    onboarding_completed: true,
    profile_complete: true,
    updated_at: new Date().toISOString()
  })
  .eq('email', 'rinin376@gmail.com')
  .select();

if (error) {
  console.log('❌ Error:', error.message);
  process.exit(1);
}

console.log('✅ Successfully updated golf_players record\n');
console.log('Updated record:');
console.table(data[0]);

console.log('\n✅ YOU CAN NOW LOG IN!');
console.log('   Go to: https://yourapp.com/golf/login');
console.log('   After login, you will be redirected to /golf/dashboard');
console.log('\n⚠️  If you still see onboarding:');
console.log('   1. Clear browser cache and cookies');
console.log('   2. Try incognito/private window');
console.log('   3. Check browser console for errors (F12 → Console tab)');
