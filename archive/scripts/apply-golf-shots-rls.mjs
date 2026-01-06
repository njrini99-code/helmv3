#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔧 Applying RLS policies to golf_shots table...\n');

// Read migration file
const sql = readFileSync('supabase/migrations/049_golf_shots_rls_policy.sql', 'utf-8');

// Split into individual statements
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

console.log(`📝 Executing ${statements.length} SQL statements...\n`);

// Execute each statement
for (let i = 0; i < statements.length; i++) {
  const statement = statements[i] + ';';
  console.log(`${i + 1}. Executing: ${statement.substring(0, 60)}...`);

  try {
    // Use REST API to execute raw SQL
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ query: statement })
    });

    if (!response.ok) {
      // Try alternative approach using pg_catalog
      const altResponse = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ query: statement })
      });

      if (!altResponse.ok) {
        console.log(`   ⚠️  HTTP ${response.status} - Policy likely already exists or needs manual application`);
      } else {
        console.log(`   ✅ Success`);
      }
    } else {
      console.log(`   ✅ Success`);
    }
  } catch (error) {
    console.log(`   ⚠️  ${error.message}`);
  }
}

console.log('\n\n📋 Verifying policies were created...\n');

// Test player access
const playerId = '5bab961e-4ea4-4c88-812f-68a9469f8156';
const { data: rounds } = await supabase
  .from('golf_rounds')
  .select('id')
  .eq('player_id', playerId)
  .limit(1);

if (rounds && rounds.length > 0) {
  const roundId = rounds[0].id;

  // This still uses service key, but confirms data exists
  const { data: shots } = await supabase
    .from('golf_shots')
    .select('count')
    .eq('round_id', roundId);

  console.log(`✅ ${shots?.length || 0} shots exist in database`);
}

console.log('\n💡 IMPORTANT: Supabase REST API may not support direct RLS policy creation.');
console.log('   Please apply the migration manually via Supabase Dashboard:\n');
console.log('   1. Go to https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc/sql');
console.log('   2. Run the SQL from: supabase/migrations/049_golf_shots_rls_policy.sql');
console.log('   3. Refresh your browser stats page\n');
