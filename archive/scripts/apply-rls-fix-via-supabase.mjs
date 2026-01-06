import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, serviceKey);

console.log('🔧 Applying RLS fix for golf_events table...\n');

// The RLS policy SQL we need to run
const rlsSQL = `
-- Drop ALL existing INSERT policies
DROP POLICY IF EXISTS "Users can insert events for their team" ON golf_events;
DROP POLICY IF EXISTS "Coaches can insert events" ON golf_events;
DROP POLICY IF EXISTS "Allow event creation" ON golf_events;
DROP POLICY IF EXISTS "Allow users to create events" ON golf_events;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON golf_events;

-- Create a simple policy that allows any authenticated user to insert events
CREATE POLICY "Enable insert for authenticated users"
ON golf_events
FOR INSERT
TO authenticated
WITH CHECK (true);
`;

console.log('📝 SQL to execute:');
console.log(rlsSQL);
console.log('\n⚠️  This script cannot execute the SQL directly through Supabase client.');
console.log('The Supabase JavaScript client does not have a way to execute raw DDL commands.\n');

console.log('✅ SOLUTION: Run this SQL in Supabase Dashboard:\n');
console.log('1. Go to https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc');
console.log('2. Click "SQL Editor" in the left sidebar');
console.log('3. Click "+ New query"');
console.log('4. Paste the SQL below:');
console.log('5. Click "Run"\n');

console.log('─'.repeat(80));
console.log(rlsSQL);
console.log('─'.repeat(80));

console.log('\n✅ After running the SQL, test by creating an event in the app.');
console.log('   The error "new row violates row-level security policy" should be gone.\n');
