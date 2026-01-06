#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('🔧 Applying RLS Policy Fixes via Supabase REST API\n');

// Individual policy creation statements
const policies = [
  {
    name: 'Drop existing golf_players SELECT policy',
    sql: `DROP POLICY IF EXISTS "Users can view their own golf player profile" ON golf_players`
  },
  {
    name: 'Drop existing golf_players UPDATE policy',
    sql: `DROP POLICY IF EXISTS "Users can update their own golf player profile" ON golf_players`
  },
  {
    name: 'Drop existing golf_players INSERT policy',
    sql: `DROP POLICY IF EXISTS "Users can create their own golf player profile" ON golf_players`
  },
  {
    name: 'Drop existing golf_coaches SELECT policy',
    sql: `DROP POLICY IF EXISTS "Users can view their own golf coach profile" ON golf_coaches`
  },
  {
    name: 'Drop existing golf_coaches UPDATE policy',
    sql: `DROP POLICY IF EXISTS "Users can update their own golf coach profile" ON golf_coaches`
  },
  {
    name: 'Drop existing golf_coaches INSERT policy',
    sql: `DROP POLICY IF EXISTS "Users can create their own golf coach profile" ON golf_coaches`
  },
  {
    name: 'Create golf_players SELECT policy',
    sql: `CREATE POLICY "Users can view their own golf player profile" ON golf_players FOR SELECT TO authenticated USING (auth.uid() = user_id)`
  },
  {
    name: 'Create golf_players UPDATE policy',
    sql: `CREATE POLICY "Users can update their own golf player profile" ON golf_players FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
  },
  {
    name: 'Create golf_players INSERT policy',
    sql: `CREATE POLICY "Users can create their own golf player profile" ON golf_players FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)`
  },
  {
    name: 'Create golf_coaches SELECT policy',
    sql: `CREATE POLICY "Users can view their own golf coach profile" ON golf_coaches FOR SELECT TO authenticated USING (auth.uid() = user_id)`
  },
  {
    name: 'Create golf_coaches UPDATE policy',
    sql: `CREATE POLICY "Users can update their own golf coach profile" ON golf_coaches FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
  },
  {
    name: 'Create golf_coaches INSERT policy',
    sql: `CREATE POLICY "Users can create their own golf coach profile" ON golf_coaches FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)`
  }
];

console.log(`Executing ${policies.length} policy statements...\n`);

let successCount = 0;
let errorCount = 0;

for (const policy of policies) {
  console.log(`📝 ${policy.name}...`);

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify({ query: policy.sql })
    });

    if (!response.ok) {
      const error = await response.text();
      console.log(`   ❌ Failed: ${error.substring(0, 100)}`);
      errorCount++;
    } else {
      console.log('   ✅ Success');
      successCount++;
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    errorCount++;
  }

  // Small delay to avoid rate limiting
  await new Promise(resolve => setTimeout(resolve, 100));
}

console.log('\n' + '='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
console.log(`✅ Successful: ${successCount}`);
console.log(`❌ Failed: ${errorCount}`);

if (errorCount > 0) {
  console.log('\n⚠️  Some policies failed to apply via REST API');
  console.log('📋 Manual method - Run in Supabase Dashboard SQL Editor:');
  console.log('   1. https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc/sql');
  console.log('   2. Copy contents of FIX_GOLF_RLS_POLICIES.sql');
  console.log('   3. Paste and Run');
} else {
  console.log('\n✅ All policies applied successfully!');
  console.log('🎉 You should now be able to access the dashboard');
  console.log('\nNext steps:');
  console.log('   1. Clear browser cache/cookies');
  console.log('   2. Go to /golf/login');
  console.log('   3. Dashboard should load normally!');
}
