#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔧 Applying Comprehensive Golf RLS Policies...\n');

// SQL to apply all golf table RLS policies
const rlsPolicies = `
-- ============================================================================
-- GOLF_SHOTS TABLE - CRITICAL FOR STATS
-- ============================================================================

ALTER TABLE golf_shots ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Players can read their own shots" ON golf_shots;
DROP POLICY IF EXISTS "Coaches can read their team shots" ON golf_shots;
DROP POLICY IF EXISTS "Players can insert their own shots" ON golf_shots;
DROP POLICY IF EXISTS "Players can update their own shots" ON golf_shots;
DROP POLICY IF EXISTS "Players can delete their own shots" ON golf_shots;
DROP POLICY IF EXISTS "Authenticated users can access golf_shots" ON golf_shots;

-- Players can read their own shots
CREATE POLICY "Players can read their own shots"
ON golf_shots FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM golf_rounds
    WHERE golf_rounds.id = golf_shots.round_id
    AND golf_rounds.player_id IN (
      SELECT id FROM golf_players
      WHERE user_id = auth.uid()
    )
  )
);

-- Coaches can read their team's shots
CREATE POLICY "Coaches can read their team shots"
ON golf_shots FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM golf_rounds
    JOIN golf_players ON golf_players.id = golf_rounds.player_id
    WHERE golf_rounds.id = golf_shots.round_id
    AND golf_players.team_id IN (
      SELECT team_id FROM golf_coaches
      WHERE user_id = auth.uid()
    )
  )
);

-- Players can insert their own shots
CREATE POLICY "Players can insert their own shots"
ON golf_shots FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM golf_rounds
    WHERE golf_rounds.id = golf_shots.round_id
    AND golf_rounds.player_id IN (
      SELECT id FROM golf_players
      WHERE user_id = auth.uid()
    )
  )
);

-- Players can update their own shots
CREATE POLICY "Players can update their own shots"
ON golf_shots FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM golf_rounds
    WHERE golf_rounds.id = golf_shots.round_id
    AND golf_rounds.player_id IN (
      SELECT id FROM golf_players
      WHERE user_id = auth.uid()
    )
  )
);

-- Players can delete their own shots
CREATE POLICY "Players can delete their own shots"
ON golf_shots FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM golf_rounds
    WHERE golf_rounds.id = golf_shots.round_id
    AND golf_rounds.player_id IN (
      SELECT id FROM golf_players
      WHERE user_id = auth.uid()
    )
  )
);

-- ============================================================================
-- GOLF_ROUNDS TABLE - CRITICAL FOR STATS
-- ============================================================================

ALTER TABLE golf_rounds ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Players can read their own rounds" ON golf_rounds;
DROP POLICY IF EXISTS "Coaches can read their team rounds" ON golf_rounds;
DROP POLICY IF EXISTS "Players can insert their own rounds" ON golf_rounds;
DROP POLICY IF EXISTS "Players can update their own rounds" ON golf_rounds;
DROP POLICY IF EXISTS "Players can delete their own rounds" ON golf_rounds;

-- Players can read their own rounds
CREATE POLICY "Players can read their own rounds"
ON golf_rounds FOR SELECT
USING (
  player_id IN (
    SELECT id FROM golf_players
    WHERE user_id = auth.uid()
  )
);

-- Coaches can read their team's rounds
CREATE POLICY "Coaches can read their team rounds"
ON golf_rounds FOR SELECT
USING (
  player_id IN (
    SELECT gp.id
    FROM golf_players gp
    WHERE gp.team_id IN (
      SELECT team_id FROM golf_coaches
      WHERE user_id = auth.uid()
    )
  )
);

-- Players can insert their own rounds
CREATE POLICY "Players can insert their own rounds"
ON golf_rounds FOR INSERT
WITH CHECK (
  player_id IN (
    SELECT id FROM golf_players
    WHERE user_id = auth.uid()
  )
);

-- Players can update their own rounds
CREATE POLICY "Players can update their own rounds"
ON golf_rounds FOR UPDATE
USING (
  player_id IN (
    SELECT id FROM golf_players
    WHERE user_id = auth.uid()
  )
);

-- Players can delete their own rounds
CREATE POLICY "Players can delete their own rounds"
ON golf_rounds FOR DELETE
USING (
  player_id IN (
    SELECT id FROM golf_players
    WHERE user_id = auth.uid()
  )
);

-- ============================================================================
-- GOLF_EVENTS TABLE
-- ============================================================================

ALTER TABLE golf_events ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Coaches can manage their events" ON golf_events;
DROP POLICY IF EXISTS "Team members can view their events" ON golf_events;

-- Coaches can manage their events
CREATE POLICY "Coaches can manage their events"
ON golf_events FOR ALL
USING (
  team_id IN (
    SELECT team_id FROM golf_coaches
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  team_id IN (
    SELECT team_id FROM golf_coaches
    WHERE user_id = auth.uid()
  )
);

-- Team members can view their events
CREATE POLICY "Team members can view their events"
ON golf_events FOR SELECT
USING (
  team_id IN (
    SELECT team_id FROM golf_players
    WHERE user_id = auth.uid()
  )
);

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON golf_shots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON golf_rounds TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON golf_events TO authenticated;
`;

// Apply the policies
try {
  console.log('📝 Applying RLS policies...\n');

  // Note: We can't execute raw SQL directly through the Supabase client
  // We need to save this as a migration and apply it through Supabase Dashboard
  // or use the Supabase CLI

  console.log('✅ RLS policies have been prepared.\n');
  console.log('📋 To apply these policies, you have two options:\n');
  console.log('Option 1: Run in Supabase Dashboard SQL Editor');
  console.log('   1. Go to https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc/sql');
  console.log('   2. Copy the SQL from supabase/migrations/050_complete_golf_rls.sql');
  console.log('   3. Click "Run"\n');
  console.log('Option 2: Use psql (if connection works)');
  console.log('   psql -h db.dgvlnelygibgrrjehbyc.supabase.co -p 5432 -U postgres -f supabase/migrations/050_complete_golf_rls.sql\n');

  // Save to migration file
  const fs = await import('fs');
  await fs.promises.writeFile(
    'supabase/migrations/050_complete_golf_rls.sql',
    rlsPolicies
  );

  console.log('✅ Migration saved to: supabase/migrations/050_complete_golf_rls.sql\n');

  console.log('🔍 Verifying current state...\n');

  // Test with player credentials
  const playerUserId = '5bab961e-4ea4-4c88-812f-68a9469f8156';
  const { data: playerData } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', playerUserId)
    .single();

  if (playerData) {
    console.log('✅ Found player ID:', playerData.id);

    // Try to fetch rounds (with service key - bypasses RLS)
    const { data: rounds, error: roundsError } = await supabase
      .from('golf_rounds')
      .select('id')
      .eq('player_id', playerData.id);

    if (roundsError) {
      console.log('❌ Error fetching rounds:', roundsError.message);
    } else {
      console.log('✅ Found rounds:', rounds?.length || 0);

      if (rounds && rounds.length > 0) {
        // Try to fetch shots (with service key - bypasses RLS)
        const { data: shots, error: shotsError } = await supabase
          .from('golf_shots')
          .select('id')
          .in('round_id', rounds.map(r => r.id));

        if (shotsError) {
          console.log('❌ Error fetching shots:', shotsError.message);
        } else {
          console.log('✅ Found shots:', shots?.length || 0);
        }
      }
    }
  }

  console.log('\n⚠️  NEXT STEPS:');
  console.log('1. Apply the migration through Supabase Dashboard SQL Editor');
  console.log('2. Verify stats are still working on the frontend');
  console.log('3. RLS will be properly secured after applying this migration\n');

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
