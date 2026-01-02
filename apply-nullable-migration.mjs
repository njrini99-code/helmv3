import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

console.log('Applying migration to make team_id and created_by nullable...\n');

// Use the Supabase Management API to run SQL
async function runSQL(sql) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Prefer': 'params=single-object'
    },
    body: JSON.stringify({ query: sql })
  });

  const text = await response.text();
  return { status: response.status, body: text };
}

// Try different approaches
console.log('Method 1: Using fetch to Supabase REST API...');
const result1 = await runSQL('ALTER TABLE golf_events ALTER COLUMN team_id DROP NOT NULL;');
console.log('Response:', result1);

// Method 2: Use Supabase client with raw SQL query
console.log('\nMethod 2: Using direct HTTP to Management API...');

const managementApiUrl = `https://${supabaseUrl.replace('https://', '')}/rest/v1/`;

// Try using query parameter
const sql = `
ALTER TABLE golf_events ALTER COLUMN team_id DROP NOT NULL;
ALTER TABLE golf_events ALTER COLUMN created_by DROP NOT NULL;
`;

const response = await fetch(`${supabaseUrl}/rest/v1/rpc/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': supabaseServiceKey,
    'Authorization': `Bearer ${supabaseServiceKey}`,
  },
  body: JSON.stringify({
    query: 'ALTER TABLE golf_events ALTER COLUMN team_id DROP NOT NULL;'
  })
});

console.log('Status:', response.status);
console.log('Response:', await response.text());

// Method 3: Try to use pg package if available
console.log('\nMethod 3: Checking if we can import pg package...');
try {
  const pg = await import('pg');
  const { Client } = pg.default;

  const connectionString = `postgresql://postgres.dgvlnelygibgrrjehbyc:EHl4yASa9zM1sb1k@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;

  const client = new Client({ connectionString });

  console.log('Connecting to database...');
  await client.connect();

  console.log('Running migration...');
  await client.query('ALTER TABLE golf_events ALTER COLUMN team_id DROP NOT NULL;');
  console.log('✅ team_id is now nullable');

  await client.query('ALTER TABLE golf_events ALTER COLUMN created_by DROP NOT NULL;');
  console.log('✅ created_by is now nullable');

  await client.end();

  console.log('\n✅ Migration successful!');
} catch (pgError) {
  console.log('pg package not available, trying alternative...');
  console.log('Error:', pgError.message);

  // Alternative: Use HTTP-based SQL execution through Supabase's database webhooks
  console.log('\nMethod 4: Direct database modification attempt...');

  // We need to manually apply this via Supabase dashboard
  console.log(`
⚠️  Unable to run migration via Node.js.

Please run this SQL in Supabase Dashboard:

1. Go to: https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc/sql/new
2. Paste this SQL:

ALTER TABLE golf_events
ALTER COLUMN team_id DROP NOT NULL;

ALTER TABLE golf_events
ALTER COLUMN created_by DROP NOT NULL;

3. Click "Run"

Then refresh your app and try creating an event again!
  `);
}
