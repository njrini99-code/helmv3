#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
);

console.log('🔍 CHECKING CURRENT DATABASE POLICIES\n');
console.log('='.repeat(80));

// We'll query pg_policies via a workaround
// Check which migrations were actually applied
console.log('\n1️⃣ Checking applied migrations...');

const { data: migrations, error: migError } = await supabase
  .from('supabase_migrations.schema_migrations')
  .select('version')
  .order('version', { ascending: false })
  .limit(10);

if (!migError && migrations) {
  console.log('\n   Last 10 migrations:');
  migrations.forEach(m => {
    console.log(`   - ${m.version}`);
  });
  
  const has056 = migrations.some(m => m.version.includes('056'));
  const has057 = migrations.some(m => m.version.includes('057'));
  
  console.log(`\n   Migration 056 applied: ${has056 ? '✅' : '❌'}`);
  console.log(`   Migration 057 applied: ${has057 ? '✅' : '❌'}`);
  
  if (has056 && has057) {
    console.log('\n   ⚠️  Both migrations applied - potential for duplicate policies!');
  }
}

console.log('\n2️⃣ Attempting to query policies directly...');

// Try a direct query that bypasses REST API limitations
const testQuery = `
  SELECT policyname, cmd 
  FROM pg_policies 
  WHERE tablename = 'golf_player_classes'
  ORDER BY policyname
`;

console.log('   Query:', testQuery.replace(/\n/g, ' ').trim());
console.log('\n   Note: Cannot execute raw SQL via REST API');
console.log('   Please run this query in Supabase Dashboard > SQL Editor:');
console.log('\n   ```sql');
console.log(testQuery);
console.log('   ```\n');

console.log('='.repeat(80));
console.log('\n📋 RECOMMENDED ACTIONS:\n');
console.log('1. Run the SQL query above in Supabase Dashboard to see actual policies');
console.log('2. Look for duplicate policy names or conflicting FOR ALL vs FOR SELECT/INSERT/etc');
console.log('3. If duplicates found, run fix-rls-completely.sql to wipe and recreate cleanly');
console.log();

