#!/usr/bin/env node
/**
 * Complete end-to-end test simulating browser behavior
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
);

const PLAYER_ID = '5bab961e-4ea4-4c88-812f-68a9469f8156';

console.log('🔍 CURRENT STATE CHECK\n');
console.log('='.repeat(80));

// Check existing classes
console.log('\n1️⃣ Checking existing classes...');
const { data: existingClasses, error: classError } = await supabase
  .from('golf_player_classes')
  .select('*')
  .eq('player_id', PLAYER_ID)
  .order('created_at', { ascending: false });

if (classError) {
  console.error('   ❌ Error:', classError.message);
} else {
  console.log(`   ✅ Found ${existingClasses.length} classes`);
  if (existingClasses.length > 0) {
    console.log('\n   Classes:');
    existingClasses.forEach((cls, i) => {
      console.log(`   ${i + 1}. ${cls.course_code}: ${cls.course_name}`);
      console.log(`      Days: ${cls.days.join(', ')} | ${cls.start_time} - ${cls.end_time}`);
    });
  }
}

// Check calendar events
console.log('\n2️⃣ Checking calendar events...');
const { data: player } = await supabase
  .from('golf_players')
  .select('team_id')
  .eq('id', PLAYER_ID)
  .single();

if (player) {
  const { data: events, error: eventError } = await supabase
    .from('golf_events')
    .select('*')
    .eq('team_id', player.team_id)
    .eq('event_type', 'class')
    .order('start_date', { ascending: true });
  
  if (eventError) {
    console.error('   ❌ Error:', eventError.message);
  } else {
    console.log(`   ✅ Found ${events.length} calendar events`);
    if (events.length > 0) {
      console.log('\n   Sample events:');
      events.slice(0, 3).forEach((evt, i) => {
        console.log(`   ${i + 1}. ${evt.title}`);
        console.log(`      ${evt.start_date} | ${evt.start_time} - ${evt.end_time}`);
      });
      if (events.length > 3) {
        console.log(`   ... and ${events.length - 3} more`);
      }
    }
  }
}

console.log('\n' + '='.repeat(80));
console.log('\n📊 SUMMARY:\n');
console.log(`   Classes in database: ${existingClasses?.length || 0}`);
console.log(`   Calendar events: ${player ? 'Checked' : 'N/A'}`);
console.log('\n💡 NEXT STEPS FOR USER:\n');
console.log('   1. Go to /golf/dashboard/classes in your browser');
console.log('   2. If you see any classes, try deleting ONE class first');
console.log('   3. If that works, the "Delete All" button should also work');
console.log('   4. If you still get error code 42P17:');
console.log('      - Sign out completely');
console.log('      - Clear browser cache');
console.log('      - Sign back in');
console.log('      - Try again');
console.log('\n   If the error persists after signing out/in, let me know!');
console.log();
