#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const playerId = '5bab961e-4ea4-4c88-812f-68a9469f8156';

console.log('🏌️  Creating comprehensive test round for rinin376@gmail.com...\n');

// Create the round
const { data: round, error: roundError } = await supabase
  .from('golf_rounds')
  .insert({
    player_id: playerId,
    course_name: 'Pebble Beach Golf Links',
    course_city: 'Pebble Beach',
    course_state: 'CA',
    round_date: '2026-01-02',
    total_score: 78,
    total_to_par: 6,
    course_rating: 72.0,
    course_slope: 145,
    tees_played: 'Blue',
    round_type: 'practice',
    starting_hole: 1,
    fairways_hit: 10,
    fairways_total: 14,
    greens_in_regulation: 11,
    greens_total: 18,
    total_putts: 32,
    is_verified: false,
  })
  .select()
  .single();

if (roundError) {
  console.error('❌ Error creating round:', roundError);
  process.exit(1);
}

console.log('✅ Created round:', round.id);

const roundId = round.id;

// Helper to insert hole and shots
async function createHole(holeData, shots) {
  const { data: hole, error: holeError } = await supabase
    .from('golf_holes')
    .insert({
      round_id: roundId,
      hole_number: holeData.number,
      par: holeData.par,
      score: holeData.score,
      score_to_par: holeData.score - holeData.par,
      yardage: holeData.yardage,
      putts: holeData.putts,
      fairway_hit: holeData.fairwayHit,
      green_in_regulation: holeData.gir,
    })
    .select()
    .single();

  if (holeError) {
    console.error(`❌ Error creating hole ${holeData.number}:`, holeError);
    return;
  }

  // Insert shots for this hole
  const shotInserts = shots.map((s) => {
    // Auto-determine club_type based on club and lie
    let club_type;
    if (s.club === 'Driver') {
      club_type = 'driver';
    } else if (s.lie === 'green') {
      club_type = 'putter';
    } else {
      club_type = 'non_driver';
    }

    // Auto-determine shot_type based on lie
    let shot_type;
    if (s.lie === 'green') {
      shot_type = 'putting';
    } else if (s.lie === 'tee') {
      shot_type = 'tee';
    } else if (s.before <= 30 && s.unitBefore !== 'feet') { // Within 30 yards = around green
      shot_type = 'around_green';
    } else {
      shot_type = 'approach';
    }

    return {
      round_id: roundId,
      hole_id: hole.id,
      hole_number: holeData.number,
      shot_number: s.num,
      club_type,
      shot_type,
      shot_distance: s.distance,
      distance_to_hole_before: s.before,
      distance_to_hole_after: s.after,
      distance_unit_before: s.unitBefore || 'yards',
      distance_unit_after: s.unitAfter || 'yards',
      lie_before: s.lie,
      result: s.result,
      miss_direction: s.miss || null,
      is_penalty: s.penalty || false,
      penalty_type: s.penaltyType || null,
      putt_break: s.break || null,
      putt_slope: s.slope || null,
    };
  });

  const { error: shotsError } = await supabase.from('golf_shots').insert(shotInserts);

  if (shotsError) {
    console.error(`❌ Error creating shots for hole ${holeData.number}:`, shotsError);
  } else {
    console.log(`   Hole ${holeData.number}: Par ${holeData.par}, Score ${holeData.score} (${shots.length} shots)`);
  }
}

// Hole 1: Par 4, Score 4
await createHole(
  { number: 1, par: 4, score: 4, yardage: 380, putts: 2, fairwayHit: true, gir: true },
  [
    { num: 1, club: 'Driver', type: 'tee_shot', distance: 260, before: 380, after: 120, lie: 'tee', result: 'fairway' },
    { num: 2, club: '9 Iron', type: 'approach', distance: 118, before: 120, after: 15, unitAfter: 'feet', lie: 'fairway', result: 'green' },
    { num: 3, club: 'Putter', type: 'putt', distance: 15, before: 15, after: 3, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'good' },
    { num: 4, club: 'Putter', type: 'putt', distance: 3, before: 3, after: 0, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'hole' },
  ]
);

// Hole 2: Par 5, Score 5
await createHole(
  { number: 2, par: 5, score: 5, yardage: 505, putts: 2, fairwayHit: true, gir: false },
  [
    { num: 1, club: 'Driver', type: 'tee_shot', distance: 275, before: 505, after: 230, lie: 'tee', result: 'fairway' },
    { num: 2, club: '5 Iron', type: 'fairway', distance: 180, before: 230, after: 50, lie: 'fairway', result: 'fairway' },
    { num: 3, club: 'Gap Wedge', type: 'approach', distance: 48, before: 50, after: 8, unitAfter: 'feet', lie: 'fairway', result: 'green' },
    { num: 4, club: 'Putter', type: 'putt', distance: 8, before: 8, after: 2, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'good' },
    { num: 5, club: 'Putter', type: 'putt', distance: 2, before: 2, after: 0, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'hole' },
  ]
);

// Hole 3: Par 3, Score 3
await createHole(
  { number: 3, par: 3, score: 3, yardage: 188, putts: 2, fairwayHit: null, gir: true },
  [
    { num: 1, club: '5 Iron', type: 'tee_shot', distance: 185, before: 188, after: 22, unitAfter: 'feet', lie: 'tee', result: 'green' },
    { num: 2, club: 'Putter', type: 'putt', distance: 22, before: 22, after: 3, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'good' },
    { num: 3, club: 'Putter', type: 'putt', distance: 3, before: 3, after: 0, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'hole' },
  ]
);

// Hole 4: Par 4, Score 5 (Bogey)
await createHole(
  { number: 4, par: 4, score: 5, yardage: 405, putts: 2, fairwayHit: false, gir: false },
  [
    { num: 1, club: 'Driver', type: 'tee_shot', distance: 240, before: 405, after: 165, lie: 'tee', result: 'poor', miss: 'left' },
    { num: 2, club: '7 Iron', type: 'recovery', distance: 140, before: 165, after: 25, lie: 'rough', result: 'fairway' },
    { num: 3, club: 'Lob Wedge', type: 'chip', distance: 22, before: 25, after: 4, unitAfter: 'feet', lie: 'fringe', result: 'green' },
    { num: 4, club: 'Putter', type: 'putt', distance: 4, before: 4, after: 1, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'good' },
    { num: 5, club: 'Putter', type: 'putt', distance: 1, before: 1, after: 0, unitBefore: 'feet', unitAfter: 'inches', lie: 'green', result: 'hole' },
  ]
);

// Hole 5: Par 4, Score 4
await createHole(
  { number: 5, par: 4, score: 4, yardage: 365, putts: 2, fairwayHit: true, gir: true },
  [
    { num: 1, club: 'Driver', type: 'tee_shot', distance: 265, before: 365, after: 100, lie: 'tee', result: 'fairway' },
    { num: 2, club: 'Pitching Wedge', type: 'approach', distance: 98, before: 100, after: 12, unitAfter: 'feet', lie: 'fairway', result: 'green' },
    { num: 3, club: 'Putter', type: 'putt', distance: 12, before: 12, after: 2, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'good' },
    { num: 4, club: 'Putter', type: 'putt', distance: 2, before: 2, after: 0, unitBefore: 'feet', unitAfter: 'inches', lie: 'green', result: 'hole' },
  ]
);

// Hole 6: Par 5, Score 4 (BIRDIE!)
await createHole(
  { number: 6, par: 5, score: 4, yardage: 525, putts: 1, fairwayHit: true, gir: true },
  [
    { num: 1, club: 'Driver', type: 'tee_shot', distance: 285, before: 525, after: 240, lie: 'tee', result: 'great' },
    { num: 2, club: '3 Wood', type: 'fairway', distance: 215, before: 240, after: 25, lie: 'fairway', result: 'great' },
    { num: 3, club: 'Lob Wedge', type: 'approach', distance: 23, before: 25, after: 6, unitAfter: 'feet', lie: 'fairway', result: 'green' },
    { num: 4, club: 'Putter', type: 'putt', distance: 6, before: 6, after: 0, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'hole' },
  ]
);

// Hole 7: Par 3, Score 4 (Bogey)
await createHole(
  { number: 7, par: 3, score: 4, yardage: 175, putts: 2, fairwayHit: null, gir: false },
  [
    { num: 1, club: '6 Iron', type: 'tee_shot', distance: 172, before: 175, after: 18, lie: 'tee', result: 'poor', miss: 'right' },
    { num: 2, club: 'Sand Wedge', type: 'chip', distance: 16, before: 18, after: 8, unitAfter: 'feet', lie: 'rough', result: 'green' },
    { num: 3, club: 'Putter', type: 'putt', distance: 8, before: 8, after: 2, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'good' },
    { num: 4, club: 'Putter', type: 'putt', distance: 2, before: 2, after: 0, unitBefore: 'feet', unitAfter: 'inches', lie: 'green', result: 'hole' },
  ]
);

// Hole 8: Par 4, Score 4
await createHole(
  { number: 8, par: 4, score: 4, yardage: 395, putts: 1, fairwayHit: true, gir: false },
  [
    { num: 1, club: 'Driver', type: 'tee_shot', distance: 270, before: 395, after: 125, lie: 'tee', result: 'fairway' },
    { num: 2, club: '9 Iron', type: 'approach', distance: 122, before: 125, after: 12, unitAfter: 'feet', lie: 'fairway', result: 'good', miss: 'short' },
    { num: 3, club: 'Putter', type: 'chip', distance: 12, before: 12, after: 2, unitBefore: 'feet', unitAfter: 'feet', lie: 'fringe', result: 'great' },
    { num: 4, club: 'Putter', type: 'putt', distance: 2, before: 2, after: 0, unitBefore: 'feet', unitAfter: 'inches', lie: 'green', result: 'hole' },
  ]
);

// Hole 9: Par 4, Score 5 (Bogey - 3 putt)
await createHole(
  { number: 9, par: 4, score: 5, yardage: 410, putts: 3, fairwayHit: true, gir: false },
  [
    { num: 1, club: 'Driver', type: 'tee_shot', distance: 268, before: 410, after: 142, lie: 'tee', result: 'fairway' },
    { num: 2, club: '8 Iron', type: 'approach', distance: 138, before: 142, after: 35, unitAfter: 'feet', lie: 'fairway', result: 'green' },
    { num: 3, club: 'Putter', type: 'putt', distance: 35, before: 35, after: 8, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'poor', miss: 'long', break: 'left_to_right', slope: 'downhill' },
    { num: 4, club: 'Putter', type: 'putt', distance: 8, before: 8, after: 1, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'good', break: 'right_to_left', slope: 'uphill' },
    { num: 5, club: 'Putter', type: 'putt', distance: 1, before: 1, after: 0, unitBefore: 'feet', unitAfter: 'inches', lie: 'green', result: 'hole' },
  ]
);

// Hole 10: Par 4, Score 4
await createHole(
  { number: 10, par: 4, score: 4, yardage: 380, putts: 2, fairwayHit: true, gir: true },
  [
    { num: 1, club: 'Driver', type: 'tee_shot', distance: 255, before: 380, after: 125, lie: 'tee', result: 'fairway' },
    { num: 2, club: '9 Iron', type: 'approach', distance: 120, before: 125, after: 18, unitAfter: 'feet', lie: 'fairway', result: 'green' },
    { num: 3, club: 'Putter', type: 'putt', distance: 18, before: 18, after: 2, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'good' },
    { num: 4, club: 'Putter', type: 'putt', distance: 2, before: 2, after: 0, unitBefore: 'feet', unitAfter: 'inches', lie: 'green', result: 'hole' },
  ]
);

// Hole 11: Par 5, Score 5
await createHole(
  { number: 11, par: 5, score: 5, yardage: 540, putts: 2, fairwayHit: true, gir: true },
  [
    { num: 1, club: 'Driver', type: 'tee_shot', distance: 272, before: 540, after: 268, lie: 'tee', result: 'fairway' },
    { num: 2, club: '4 Iron', type: 'fairway', distance: 195, before: 268, after: 73, lie: 'fairway', result: 'fairway' },
    { num: 3, club: 'Gap Wedge', type: 'approach', distance: 70, before: 73, after: 20, unitAfter: 'feet', lie: 'fairway', result: 'green' },
    { num: 4, club: 'Putter', type: 'putt', distance: 20, before: 20, after: 3, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'good' },
    { num: 5, club: 'Putter', type: 'putt', distance: 3, before: 3, after: 0, unitBefore: 'feet', unitAfter: 'inches', lie: 'green', result: 'hole' },
  ]
);

// Hole 12: Par 3, Score 2 (BIRDIE!)
await createHole(
  { number: 12, par: 3, score: 2, yardage: 165, putts: 1, fairwayHit: null, gir: true },
  [
    { num: 1, club: '7 Iron', type: 'tee_shot', distance: 162, before: 165, after: 5, unitAfter: 'feet', lie: 'tee', result: 'great' },
    { num: 2, club: 'Putter', type: 'putt', distance: 5, before: 5, after: 0, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'hole' },
  ]
);

// Hole 13: Par 4, Score 4
await createHole(
  { number: 13, par: 4, score: 4, yardage: 392, putts: 2, fairwayHit: false, gir: true },
  [
    { num: 1, club: 'Driver', type: 'tee_shot', distance: 245, before: 392, after: 147, lie: 'tee', result: 'poor', miss: 'left' },
    { num: 2, club: '7 Iron', type: 'recovery', distance: 142, before: 147, after: 16, unitAfter: 'feet', lie: 'rough', result: 'green' },
    { num: 3, club: 'Putter', type: 'putt', distance: 16, before: 16, after: 3, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'good' },
    { num: 4, club: 'Putter', type: 'putt', distance: 3, before: 3, after: 0, unitBefore: 'feet', unitAfter: 'inches', lie: 'green', result: 'hole' },
  ]
);

// Hole 14: Par 4, Score 5 (Bogey)
await createHole(
  { number: 14, par: 4, score: 5, yardage: 405, putts: 2, fairwayHit: false, gir: false },
  [
    { num: 1, club: 'Driver', type: 'tee_shot', distance: 235, before: 405, after: 170, lie: 'tee', result: 'poor', miss: 'right' },
    { num: 2, club: '6 Iron', type: 'recovery', distance: 155, before: 170, after: 15, lie: 'rough', result: 'fairway' },
    { num: 3, club: 'Lob Wedge', type: 'chip', distance: 13, before: 15, after: 5, unitAfter: 'feet', lie: 'fringe', result: 'green' },
    { num: 4, club: 'Putter', type: 'putt', distance: 5, before: 5, after: 1, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'good' },
    { num: 5, club: 'Putter', type: 'putt', distance: 1, before: 1, after: 0, unitBefore: 'feet', unitAfter: 'inches', lie: 'green', result: 'hole' },
  ]
);

// Hole 15: Par 5, Score 6 (Bogey + Penalty)
await createHole(
  { number: 15, par: 5, score: 6, yardage: 515, putts: 2, fairwayHit: true, gir: false },
  [
    { num: 1, club: 'Driver', type: 'tee_shot', distance: 180, before: 515, after: 335, lie: 'tee', result: 'poor', penalty: true, penaltyType: 'water', miss: 'right' },
    { num: 2, club: 'Driver', type: 'tee_shot', distance: 265, before: 515, after: 250, lie: 'tee', result: 'fairway' },
    { num: 3, club: '4 Iron', type: 'fairway', distance: 185, before: 250, after: 65, lie: 'fairway', result: 'fairway' },
    { num: 4, club: 'Sand Wedge', type: 'approach', distance: 60, before: 65, after: 25, unitAfter: 'feet', lie: 'fairway', result: 'green' },
    { num: 5, club: 'Putter', type: 'putt', distance: 25, before: 25, after: 2, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'good' },
    { num: 6, club: 'Putter', type: 'putt', distance: 2, before: 2, after: 0, unitBefore: 'feet', unitAfter: 'inches', lie: 'green', result: 'hole' },
  ]
);

// Hole 16: Par 3, Score 3
await createHole(
  { number: 16, par: 3, score: 3, yardage: 198, putts: 2, fairwayHit: null, gir: true },
  [
    { num: 1, club: '4 Iron', type: 'tee_shot', distance: 195, before: 198, after: 28, unitAfter: 'feet', lie: 'tee', result: 'green' },
    { num: 2, club: 'Putter', type: 'putt', distance: 28, before: 28, after: 3, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'good' },
    { num: 3, club: 'Putter', type: 'putt', distance: 3, before: 3, after: 0, unitBefore: 'feet', unitAfter: 'inches', lie: 'green', result: 'hole' },
  ]
);

// Hole 17: Par 4, Score 4
await createHole(
  { number: 17, par: 4, score: 4, yardage: 372, putts: 2, fairwayHit: true, gir: false },
  [
    { num: 1, club: 'Driver', type: 'tee_shot', distance: 258, before: 372, after: 114, lie: 'tee', result: 'fairway' },
    { num: 2, club: 'Pitching Wedge', type: 'approach', distance: 110, before: 114, after: 10, unitAfter: 'feet', lie: 'fairway', result: 'good', miss: 'short' },
    { num: 3, club: 'Putter', type: 'chip', distance: 10, before: 10, after: 2, unitBefore: 'feet', unitAfter: 'feet', lie: 'fringe', result: 'great' },
    { num: 4, club: 'Putter', type: 'putt', distance: 2, before: 2, after: 0, unitBefore: 'feet', unitAfter: 'inches', lie: 'green', result: 'hole' },
  ]
);

// Hole 18: Par 4, Score 5 (Bogey - 3 putt)
await createHole(
  { number: 18, par: 4, score: 5, yardage: 420, putts: 3, fairwayHit: true, gir: false },
  [
    { num: 1, club: 'Driver', type: 'tee_shot', distance: 272, before: 420, after: 148, lie: 'tee', result: 'fairway' },
    { num: 2, club: '7 Iron', type: 'approach', distance: 143, before: 148, after: 22, unitAfter: 'feet', lie: 'fairway', result: 'green' },
    { num: 3, club: 'Putter', type: 'putt', distance: 22, before: 22, after: 6, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'poor', break: 'left_to_right', slope: 'downhill' },
    { num: 4, club: 'Putter', type: 'putt', distance: 6, before: 6, after: 1, unitBefore: 'feet', unitAfter: 'feet', lie: 'green', result: 'good', break: 'right_to_left', slope: 'uphill' },
    { num: 5, club: 'Putter', type: 'putt', distance: 1, before: 1, after: 0, unitBefore: 'feet', unitAfter: 'inches', lie: 'green', result: 'hole' },
  ]
);

// Verify the round
console.log('\n📊 Verifying round...\n');

const { data: verification } = await supabase
  .from('golf_rounds')
  .select(
    `
    id,
    course_name,
    round_date,
    total_score,
    total_to_par,
    fairways_hit,
    fairways_total,
    greens_in_regulation,
    greens_total,
    total_putts
  `
  )
  .eq('id', roundId)
  .single();

const { count: holesCount } = await supabase
  .from('golf_holes')
  .select('*', { count: 'exact', head: true })
  .eq('round_id', roundId);

const { count: shotsCount } = await supabase
  .from('golf_shots')
  .select('*', { count: 'exact', head: true })
  .eq('round_id', roundId);

console.log('✅ Round Summary:');
console.log(`   Course: ${verification.course_name}`);
console.log(`   Date: ${verification.round_date}`);
console.log(`   Score: ${verification.total_score} (+${verification.total_to_par})`);
console.log(`   Fairways: ${verification.fairways_hit}/${verification.fairways_total}`);
console.log(`   GIR: ${verification.greens_in_regulation}/${verification.greens_total}`);
console.log(`   Putts: ${verification.total_putts}`);
console.log(`   Holes: ${holesCount}/18`);
console.log(`   Total Shots: ${shotsCount}`);
console.log('\n🎉 Test round created successfully!\n');
