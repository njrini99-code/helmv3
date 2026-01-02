#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔒 Fixing golf_events RLS Policy...\n');

// SQL to fix golf_events RLS
const rlsFixSql = `
-- Fix golf_events RLS policy
ALTER TABLE golf_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Coaches can manage their events" ON golf_events;
DROP POLICY IF EXISTS "Team members can view their events" ON golf_events;
DROP POLICY IF EXISTS "Public can view all events" ON golf_events;

-- Coaches can manage their events (team_id can be null for unassigned events)
CREATE POLICY "Coaches can manage their events"
ON golf_events FOR ALL
USING (
  team_id IS NULL OR
  team_id IN (
    SELECT team_id FROM golf_coaches
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  team_id IS NULL OR
  team_id IN (
    SELECT team_id FROM golf_coaches
    WHERE user_id = auth.uid()
  )
);

-- Team members can view their team's events
CREATE POLICY "Team members can view their events"
ON golf_events FOR SELECT
USING (
  team_id IN (
    SELECT team_id FROM golf_players
    WHERE user_id = auth.uid()
  )
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON golf_events TO authenticated;
`;

// Save migration
await fs.writeFile(
  'supabase/migrations/051_fix_golf_events_rls.sql',
  rlsFixSql
);

console.log('✅ Migration saved to: supabase/migrations/051_fix_golf_events_rls.sql\n');

// Check current golf_events state
console.log('🔍 Current golf_events data:\n');
const { data: events, error } = await supabase
  .from('golf_events')
  .select('*');

if (error) {
  console.log('❌ Error:', error.message);
} else {
  console.log(`📊 Found ${events?.length || 0} events:`);
  for (const event of events || []) {
    console.log(`   - ${event.title} (Team ID: ${event.team_id || 'NULL'})`);
    console.log(`     Date: ${event.event_date}`);
    console.log(`     Type: ${event.event_type}`);
  }
}

// Check player data
console.log('\n🔍 Checking player data:\n');
const { data: players, error: playerError } = await supabase
  .from('golf_players')
  .select('*');

if (playerError) {
  console.log('❌ Error:', playerError.message);
} else {
  console.log(`📊 Found ${players?.length || 0} players:`);
  for (const player of players || []) {
    console.log(`   - ${player.first_name} ${player.last_name}`);
    console.log(`     User ID: ${player.user_id}`);
    console.log(`     Email: ${player.email}`);
    console.log(`     Team ID: ${player.team_id || 'NULL'}`);

    // Get rounds for this player
    const { data: rounds } = await supabase
      .from('golf_rounds')
      .select('id, course_name, total_score')
      .eq('player_id', player.id);

    console.log(`     Rounds: ${rounds?.length || 0}`);

    if (rounds && rounds.length > 0) {
      for (const round of rounds) {
        console.log(`        - ${round.course_name} (Score: ${round.total_score})`);

        // Get shots for this round
        const { data: shots } = await supabase
          .from('golf_shots')
          .select('id, hole_number, shot_number')
          .eq('round_id', round.id);

        console.log(`          Shots: ${shots?.length || 0}`);
      }
    }
  }
}

console.log('\n📋 NEXT STEPS:');
console.log('1. Run this SQL in Supabase Dashboard SQL Editor:');
console.log('   https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc/sql');
console.log('2. Copy content from: supabase/migrations/051_fix_golf_events_rls.sql');
console.log('3. Click "Run" to apply the RLS policy');
console.log('4. Verify that anonymous users can no longer access golf_events\n');
