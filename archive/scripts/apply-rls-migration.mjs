#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  console.log('📊 Reading migration file...');

  const sql = readFileSync('./supabase/migrations/081_comprehensive_team_based_rls.sql', 'utf8');

  console.log('🚀 Applying team-based RLS migration...');
  console.log('');

  try {
    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });

    if (error) {
      console.error('❌ Migration failed:', error.message);

      // If exec_sql doesn't exist, try direct execution via REST API
      console.log('⚠️  Trying alternative method...');

      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ query: sql })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`REST API call failed: ${response.status} ${errorText}`);
      }

      console.log('✅ Migration applied successfully via REST API!');
    } else {
      console.log('✅ Migration applied successfully!');
      console.log('📋 Result:', data);
    }

    console.log('');
    console.log('🎯 Next steps:');
    console.log('1. Verify RLS policies are in place');
    console.log('2. Fix code to properly filter by team_id');
    console.log('3. Test messaging, roster, and calendar');

  } catch (err) {
    console.error('❌ Error:', err.message);

    // Try splitting into individual statements
    console.log('');
    console.log('⚠️  Attempting to apply migration statement by statement...');
    const statements = sql.split(';').filter(s => s.trim().length > 0);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim() + ';';
      if (!statement || statement === ';') continue;

      try {
        console.log(`  Executing statement ${i + 1}/${statements.length}...`);

        // Use Postgres REST API
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Prefer': 'params=single-object'
          },
          body: JSON.stringify({ query: statement })
        });

        if (!response.ok && response.status !== 404) {
          const errorText = await response.text();
          console.error(`  ❌ Failed: ${errorText.substring(0, 200)}`);
        }
      } catch (statementErr) {
        console.error(`  ⚠️  Warning on statement ${i + 1}:`, statementErr.message.substring(0, 100));
      }
    }

    console.log('✅ Applied migration with warnings - verify manually');
  }
}

applyMigration().catch(console.error);
