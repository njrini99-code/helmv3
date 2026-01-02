import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('=== CHECKING GOLF SHOT TRACKING SCHEMA ===\n');

// Check if golf_shots table exists
const { data: tables, error: tablesError } = await supabase
  .from('information_schema.tables')
  .select('table_name')
  .eq('table_schema', 'public')
  .like('table_name', '%shot%');

console.log('Tables with "shot" in name:');
console.log(tables);

// Try to describe golf_shots if it exists
const { data: columns, error: columnsError } = await supabase
  .from('information_schema.columns')
  .select('column_name, data_type, is_nullable')
  .eq('table_schema', 'public')
  .eq('table_name', 'golf_shots')
  .order('ordinal_position');

console.log('\ngolf_shots columns:');
if (columnsError) {
  console.log('Error:', columnsError.message);
} else if (!columns || columns.length === 0) {
  console.log('No golf_shots table found');
} else {
  console.table(columns);
}

// Check golf_round_holes columns to see if shots are embedded there
const { data: holeColumns, error: holeError } = await supabase
  .from('information_schema.columns')
  .select('column_name, data_type, is_nullable')
  .eq('table_schema', 'public')
  .eq('table_name', 'golf_round_holes')
  .order('ordinal_position');

console.log('\ngolf_round_holes columns:');
if (holeColumns) {
  console.table(holeColumns);
}
