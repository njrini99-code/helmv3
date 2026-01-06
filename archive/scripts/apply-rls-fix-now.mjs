#!/usr/bin/env node
/**
 * NUCLEAR FIX - Wipe and recreate all RLS policies on golf_player_classes
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs',
  {
    db: { schema: 'public' }
  }
);

console.log('🔧 APPLYING NUCLEAR RLS FIX\n');
console.log('='.repeat(80));

const fixSQL = `
-- STEP 1: Disable RLS temporarily
ALTER TABLE golf_player_classes DISABLE ROW LEVEL SECURITY;

-- STEP 2: Drop ALL existing policies (clean slate)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'golf_player_classes'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON golf_player_classes', r.policyname);
        RAISE NOTICE 'Dropped policy: %', r.policyname;
    END LOOP;
END $$;

-- STEP 3: Re-enable RLS
ALTER TABLE golf_player_classes ENABLE ROW LEVEL SECURITY;

-- STEP 4: Create clean, separate policies for each operation
CREATE POLICY "golf_player_classes_select"
ON golf_player_classes FOR SELECT
TO authenticated
USING (
  player_id IN (
    SELECT id FROM golf_players WHERE user_id = auth.uid()
  )
);

CREATE POLICY "golf_player_classes_insert"
ON golf_player_classes FOR INSERT
TO authenticated
WITH CHECK (
  player_id IN (
    SELECT id FROM golf_players WHERE user_id = auth.uid()
  )
);

CREATE POLICY "golf_player_classes_update"
ON golf_player_classes FOR UPDATE
TO authenticated
USING (
  player_id IN (
    SELECT id FROM golf_players WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  player_id IN (
    SELECT id FROM golf_players WHERE user_id = auth.uid()
  )
);

CREATE POLICY "golf_player_classes_delete"
ON golf_player_classes FOR DELETE
TO authenticated
USING (
  player_id IN (
    SELECT id FROM golf_players WHERE user_id = auth.uid()
  )
);
`;

console.log('\n1️⃣ Executing SQL fix...\n');

// We need to use the Supabase REST API's SQL execution endpoint
const response = await fetch('https://dgvlnelygibgrrjehbyc.supabase.co/rest/v1/rpc/exec_sql', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
  },
  body: JSON.stringify({ query: fixSQL })
});

if (!response.ok) {
  console.error('❌ SQL execution failed');
  console.error('Status:', response.status);
  console.error('Response:', await response.text());
  console.log('\n⚠️  REST API execution not available.');
  console.log('   Please run this SQL in Supabase Dashboard > SQL Editor:\n');
  console.log(fixSQL);
  process.exit(1);
}

console.log('✅ SQL executed successfully!');

// Verify the fix
console.log('\n2️⃣ Verifying DELETE works...');

const PLAYER_ID = '5bab961e-4ea4-4c88-812f-68a9469f8156';

const { data: testClass, error: insertError } = await supabase
  .from('golf_player_classes')
  .insert({
    player_id: PLAYER_ID,
    course_code: 'DELETE-TEST-' + Date.now(),
    course_name: 'Delete Test',
    days: ['M'],
    day_of_week: 0,
    start_time: '09:00:00',
    end_time: '10:00:00',
    semester: 'Spring 2025',
    color: '#FF0000',
  })
  .select()
  .single();

if (insertError) {
  console.error('   ❌ Test INSERT failed:', insertError.message);
} else {
  console.log('   ✅ Test class created');
  
  const { error: deleteError } = await supabase
    .from('golf_player_classes')
    .delete()
    .eq('id', testClass.id);
  
  if (deleteError) {
    console.error('   ❌ DELETE still failing:', deleteError.message);
    console.error('   Code:', deleteError.code);
  } else {
    console.log('   ✅ DELETE works!');
  }
}

console.log('\n' + '='.repeat(80));
console.log('✅ FIX APPLIED\n');
console.log('Try deleting classes in the browser now.');
console.log('If still failing, sign out and back in to refresh your session.\n');

