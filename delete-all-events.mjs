import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTkzMDg2OCwiZXhwIjoyMDUxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
);

console.log('🗑️  Deleting all golf_events...');

const { error } = await supabase
  .from('golf_events')
  .delete()
  .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

if (error) {
  console.error('❌ Error:', error);
} else {
  console.log('✅ All golf_events deleted!');
  console.log('📝 Now re-sync your classes from the Classes page');
}
