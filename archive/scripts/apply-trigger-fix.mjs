import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const sql = fs.readFileSync('fix_golf_signup_trigger.sql', 'utf8');

console.log('🔧 Applying golf signup trigger fix to database...\n');
console.log('SQL to execute:');
console.log('─'.repeat(80));
console.log(sql.substring(0, 500) + '...\n');
console.log('─'.repeat(80));

try {
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (error) {
    console.error('❌ Error applying fix:', error);
    console.log('\n💡 Alternative: Run this SQL manually in Supabase Dashboard > SQL Editor');
    process.exit(1);
  }

  console.log('✅ Successfully applied trigger fix!');
  console.log('\n📋 Next steps:');
  console.log('1. Test golf player signup: /golf/signup (role: Player)');
  console.log('2. Test golf coach signup: /golf/signup (role: Coach)');
  console.log('3. Verify profile creation in database');

} catch (err) {
  console.error('❌ Unexpected error:', err.message);
  console.log('\n💡 Manual fix required:');
  console.log('1. Go to Supabase Dashboard → SQL Editor');
  console.log('2. Copy contents of fix_golf_signup_trigger.sql');
  console.log('3. Paste and run');
  process.exit(1);
}
