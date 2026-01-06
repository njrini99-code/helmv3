import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

// Check if team_id is nullable in golf_events
const { data, error } = await supabase
  .rpc('exec_sql', {
    sql: `
      SELECT
        column_name,
        is_nullable,
        data_type,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'golf_events'
        AND column_name IN ('team_id', 'created_by');
    `
  })
  .single();

if (error) {
  console.error('Error:', error);

  // Try alternate method
  console.log('\nTrying alternate method...');

  // Just try to insert a test event with null team_id to see what error we get
  const { error: insertError } = await supabase
    .from('golf_events')
    .insert({
      team_id: null,
      title: 'Test Event',
      event_type: 'practice',
      start_date: '2026-01-15',
      all_day: true,
    })
    .select();

  if (insertError) {
    console.log('\n❌ Cannot insert event with team_id = null');
    console.log('Error:', insertError.message);
    console.log('Code:', insertError.code);
    console.log('\n→ team_id is likely NOT NULLABLE in the database schema');
  } else {
    console.log('\n✅ Can insert event with team_id = null');
    console.log('→ team_id IS NULLABLE');
  }
} else {
  console.log('\ngolf_events schema:', data);
}
