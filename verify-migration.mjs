import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyMigration() {
  console.log('Testing event creation with null team_id...\n');

  // Try to insert an event with null team_id and created_by
  const { data, error } = await supabase
    .from('golf_events')
    .insert({
      team_id: null,
      created_by: null,
      title: 'Test Personal Event',
      event_type: 'practice',
      start_date: '2026-01-15',
      all_day: true,
    })
    .select()
    .single();

  if (error) {
    console.log('❌ Migration failed or incomplete!');
    console.log('Error code:', error.code);
    console.log('Error message:', error.message);
    console.log('\nFull error:', error);

    if (error.code === '23502') {
      console.log('\n⚠️  The NOT NULL constraint is still in place.');
      console.log('Please verify the SQL ran successfully in Supabase Dashboard.');
    }
  } else {
    console.log('✅ SUCCESS! Migration worked!');
    console.log('Created event:', data);

    // Clean up
    await supabase.from('golf_events').delete().eq('id', data.id);
    console.log('✅ Test event cleaned up\n');
    console.log('Calendar events should now work for players!');
  }
}

verifyMigration();
