#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { calculateStatsFromShots } from './src/lib/utils/golf-stats-calculator-shots.ts';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const playerId = '5bab961e-4ea4-4c88-812f-68a9469f8156';

console.log('🧮 ACTUALLY RUNNING STATS CALCULATOR...\n');

// Get data exactly like stats page does
const { data: roundsData } = await supabase
  .from('golf_rounds')
  .select('id, round_date, course_name, round_type, total_score, total_to_par')
  .eq('player_id', playerId)
  .order('round_date', { ascending: false });

const roundIds = roundsData?.map(r => r.id) || [];

const { data: holesData } = await supabase
  .from('golf_holes')
  .select('id, round_id, hole_number, par, yardage')
  .in('round_id', roundIds);

const { data: shotsData } = await supabase
  .from('golf_shots')
  .select('*')
  .in('round_id', roundIds)
  .order('hole_number')
  .order('shot_number');

// Transform exactly like stats page
const roundsInfo = (roundsData || []).map(r => ({
  id: r.id,
  round_date: r.round_date,
  course_name: r.course_name,
  round_type: r.round_type,
}));

const holesInfo = (holesData || []).map(h => ({
  id: h.id,
  round_id: h.round_id,
  hole_number: h.hole_number,
  par: h.par,
  yardage: h.yardage,
}));

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

console.log(`Inputs: ${roundsInfo.length} rounds, ${holesInfo.length} holes, ${shots.length} shots\n`);

// ACTUALLY CALCULATE
try {
  const stats = calculateStatsFromShots(shots, holesInfo, roundsInfo);

  console.log('✅ STATS CALCULATED!\n');
  console.log('KEY STATS:');
  console.log(`  Rounds Played: ${stats.roundsPlayed}`);
  console.log(`  Scoring Average: ${stats.scoringAverage}`);
  console.log(`  Driving Distance: ${stats.drivingDistanceAvg} yards`);
  console.log(`  Fairway %: ${stats.fairwayPercentage}%`);
  console.log(`  GIR %: ${stats.girPercentage}%`);
  console.log(`  Approach Proximity: ${stats.approachProximityAvg} feet`);
  console.log(`  Scrambling %: ${stats.scramblingPercentage}%`);
  console.log(`  Putts/Round: ${stats.puttsPerRound}`);
  console.log(`  Total Putts: ${stats.totalPutts}`);

  console.log('\n✅ Stats are working! Check browser console for errors.');

} catch (error) {
  console.error('❌ ERROR CALCULATING STATS:');
  console.error(error);
}
