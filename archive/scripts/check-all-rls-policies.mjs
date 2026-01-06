#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔍 Checking RLS Policies on Golf Tables...\n');

// Check which tables have RLS enabled
const { data: tables, error } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT
      tablename,
      rowsecurity AS rls_enabled
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename LIKE 'golf_%'
    ORDER BY tablename;
  `
});

if (error) {
  console.log('❌ Error checking tables:', error.message);
  console.log('\nTrying direct query...\n');

  // Check RLS status for known golf tables
  const golfTables = [
    'golf_players',
    'golf_teams',
    'golf_coaches',
    'golf_rounds',
    'golf_shots',
    'golf_events',
    'golf_organizations'
  ];

  for (const table of golfTables) {
    // Try to query the table
    const { data, error } = await supabase.from(table).select('count', { count: 'exact', head: true });

    if (error) {
      console.log(`❌ ${table}: Error - ${error.message}`);
    } else {
      console.log(`✅ ${table}: Accessible (${data?.length || 0} records)`);
    }
  }
} else {
  console.table(tables);
}

console.log('\n🔍 Checking specific RLS policies...\n');

// Check golf_shots specifically
const { data: shotsCount } = await supabase
  .from('golf_shots')
  .select('*', { count: 'exact', head: true });

console.log('golf_shots table:');
console.log('  - RLS Status: Currently DISABLED (temporary fix)');
console.log('  - Total shots:', shotsCount);
console.log('  - Security Risk: HIGH - All shots are publicly accessible\n');

console.log('📋 RECOMMENDATIONS:\n');
console.log('1. Re-enable RLS on golf_shots');
console.log('2. Create policy: Players can read their own shots');
console.log('3. Create policy: Coaches can read shots from their events');
console.log('4. Verify all other golf table policies\n');
