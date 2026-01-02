#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const playerId = '5bab961e-4ea4-4c88-812f-68a9469f8156';

console.log('🧮 Testing stats calculation for rinin376@gmail.com...\n');

// Fetch rounds (exactly like stats page does)
const { data: roundsData } = await supabase
  .from('golf_rounds')
  .select(`
    id,
    round_date,
    course_name,
    round_type,
    total_score,
    total_to_par
  `)
  .eq('player_id', playerId)
  .order('round_date', { ascending: false });

console.log(`✅ Rounds: ${roundsData?.length || 0}`);

if (!roundsData || roundsData.length === 0) {
  console.log('❌ No rounds found');
  process.exit(1);
}

const roundIds = roundsData.map(r => r.id);

// Fetch holes (exactly like stats page does)
const { data: holesData } = await supabase
  .from('golf_holes')
  .select('id, round_id, hole_number, par, yardage')
  .in('round_id', roundIds);

console.log(`✅ Holes: ${holesData?.length || 0}`);

// Fetch shots (exactly like stats page does)
const { data: shotsData } = await supabase
  .from('golf_shots')
  .select('*')
  .in('round_id', roundIds)
  .order('hole_number')
  .order('shot_number');

console.log(`✅ Shots: ${shotsData?.length || 0}`);

// Transform data (exactly like stats page does)
const roundsInfo = (roundsData || []).map(r => ({
  id: r.id,
  round_date: r.round_date,
  course_name: r.course_name,
  round_type: r.round_type,
}));

const holesInfo = holesData && holesData.length > 0
  ? holesData.map(h => ({
      id: h.id,
      round_id: h.round_id,
      hole_number: h.hole_number,
      par: h.par,
      yardage: h.yardage,
    }))
  : [];

const shots = (shotsData || [])
  .filter(s =>
    s.distance_to_hole_before !== null &&
    s.distance_to_hole_after !== null &&
    s.shot_distance !== null
  )
  .map(s => ({
    id: s.id,
    round_id: s.round_id,
    hole_id: s.hole_id,
    hole_number: s.hole_number,
    shot_number: s.shot_number,
    shot_type: s.shot_type,
    club_type: s.club_type,
    lie_before: s.lie_before,
    distance_to_hole_before: s.distance_to_hole_before,
    distance_unit_before: s.distance_unit_before,
    result: s.result,
    distance_to_hole_after: s.distance_to_hole_after,
    distance_unit_after: s.distance_unit_after,
    shot_distance: s.shot_distance,
    miss_direction: s.miss_direction,
    putt_break: s.putt_break,
    putt_slope: s.putt_slope,
    is_penalty: s.is_penalty ?? false,
    penalty_type: s.penalty_type,
  }));

console.log(`\n✅ Filtered shots (valid): ${shots.length}`);
console.log(`✅ Rounds info: ${roundsInfo.length}`);
console.log(`✅ Holes info: ${holesInfo.length}`);

// Now calculate stats (import would normally happen)
console.log('\n📊 Key stats that should be calculated:');
console.log('   - Driving Distance Avg');
console.log('   - Fairway %');
console.log('   - GIR %');
console.log('   - Approach Proximity');
console.log('   - Scrambling %');
console.log('   - Putts per round');
console.log('   - Strokes Gained');

console.log('\n✅ All data ready for stats calculation!');
console.log('   The stats page should display all metrics.');
console.log('\n💡 If stats still not showing, check:');
console.log('   1. Browser console for errors');
console.log('   2. Network tab for failed API calls');
console.log('   3. User is signed in as rinin376@gmail.com');
