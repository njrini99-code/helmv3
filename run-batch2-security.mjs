#!/usr/bin/env node
/**
 * BATCH 2: CRITICAL SECURITY CHECK
 * Finds tables without RLS enabled
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('═'.repeat(80));
console.log('🔴 BATCH 2: CRITICAL SECURITY CHECK');
console.log('Finding tables WITHOUT Row Level Security (RLS)');
console.log('═'.repeat(80));
console.log();

// Query to find tables without RLS
const sql = `
SELECT
  t.tablename,
  c.relrowsecurity as rls_enabled,
  CASE
    WHEN c.relrowsecurity = false THEN '🔴 CRITICAL: RLS DISABLED'
    ELSE '✅ OK'
  END as status
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = 'public'::regnamespace
WHERE t.schemaname = 'public'
AND c.relrowsecurity = false
ORDER BY t.tablename;
`;

try {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
    },
    body: JSON.stringify({ query: sql })
  });

  if (!response.ok) {
    // exec_sql might not exist, try alternative approach
    console.log('⚠️  Cannot run raw SQL via REST API');
    console.log('⚠️  Manual check needed in Supabase Dashboard\n');
    console.log('Run this SQL in Dashboard SQL Editor:');
    console.log(sql);
    process.exit(1);
  }

  const result = await response.json();

  if (result.length === 0) {
    console.log('✅ EXCELLENT! All tables have RLS enabled');
    console.log('✅ No security vulnerabilities found\n');
  } else {
    console.log(`🔴 CRITICAL: Found ${result.length} tables WITHOUT RLS:\n`);
    console.table(result);
    console.log('\n⚠️  ACTION REQUIRED: Enable RLS on these tables immediately!');
  }

} catch (error) {
  console.log('❌ Cannot execute raw SQL via Supabase REST API');
  console.log('Reason:', error.message);
  console.log('\n📋 Please run AUDIT_BATCH_2_SECURITY_CRITICAL.sql manually in Supabase Dashboard');
}
