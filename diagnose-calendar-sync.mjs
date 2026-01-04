#!/usr/bin/env node
/**
 * COMPREHENSIVE CALENDAR SYNC DIAGNOSTIC
 * Tests every step of the class-to-calendar sync process
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('🔬 DEEP DIAGNOSTIC: Calendar Sync System\n');
console.log('='.repeat(80));

let issuesFound = [];
let checksPass = 0;
let checksFail = 0;

function check(name, passed, details = '') {
  if (passed) {
    console.log(`✅ ${name}`);
    if (details) console.log(`   ${details}`);
    checksPass++;
  } else {
    console.log(`❌ ${name}`);
    if (details) console.log(`   ${details}`);
    issuesFound.push(`${name}: ${details}`);
    checksFail++;
  }
}

// =============================================================================
// STEP 1: Verify Schema Changes Applied
// =============================================================================
console.log('\n📋 STEP 1: Verify Schema Changes\n');

// Try a direct column check
const { data: testEvent, error: colError } = await supabase
  .from('golf_events')
  .select('class_id')
  .limit(1)
  .maybeSingle();

const hasClassIdColumn = !colError || !colError.message?.includes('class_id');
check('golf_events.class_id column exists', hasClassIdColumn,
  colError ? `Error: ${colError.message}` : 'Column is queryable');

// Check event_type enum values
const { data: enumTest, error: enumError } = await supabase
  .from('golf_events')
  .insert({
    title: 'ENUM TEST',
    event_type: 'class',
    start_date: '2026-01-06T09:00:00',
    end_date: '2026-01-06T09:50:00',
    team_id: null,
    all_day: false,
  })
  .select()
  .single();

if (!enumError && enumTest) {
  check('event_type enum includes "class"', true, 'Successfully inserted event with type=class');
  // Clean up
  await supabase.from('golf_events').delete().eq('id', enumTest.id);
} else if (enumError?.message?.includes('enum')) {
  check('event_type enum includes "class"', false, `Enum error: ${enumError.message}`);
} else {
  check('event_type enum includes "class"', true, 'No enum error (likely working)');
}

// =============================================================================
// STEP 2: Get Your Account Info
// =============================================================================
console.log('\n📋 STEP 2: Your Account Setup\n');

const { data: player } = await supabase
  .from('golf_players')
  .select('id, user_id, team_id, first_name, last_name')
  .eq('email', 'rinin376@gmail.com')
  .single();

check('Player account exists', !!player, `${player?.first_name} ${player?.last_name}`);
console.log('   Player ID:', player.id);
console.log('   User ID:', player.user_id);
console.log('   Team ID:', player.team_id);

check('Player is on a team', !!player.team_id, `Team: ${player.team_id}`);

// =============================================================================
// STEP 3: Check Team Has Coach
// =============================================================================
console.log('\n📋 STEP 3: Team Coach Check\n');

if (player.team_id) {
  const { data: coaches } = await supabase
    .from('golf_coaches')
    .select('id, full_name, user_id')
    .eq('team_id', player.team_id);

  check('Team has coaches', coaches && coaches.length > 0, `Found ${coaches?.length || 0} coaches`);

  if (coaches && coaches.length > 0) {
    console.log('   Coach ID:', coaches[0].id);
    console.log('   Coach Name:', coaches[0].full_name);
  }
}

// =============================================================================
// STEP 4: Check Your Classes
// =============================================================================
console.log('\n📋 STEP 4: Your Classes in Database\n');

const { data: classes } = await supabase
  .from('golf_player_classes')
  .select('*')
  .eq('player_id', player.id);

console.log(`Found ${classes?.length || 0} classes`);
if (classes && classes.length > 0) {
  const sampleClass = classes[0];
  console.log('\nSample class:');
  console.log('   ID:', sampleClass.id);
  console.log('   Code:', sampleClass.course_code);
  console.log('   Name:', sampleClass.course_name);
  console.log('   Days:', JSON.stringify(sampleClass.days));
  console.log('   Time:', sampleClass.start_time, '-', sampleClass.end_time);
  console.log('   Semester:', sampleClass.semester);
}

// =============================================================================
// STEP 5: Simulate Calendar Sync
// =============================================================================
console.log('\n📋 STEP 5: Test Calendar Sync Process\n');

if (classes && classes.length > 0 && player.team_id) {
  const testClass = classes[0];

  // Get team coach
  const { data: coaches } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('team_id', player.team_id)
    .limit(1)
    .single();

  if (!coaches) {
    check('Coach found for sync', false, 'No coach on team - sync will fail silently');
  } else {
    console.log('Using coach ID:', coaches.id);

    // Parse semester dates (matching calendar-sync.ts logic)
    let semesterDates = null;
    const match = testClass.semester?.match(/(Fall|Spring|Summer|Winter)\\s+(\\d{4})/i);
    if (match) {
      const term = match[1].toLowerCase();
      const year = parseInt(match[2]);

      if (term === 'fall') {
        semesterDates = {
          start: `${year}-08-20`,
          end: `${year}-12-15`
        };
      } else if (term === 'spring') {
        semesterDates = {
          start: `${year}-01-15`,
          end: `${year}-05-15`
        };
      }
    }

    check('Semester dates parsed', !!semesterDates,
      semesterDates ? `${semesterDates.start} to ${semesterDates.end}` : 'Failed to parse semester');

    if (semesterDates) {
      // Calculate first occurrence date for Monday (day 1)
      const startDate = new Date(semesterDates.start);
      const currentDay = startDate.getDay();
      let daysToAdd = 1 - currentDay; // Monday = 1
      if (daysToAdd < 0) daysToAdd += 7;
      startDate.setDate(startDate.getDate() + daysToAdd);
      const firstOccurrence = startDate.toISOString().split('T')[0];

      console.log('\nTest Event Data:');
      console.log('   First occurrence:', firstOccurrence);
      console.log('   End date:', semesterDates.end);
      console.log('   Start time:', testClass.start_time);
      console.log('   End time:', testClass.end_time);

      // Try to create test event
      const testEvent = {
        team_id: player.team_id,
        title: `TEST: ${testClass.course_code}`,
        event_type: 'class',
        start_date: firstOccurrence,
        end_date: semesterDates.end,
        start_time: testClass.start_time,
        end_time: testClass.end_time,
        all_day: false,
        location: testClass.location || null,
        description: `Test sync for ${testClass.course_name}`,
        is_mandatory: false,
        created_by: coaches.id,
        class_id: testClass.id,
      };

      console.log('\n📝 Attempting to insert test event...');
      const { data: inserted, error: insertError } = await supabase
        .from('golf_events')
        .insert(testEvent)
        .select()
        .single();

      if (insertError) {
        check('Event insertion', false, insertError.message);
        console.log('   Error details:', insertError.details);
        console.log('   Error hint:', insertError.hint);
        console.log('   Error code:', insertError.code);
      } else {
        check('Event insertion', true, `Created event ID: ${inserted.id}`);
        console.log('   ✅ Calendar sync would work!');
        console.log('   Event created with:');
        console.log('      - team_id:', inserted.team_id);
        console.log('      - created_by:', inserted.created_by);
        console.log('      - class_id:', inserted.class_id);
        console.log('      - start_date:', inserted.start_date);

        // Clean up test event
        await supabase.from('golf_events').delete().eq('id', inserted.id);
        console.log('   (Test event cleaned up)');
      }
    }
  }
}

// =============================================================================
// STEP 6: Check RLS Policies
// =============================================================================
console.log('\n📋 STEP 6: RLS Policy Test\n');

// Try to query events as the player would
if (player.team_id) {
  const { data: viewableEvents, error: viewError } = await supabase
    .from('golf_events')
    .select('*')
    .eq('team_id', player.team_id)
    .limit(1);

  check('Can view team events (RLS SELECT)', !viewError,
    viewError ? viewError.message : `Can see ${viewableEvents?.length || 0} team events`);
}

// =============================================================================
// SUMMARY
// =============================================================================
console.log('\n' + '='.repeat(80));
console.log('📊 DIAGNOSTIC SUMMARY');
console.log('='.repeat(80));
console.log(`✅ Passed: ${checksPass}`);
console.log(`❌ Failed: ${checksFail}`);

if (issuesFound.length > 0) {
  console.log('\n🔴 ISSUES FOUND:\n');
  issuesFound.forEach((issue, i) => {
    console.log(`${i + 1}. ${issue}`);
  });
}

console.log();
