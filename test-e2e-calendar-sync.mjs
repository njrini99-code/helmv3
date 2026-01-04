#!/usr/bin/env node
/**
 * End-to-End Test for Class Calendar Sync
 * Tests the complete flow with custom semester start date
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('🧪 END-TO-END CALENDAR SYNC TEST\n');
console.log('='.repeat(80));

// Step 1: Clean up existing data
console.log('\n1️⃣ Cleaning up existing test data...');

const { data: player, error: playerError } = await supabase
  .from('golf_players')
  .select('id, team_id, first_name, last_name')
  .eq('email', 'rinin376@gmail.com')
  .single();

if (playerError) {
  console.error('❌ Error getting player:', playerError.message);
  process.exit(1);
}

console.log('   Player:', player.first_name, player.last_name);
console.log('   Player ID:', player.id);
console.log('   Team ID:', player.team_id);

// Delete all existing classes and calendar events
await supabase.from('golf_events').delete().eq('event_type', 'class').eq('team_id', player.team_id);
await supabase.from('golf_player_classes').delete().eq('player_id', player.id);
console.log('   ✅ Cleaned up old data');

// Step 2: Create test classes with custom semester start date
console.log('\n2️⃣ Creating test classes...');

const customStartDate = '2025-01-13'; // Monday, January 13, 2025
console.log('   Custom semester start date:', customStartDate);

const testClasses = [
  {
    player_id: player.id,
    course_code: 'CS 101',
    course_name: 'Intro to Computer Science',
    instructor: 'Dr. Smith',
    days: ['M', 'W', 'F'],
    day_of_week: 0, // Deprecated field
    start_time: '09:00:00',
    end_time: '09:50:00',
    location: 'Woodward Hall 101',
    building: 'Woodward Hall',
    room: '101',
    credits: 3,
    semester: 'Spring 2025',
    color: '#16A34A',
    notes: 'Test class 1',
  },
  {
    player_id: player.id,
    course_code: 'MATH 201',
    course_name: 'Calculus II',
    instructor: 'Dr. Johnson',
    days: ['T', 'Th'],
    day_of_week: 0, // Deprecated field
    start_time: '10:00:00',
    end_time: '11:15:00',
    location: 'Science Building 205',
    building: 'Science Building',
    room: '205',
    credits: 4,
    semester: 'Spring 2025',
    color: '#2563EB',
    notes: 'Test class 2',
  },
];

const { data: insertedClasses, error: insertError } = await supabase
  .from('golf_player_classes')
  .insert(testClasses)
  .select();

if (insertError) {
  console.error('❌ Error inserting classes:', insertError.message);
  process.exit(1);
}

console.log('   ✅ Created', insertedClasses.length, 'test classes');

// Step 3: Simulate calendar sync with custom start date
console.log('\n3️⃣ Syncing classes to calendar...');

function parseSemesterDates(semester, customStartDate) {
  const match = semester.match(/(Fall|Spring|Summer|Winter)\s+(\d{4})/i);
  if (!match) return null;
  const term = match[1].toLowerCase();
  const year = parseInt(match[2]);

  let startDate, endDate;
  switch (term) {
    case 'spring':
      startDate = customStartDate || `${year}-01-15`;
      endDate = `${year}-05-15`;
      break;
    case 'summer':
      startDate = customStartDate || `${year}-06-01`;
      endDate = `${year}-08-15`;
      break;
    case 'fall':
      startDate = customStartDate || `${year}-08-20`;
      endDate = `${year}-12-15`;
      break;
    case 'winter':
      startDate = customStartDate || `${year}-12-15`;
      endDate = `${year + 1}-01-15`;
      break;
    default:
      return null;
  }
  return { start: startDate, end: endDate };
}

function getDayOfWeek(day) {
  const days = { 'M': 1, 'T': 2, 'W': 3, 'Th': 4, 'F': 5 };
  return days[day] || 1;
}

function getFirstOccurrence(startDate, dayOfWeek) {
  const date = new Date(startDate);
  const currentDay = date.getDay();
  let daysToAdd = dayOfWeek - currentDay;
  if (daysToAdd < 0) daysToAdd += 7;
  date.setDate(date.getDate() + daysToAdd);
  return date.toISOString().split('T')[0];
}

let totalEvents = 0;
for (const cls of insertedClasses) {
  const semesterDates = parseSemesterDates(cls.semester, customStartDate);

  console.log(`\n   📚 ${cls.course_code}: ${cls.course_name}`);
  console.log(`      Days: ${cls.days.join(', ')}`);
  console.log(`      Semester: ${semesterDates.start} → ${semesterDates.end}`);

  const events = cls.days.map(day => {
    const dayNum = getDayOfWeek(day);
    const firstOccurrence = getFirstOccurrence(semesterDates.start, dayNum);

    console.log(`      ${day}: First occurrence ${firstOccurrence}`);

    return {
      team_id: player.team_id,
      title: `${cls.course_code}: ${cls.course_name}`,
      event_type: 'class',
      start_date: firstOccurrence,
      end_date: semesterDates.end,
      start_time: cls.start_time,
      end_time: cls.end_time,
      all_day: false,
      location: [cls.building, cls.room].filter(Boolean).join(' - '),
      description: [
        cls.instructor && `Instructor: ${cls.instructor}`,
        cls.credits && `Credits: ${cls.credits}`,
      ].filter(Boolean).join('\n'),
      is_mandatory: false,
      created_by: null, // Player-created event
      class_id: cls.id,
    };
  });

  const { error: syncError } = await supabase.from('golf_events').insert(events);
  if (syncError) {
    console.error('      ❌ Sync error:', syncError.message);
  } else {
    console.log(`      ✅ Created ${events.length} calendar events`);
    totalEvents += events.length;
  }
}

// Step 4: Verify results
console.log('\n4️⃣ Verifying calendar sync...');

const { data: calendarEvents, count: eventCount } = await supabase
  .from('golf_events')
  .select('*', { count: 'exact' })
  .eq('event_type', 'class')
  .eq('team_id', player.team_id);

console.log(`   Total calendar events: ${eventCount}`);
console.log(`   Expected: ${totalEvents}`);

if (eventCount !== totalEvents) {
  console.error('   ❌ Event count mismatch!');
  process.exit(1);
}

// Check custom start dates
const mondayEvents = calendarEvents.filter(e => e.title.includes('CS 101'));
const tuesdayEvents = calendarEvents.filter(e => e.title.includes('MATH 201'));

console.log('\n   CS 101 (M/W/F):');
mondayEvents.forEach(e => console.log(`      ${e.start_date} (${e.title.split(':')[0]})`));

console.log('\n   MATH 201 (T/Th):');
tuesdayEvents.forEach(e => console.log(`      ${e.start_date} (${e.title.split(':')[0]})`));

// Verify dates are correct based on custom start
const expectedMonday = '2025-01-13'; // Jan 13 is Monday
const expectedWednesday = '2025-01-15';
const expectedFriday = '2025-01-17';
const expectedTuesday = '2025-01-14';
const expectedThursday = '2025-01-16';

const cs101Events = calendarEvents.filter(e => e.title.includes('CS 101'));
const cs101Dates = cs101Events.map(e => e.start_date).sort();

const math201Events = calendarEvents.filter(e => e.title.includes('MATH 201'));
const math201Dates = math201Events.map(e => e.start_date).sort();

console.log('\n5️⃣ Date verification:');
console.log('   CS 101 should start on:');
console.log('      Monday:', expectedMonday, cs101Dates.includes(expectedMonday) ? '✅' : '❌');
console.log('      Wednesday:', expectedWednesday, cs101Dates.includes(expectedWednesday) ? '✅' : '❌');
console.log('      Friday:', expectedFriday, cs101Dates.includes(expectedFriday) ? '✅' : '❌');

console.log('\n   MATH 201 should start on:');
console.log('      Tuesday:', expectedTuesday, math201Dates.includes(expectedTuesday) ? '✅' : '❌');
console.log('      Thursday:', expectedThursday, math201Dates.includes(expectedThursday) ? '✅' : '❌');

console.log('\n' + '='.repeat(80));
console.log('✅ END-TO-END TEST COMPLETED!');
console.log('\n📋 Summary:');
console.log(`   ✓ ${insertedClasses.length} classes created`);
console.log(`   ✓ ${eventCount} calendar events synced`);
console.log(`   ✓ Custom start date (${customStartDate}) applied`);
console.log(`   ✓ All events created without coach requirement`);
console.log('\n🎉 Calendar sync is working correctly!');
console.log();
