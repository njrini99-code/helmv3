#!/usr/bin/env node
/**
 * MANUALLY SYNC CLASSES TO CALENDAR
 * Recreates all calendar events for existing classes
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('📅 MANUALLY SYNCING CLASSES TO CALENDAR\n');
console.log('='.repeat(80));

// Get player
const { data: player } = await supabase
  .from('golf_players')
  .select('id, team_id, first_name, last_name')
  .eq('email', 'rinin376@gmail.com')
  .single();

console.log('\nPlayer:', player.first_name, player.last_name);
console.log('Player ID:', player.id);
console.log('Team ID:', player.team_id);

// Get team coach
const { data: coach } = await supabase
  .from('golf_coaches')
  .select('id, full_name')
  .eq('team_id', player.team_id)
  .limit(1)
  .single();

console.log('Coach:', coach.full_name);
console.log('Coach ID:', coach.id);

// Get all classes
const { data: classes } = await supabase
  .from('golf_player_classes')
  .select('*')
  .eq('player_id', player.id);

console.log(`\nFound ${classes.length} classes to sync\n`);

// Parse semester dates
function parseSemester(semester) {
  const match = semester.match(/(Fall|Spring|Summer|Winter)\s+(\d{4})/i);
  if (!match) return null;

  const term = match[1].toLowerCase();
  const year = parseInt(match[2]);

  switch (term) {
    case 'spring':
      return { start: `${year}-01-15`, end: `${year}-05-15` };
    case 'summer':
      return { start: `${year}-06-01`, end: `${year}-08-15` };
    case 'fall':
      return { start: `${year}-08-20`, end: `${year}-12-15` };
    case 'winter':
      return { start: `${year}-12-15`, end: `${year + 1}-01-15` };
    default:
      return null;
  }
}

// Get day of week number
function getDayOfWeek(day) {
  const days = {
    'M': 1, 'T': 2, 'W': 3, 'Th': 4, 'F': 5
  };
  return days[day] || 1;
}

// Get first occurrence date
function getFirstOccurrence(startDate, dayOfWeek) {
  const date = new Date(startDate);
  const currentDay = date.getDay();
  let daysToAdd = dayOfWeek - currentDay;
  if (daysToAdd < 0) daysToAdd += 7;
  date.setDate(date.getDate() + daysToAdd);
  return date.toISOString().split('T')[0];
}

// Delete existing calendar events for these classes
console.log('Cleaning up old events...');
await supabase
  .from('golf_events')
  .delete()
  .in('class_id', classes.map(c => c.id));

let eventsCreated = 0;
let errors = [];

// Sync each class
for (const cls of classes) {
  console.log(`\nSyncing: ${cls.course_code} - ${cls.course_name}`);

  const semesterDates = parseSemester(cls.semester);
  if (!semesterDates) {
    console.log('  ⚠️  Could not parse semester:', cls.semester);
    errors.push(`${cls.course_code}: Invalid semester format`);
    continue;
  }

  console.log(`  Semester: ${semesterDates.start} to ${semesterDates.end}`);
  console.log(`  Days: ${cls.days.join(', ')}`);

  // Create one event per day
  for (const day of cls.days) {
    const dayNum = getDayOfWeek(day);
    const firstOccurrence = getFirstOccurrence(semesterDates.start, dayNum);

    const event = {
      team_id: player.team_id,
      title: `${cls.course_code}: ${cls.course_name}`,
      event_type: 'class',
      start_date: firstOccurrence,
      end_date: semesterDates.end,
      start_time: cls.start_time,
      end_time: cls.end_time,
      all_day: false,
      location: [cls.building, cls.room].filter(Boolean).join(' - ') || cls.location || null,
      description: [
        cls.instructor && `Instructor: ${cls.instructor}`,
        cls.credits && `Credits: ${cls.credits}`,
        cls.notes,
      ].filter(Boolean).join('\n') || null,
      is_mandatory: false,
      created_by: coach.id,
      class_id: cls.id,
    };

    console.log(`  Creating event for ${day} starting ${firstOccurrence}...`);

    const { error } = await supabase
      .from('golf_events')
      .insert(event);

    if (error) {
      console.log(`  ❌ Error:`, error.message);
      errors.push(`${cls.course_code} (${day}): ${error.message}`);
    } else {
      console.log(`  ✅ Created`);
      eventsCreated++;
    }
  }
}

// Summary
console.log('\n' + '='.repeat(80));
console.log('📊 SYNC SUMMARY');
console.log('='.repeat(80));
console.log(`Classes processed: ${classes.length}`);
console.log(`Events created: ${eventsCreated}`);
console.log(`Errors: ${errors.length}`);

if (errors.length > 0) {
  console.log('\n❌ ERRORS:\n');
  errors.forEach((e, i) => console.log(`${i + 1}. ${e}`));
} else {
  console.log('\n✅ ALL CLASSES SYNCED SUCCESSFULLY!');
  console.log('\nCheck your calendar at: /golf/dashboard/calendar');
}

console.log();
