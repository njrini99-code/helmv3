#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
);

const PLAYER_ID = '5bab961e-4ea4-4c88-812f-68a9469f8156';

console.log('🔍 CHECKING CALENDAR EVENT TIMES\n');
console.log('='.repeat(80));

// Get player's team
const { data: player } = await supabase
  .from('golf_players')
  .select('team_id')
  .eq('id', PLAYER_ID)
  .single();

if (!player) {
  console.error('❌ Player not found');
  process.exit(1);
}

console.log('\n1️⃣ Player Classes in Database:\n');
const { data: classes } = await supabase
  .from('golf_player_classes')
  .select('*')
  .eq('player_id', PLAYER_ID)
  .order('created_at', { ascending: false })
  .limit(3);

classes?.forEach(cls => {
  console.log(`📚 ${cls.course_code}: ${cls.course_name}`);
  console.log(`   Days: ${cls.days?.join(', ')}`);
  console.log(`   Time: ${cls.start_time} - ${cls.end_time}`);
  console.log(`   Semester: ${cls.semester}`);
  console.log();
});

console.log('\n2️⃣ Calendar Events Created from Classes:\n');
const { data: events } = await supabase
  .from('golf_events')
  .select('*')
  .eq('team_id', player.team_id)
  .eq('event_type', 'class')
  .order('start_date', { ascending: true })
  .limit(5);

events?.forEach(evt => {
  console.log(`📅 ${evt.title}`);
  console.log(`   Date: ${evt.start_date}`);
  console.log(`   Time: ${evt.start_time} - ${evt.end_time}`);
  console.log(`   All Day: ${evt.all_day}`);
  console.log(`   Class ID: ${evt.class_id}`);
  console.log();
});

console.log('\n3️⃣ Time Comparison:\n');

// Match classes to events
if (classes && events) {
  classes.forEach(cls => {
    const relatedEvents = events.filter(e => e.class_id === cls.id);
    if (relatedEvents.length > 0) {
      console.log(`Class: ${cls.course_code}`);
      console.log(`  Class time: ${cls.start_time} - ${cls.end_time}`);
      console.log(`  Event time: ${relatedEvents[0].start_time} - ${relatedEvents[0].end_time}`);
      
      const timesMatch = cls.start_time === relatedEvents[0].start_time && 
                        cls.end_time === relatedEvents[0].end_time;
      console.log(`  Times match: ${timesMatch ? '✅' : '❌'}`);
      console.log();
    }
  });
}

console.log('='.repeat(80));
console.log();
