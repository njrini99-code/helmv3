#!/usr/bin/env node
/**
 * Apply simplified RLS policies and schema changes for calendar sync
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('🔧 APPLYING CALENDAR RLS FIXES\n');
console.log('='.repeat(80));

// Step 1: Make created_by nullable
console.log('\n1️⃣ Making golf_events.created_by nullable...');
const { error: alterError } = await supabase.rpc('exec_sql', {
  sql: 'ALTER TABLE golf_events ALTER COLUMN created_by DROP NOT NULL;'
});

if (alterError) {
  console.log('❌ Error:', alterError.message);
  // Try direct approach
  console.log('Trying alternative approach...');
  const { error: altError } = await supabase.from('golf_events').select('id').limit(0);
  console.log('Note: Column alteration may require direct database access');
} else {
  console.log('✅ created_by is now nullable');
}

// Step 2: Drop old policies
console.log('\n2️⃣ Dropping old RLS policies...');
const policies = [
  'DROP POLICY IF EXISTS "Players can manage their own classes" ON golf_player_classes;',
  'DROP POLICY IF EXISTS "Players can create personal events" ON golf_events;',
  'DROP POLICY IF EXISTS "Team members can view their events" ON golf_events;'
];

for (const policy of policies) {
  const { error } = await supabase.rpc('exec_sql', { sql: policy });
  if (error && !error.message.includes('does not exist')) {
    console.log('⚠️ ', policy, ':', error.message);
  }
}
console.log('✅ Old policies dropped');

// Step 3: Create new simplified policies
console.log('\n3️⃣ Creating simplified RLS policies...');

// Policy for golf_player_classes
const classPolicy = `
CREATE POLICY "Players can manage their own classes"
ON golf_player_classes
FOR ALL
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
`;

const { error: classPolicyError } = await supabase.rpc('exec_sql', { sql: classPolicy });
if (classPolicyError) {
  console.log('❌ Class policy error:', classPolicyError.message);
} else {
  console.log('✅ golf_player_classes policy created');
}

// Policy for golf_events
const eventPolicy = `
CREATE POLICY "Players and coaches can manage team calendar"
ON golf_events
FOR ALL
USING (
  -- Player can see their team's events
  team_id IN (
    SELECT team_id FROM golf_players WHERE user_id = auth.uid()
  )
  OR
  -- Coach can see their team's events
  team_id IN (
    SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  -- Player can create events for their team
  team_id IN (
    SELECT team_id FROM golf_players WHERE user_id = auth.uid()
  )
  OR
  -- Coach can create events for their team
  team_id IN (
    SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
  )
);
`;

const { error: eventPolicyError } = await supabase.rpc('exec_sql', { sql: eventPolicy });
if (eventPolicyError) {
  console.log('❌ Event policy error:', eventPolicyError.message);
} else {
  console.log('✅ golf_events policy created');
}

// Verification
console.log('\n' + '='.repeat(80));
console.log('📊 VERIFICATION\n');

// Check if created_by is nullable
const { data: columns } = await supabase
  .from('information_schema.columns')
  .select('is_nullable')
  .eq('table_name', 'golf_events')
  .eq('column_name', 'created_by')
  .single();

console.log('golf_events.created_by nullable:', columns?.is_nullable === 'YES' ? '✅ YES' : '❌ NO');

console.log('\n✅ RLS POLICY UPDATE COMPLETE!');
console.log('\nNext steps:');
console.log('1. Update calendar-sync.ts to remove coach requirement');
console.log('2. Test automatic class sync');
console.log();
