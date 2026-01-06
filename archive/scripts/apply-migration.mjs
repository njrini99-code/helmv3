import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: {
    schema: 'public',
  },
  auth: {
    persistSession: false,
  },
});

async function applyMigration() {
  console.log('Applying migration to make team_id and created_by nullable...\n');

  // Make team_id nullable
  const { error: teamIdError } = await supabase.rpc('exec', {
    sql: 'ALTER TABLE golf_events ALTER COLUMN team_id DROP NOT NULL;'
  });

  if (teamIdError) {
    console.log('Trying direct query for team_id...');

    // Try using a direct SQL approach
    const { data, error } = await supabase
      .from('golf_events')
      .select('team_id')
      .limit(0);

    console.log('Current schema check:', { data, error });
  }

  // Use the Postgres REST API to run raw SQL
  const response1 = await fetch(
    `${supabaseUrl}/rest/v1/rpc/exec`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        sql: 'ALTER TABLE golf_events ALTER COLUMN team_id DROP NOT NULL;'
      })
    }
  );

  console.log('team_id response:', response1.status, await response1.text());

  const response2 = await fetch(
    `${supabaseUrl}/rest/v1/rpc/exec`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        sql: 'ALTER TABLE golf_events ALTER COLUMN created_by DROP NOT NULL;'
      })
    }
  );

  console.log('created_by response:', response2.status, await response2.text());

  console.log('\nMigration complete! Verifying...');

  // Test insert
  const { error: insertError } = await supabase
    .from('golf_events')
    .insert({
      team_id: null,
      title: 'Test Personal Event',
      event_type: 'practice',
      start_date: '2026-01-15',
      all_day: true,
    })
    .select();

  if (insertError) {
    console.log('❌ Still cannot insert with null team_id:', insertError.message);
  } else {
    console.log('✅ SUCCESS! Can now insert events with null team_id');
  }
}

applyMigration();
