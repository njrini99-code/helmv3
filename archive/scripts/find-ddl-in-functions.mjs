#!/usr/bin/env node
/**
 * Search for DDL statements in database functions
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs',
  {
    db: { schema: 'public' }
  }
);

console.log('🔍 SEARCHING FOR DDL IN DATABASE FUNCTIONS\n');
console.log('='.repeat(80));

// Get all function definitions
console.log('\n1️⃣ Fetching all custom functions in public schema...');

// We'll try to use a direct SQL query through the RPC endpoint
// First, let's see if we can create a temporary function to query pg_proc
const queryFunctions = `
SELECT 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition,
  d.description
FROM pg_proc p
LEFT JOIN pg_description d ON p.oid = d.objoid
WHERE p.pronamespace = 'public'::regnamespace
  AND p.prokind = 'f'
  AND p.proname NOT LIKE 'pg_%'
  AND p.proname NOT LIKE 'supabase_%'
ORDER BY p.proname;
`;

// Try executing raw SQL (this may not work directly)
const { data, error } = await supabase
  .from('pg_proc')
  .select('proname, prosrc')
  .eq('pronamespace', 'public'::regnamespace);

if (error) {
  console.log('   ⚠️  Cannot query pg_proc directly via REST API');
  console.log('   Error:', error.message);
  console.log('\n   Trying alternative approach...\n');
  
  // Alternative: List known functions and try to introspect them
  console.log('2️⃣ Checking for common trigger functions...');
  
  const knownFunctions = [
    'handle_new_user',
    'handle_updated_at',
    'update_golf_updated_at_column',
    'update_updated_at_column',
    'sync_class_to_calendar',
    'handle_golf_player_signup',
    'handle_golf_coach_signup'
  ];
  
  for (const funcName of knownFunctions) {
    console.log(`\n   Checking: ${funcName}`);
    
    // Try to call a SELECT on pg_proc for this specific function
    // This is a workaround since we can't query system tables directly
  }
  
  console.log('\n💡 Since we cannot access Postgres logs or query system tables via REST API,');
  console.log('   please check the Supabase Dashboard for:');
  console.log('\n   1. Database > Functions > Look for any function with CREATE statements');
  console.log('   2. Database > Triggers > Check what functions are triggered on DELETE');
  console.log('   3. Logs > Check recent Postgres logs for the exact error with function name');
  
} else {
  console.log('   ✅ Retrieved function definitions');
  
  // Search for DDL keywords
  const ddlKeywords = ['CREATE INDEX', 'CREATE TABLE', 'CREATE TRIGGER', 'CREATE TYPE', 'CREATE POLICY', 'EXECUTE'];
  
  data.forEach(func => {
    const source = func.prosrc || '';
    const hasDDL = ddlKeywords.some(keyword => source.toUpperCase().includes(keyword));
    
    if (hasDDL) {
      console.log(`\n🚨 FOUND DDL in function: ${func.proname}`);
      console.log('   Source:', source.substring(0, 200) + '...');
    }
  });
}

console.log('\n' + '='.repeat(80));
console.log();
