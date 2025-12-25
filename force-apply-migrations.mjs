import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function forceApply() {
  console.log('\n=== FORCE APPLYING RLS MIGRATIONS ===\n');

  // Read migration files
  const migration1 = readFileSync('/Users/ricknini/Downloads/helmv3/supabase/migrations/20251225000028_fix_golf_rounds_insert.sql', 'utf8');
  const migration2 = readFileSync('/Users/ricknini/Downloads/helmv3/supabase/migrations/20251225000029_fix_golf_holes_insert.sql', 'utf8');

  console.log('[1/2] Applying golf_rounds RLS fix...');
  console.log(migration1);
  console.log();

  const { data: data1, error: error1 } = await supabase.rpc('exec_sql', {
    query: migration1
  });

  if (error1) {
    console.log('Note: exec_sql RPC might not exist, trying alternative...\n');

    // Execute manually by splitting statements
    const statements1 = migration1
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    for (const stmt of statements1) {
      console.log(`Executing: ${stmt.substring(0, 50)}...`);
      // We can't execute DDL through the REST API easily
      // The migrations MUST be applied via supabase db push
    }
  }

  console.log('\n[2/2] Applying golf_holes RLS fix...');
  console.log(migration2);

  console.log('\n⚠️  IMPORTANT:');
  console.log('These migrations MUST be applied via Supabase CLI:');
  console.log('\n  npx supabase db push\n');
  console.log('If that is not working, apply manually in Supabase Dashboard:');
  console.log('  1. Go to https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc/sql');
  console.log('  2. Run migration 1 (golf_rounds):');
  console.log('     ' + migration1.replace(/\n/g, '\n     '));
  console.log('\n  3. Run migration 2 (golf_holes):');
  console.log('     ' + migration2.replace(/\n/g, '\n     '));
  console.log();
}

forceApply().catch(console.error);
