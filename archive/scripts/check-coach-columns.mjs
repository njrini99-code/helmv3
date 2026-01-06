import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Checking golf_coaches table columns...\n');

// Get one coach record to see available columns
const { data, error } = await supabase
  .from('golf_coaches')
  .select('*')
  .limit(1)
  .maybeSingle();

if (error) {
  console.log('Error:', error.message);
} else if (!data) {
  console.log('No coach records found');
} else {
  console.log('Available columns in golf_coaches:');
  console.log(Object.keys(data));
}
