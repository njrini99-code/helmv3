#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔍 Debugging player stats for rinin376@gmail.com...\n');

// 1. Find the user
const { data: users } = await supabase.auth.admin.listUsers();
const user = users.users.find(u => u.email === 'rinin376@gmail.com');

if (!user) {
  console.log('❌ User not found with email rinin376@gmail.com');
  process.exit(1);
}

console.log('✅ User found:', user.id, user.email);

// 2. Check if player record exists
const { data: player, error: playerError } = await supabase
  .from('golf_players')
  .select('*')
  .eq('user_id', user.id)
  .single();

if (playerError) {
  console.log('❌ Player record error:', playerError.message);
  process.exit(1);
}

console.log('✅ Player record:', {
  id: player.id,
  name: `${player.first_name} ${player.last_name}`,
  team_id: player.team_id
});

// 3. Check rounds
const { data: rounds } = await supabase
  .from('golf_rounds')
  .select('id, round_date, course_name, total_score')
  .eq('player_id', player.id);

console.log(`\n✅ Rounds found: ${rounds?.length || 0}`);
if (rounds) {
  rounds.forEach(r => console.log(`  - ${r.course_name} on ${r.round_date} (${r.total_score})`));
}

// 4. Check holes
const roundIds = rounds?.map(r => r.id) || [];
const { data: holes } = await supabase
  .from('golf_holes')
  .select('id, hole_number, par')
  .in('round_id', roundIds);

console.log(`\n✅ Holes found: ${holes?.length || 0}`);

// 5. Check shots with proper types
const { data: shots } = await supabase
  .from('golf_shots')
  .select('*')
  .in('round_id', roundIds)
  .order('hole_number')
  .order('shot_number');

console.log(`\n✅ Total shots found: ${shots?.length || 0}`);

if (shots && shots.length > 0) {
  // Check for nulls in critical fields
  const shotsWithNulls = shots.filter(s =>
    s.distance_to_hole_before === null ||
    s.distance_to_hole_after === null ||
    s.shot_distance === null
  );

  console.log(`\n⚠️  Shots with null distances: ${shotsWithNulls.length}/${shots.length}`);

  if (shotsWithNulls.length > 0) {
    console.log('\nSample shots with nulls:');
    console.table(shotsWithNulls.slice(0, 5).map(s => ({
      hole: s.hole_number,
      shot: s.shot_number,
      before: s.distance_to_hole_before,
      after: s.distance_to_hole_after,
      distance: s.shot_distance
    })));
  }

  // Sample valid shots
  const validShots = shots.filter(s =>
    s.distance_to_hole_before !== null &&
    s.distance_to_hole_after !== null &&
    s.shot_distance !== null
  );

  console.log(`\n✅ Valid shots (with all distances): ${validShots.length}/${shots.length}`);

  if (validShots.length > 0) {
    console.log('\nSample valid shots:');
    console.table(validShots.slice(0, 10).map(s => ({
      hole: s.hole_number,
      shot: s.shot_number,
      type: s.shot_type,
      club: s.club_type,
      lie: s.lie_before,
      result: s.result,
      before: `${s.distance_to_hole_before} ${s.distance_unit_before}`,
      after: `${s.distance_to_hole_after} ${s.distance_unit_after}`
    })));
  }
}

console.log('\n✅ Debug complete!');
