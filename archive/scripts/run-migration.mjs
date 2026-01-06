import { createClient } from '@supabase/supabase-js';

const url = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(url, key);

async function runMigration() {
  console.log('🚀 Running migration...\n');

  // Step 1: Check current state
  const { data: before, error: beforeErr } = await supabase
    .from('golf_rounds')
    .select('id')
    .limit(1);

  if (!beforeErr) {
    console.log('✅ Can query golf_rounds');
  }

  console.log('\n⚠️  MIGRATION MUST BE RUN VIA SUPABASE DASHBOARD SQL EDITOR\n');
  console.log('1. Go to: https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc/sql/new');
  console.log('2. Paste the SQL from: supabase/migrations/080_add_round_status_tracking.sql');
  console.log('3. Click "Run"');
  console.log('\nOR run via psql if you have direct access\n');
}

runMigration().catch(console.error);
